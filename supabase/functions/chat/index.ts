import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://english-repititor.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const GLOBAL_DAILY_LIMIT = Number(Deno.env.get('GLOBAL_DAILY_LIMIT') || '2000');
const MAX_PAYLOAD_CHARS = 20000;
const MAX_AUDIO_B64 = 2_000_000; // ~1.5MB; ~60s opus is enough
const ALLOWED_AUDIO_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

function corsFor(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(obj: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { userId, system, messages, mode, profile, audio } = await req.json();
    if (!userId || typeof userId !== 'string') return json({ error: 'no_user', message: 'userId kerak' }, 400, cors);
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'bad_input', message: "Xabar bo'sh" }, 400, cors);

    const payloadSize = (typeof system === 'string' ? system.length : 0) + JSON.stringify(messages).length;
    if (payloadSize > MAX_PAYLOAD_CHARS) return json({ error: 'too_large', message: 'Xabar juda uzun' }, 413, cors);

    // Optional voice message validation
    let hasAudio = false;
    if (audio && typeof audio === 'object') {
      if (typeof audio.data !== 'string' || typeof audio.mimeType !== 'string') {
        return json({ error: 'bad_audio', message: "Ovoz formati noto'g'ri" }, 400, cors);
      }
      const baseMime = audio.mimeType.split(';')[0].trim();
      if (!ALLOWED_AUDIO_MIME.includes(baseMime)) {
        return json({ error: 'bad_audio', message: "Ovoz formati qo'llab-quvvatlanmaydi" }, 400, cors);
      }
      if (audio.data.length > MAX_AUDIO_B64) {
        return json({ error: 'audio_large', message: 'Ovoz juda uzun. Qisqaroq gapiring.' }, 413, cors);
      }
      hasAudio = true;
    }

    const since = new Date(); since.setHours(0, 0, 0, 0);

    const { count: globalToday } = await db.from('usage').select('*', { count: 'exact', head: true })
      .gte('created_at', since.toISOString());
    if ((globalToday ?? 0) >= GLOBAL_DAILY_LIMIT) {
      return json({ error: 'busy', message: "Tizim bugun band. Ertaga qayta urinib ko'ring." }, 429, cors);
    }

    await db.from('users').upsert({
      id: userId,
      name: profile?.name ?? null,
      level: profile?.level ?? null,
      goal: profile?.goal ?? null,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'id' });

    const { data: s } = await db.from('app_secrets').select('*').eq('id', 1).single();
    if (!s) return json({ error: 'no_config', message: 'Sozlama topilmadi' }, 500, cors);

    // Per-user override takes precedence; null falls back to the global default.
    const { data: u } = await db.from('users').select('daily_limit').eq('id', userId).single();
    const effectiveLimit = (u?.daily_limit ?? null) !== null ? Number(u!.daily_limit) : Number(s.daily_limit);

    const { count } = await db.from('usage').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', since.toISOString());
    if ((count ?? 0) >= effectiveLimit) {
      return json({ error: 'limit', message: "Bugungi limit tugadi. Ertaga qayta urinib ko'ring." }, 429, cors);
    }

    // Audio messages require Gemini (Claude has no audio input). Route to Gemini regardless of active_provider.
    const provider = hasAudio ? 'gemini' : s.active_provider;
    let text = '';

    if (provider === 'claude') {
      if (!s.claude_key) return json({ error: 'no_key', message: 'Admin Claude kalitini kiritmagan.' }, 503, cors);
      const model = String(s.model || '').startsWith('claude') ? s.model : 'claude-sonnet-4-6';
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': s.claude_key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1000, system, messages }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: 'ai', message: d.error?.message || 'AI xatosi' }, 502, cors);
      text = d.content?.[0]?.text || '';
    } else {
      if (!s.gemini_key) {
        const msg = hasAudio ? 'Ovozli xabar uchun Gemini kerak. Admin Gemini kalitini kiritmagan.' : 'Admin Gemini kalitini kiritmagan.';
        return json({ error: 'no_key', message: msg }, 503, cors);
      }
      const model = String(s.model || '').startsWith('gemini') ? s.model : 'gemini-2.5-flash';
      const contents = (messages || []).map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      let sys = system;
      if (hasAudio) {
        // Attach audio to the last user content; ensure a meaningful text prompt exists.
        const lastUser = [...contents].reverse().find((c) => c.role === 'user');
        const target = lastUser || (contents.push({ role: 'user', parts: [{ text: 'Please assess my spoken English.' }] }), contents[contents.length - 1]);
        if (!target.parts[0]?.text || target.parts[0].text.trim() === '' || target.parts[0].text.includes('Ovozli xabar')) {
          target.parts[0] = { text: 'Please assess my spoken English from the audio.' };
        }
        target.parts.push({ inline_data: { mime_type: audio.mimeType.split(';')[0].trim(), data: audio.data } });
        sys = `${system}\n\nThe user sent a VOICE message (audio attached). First transcribe what they said, then assess pronunciation, fluency and grammar. Give concrete corrections in the standard format. If the goal is IELTS, also give a Speaking band as "\u{1F3AF} Band: X.X".`;
      }

      const isVertex = String(s.gemini_key).startsWith('AQ.');
      const url = isVertex
        ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${s.gemini_key}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.gemini_key}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents, generationConfig: { maxOutputTokens: 1000 } }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: 'ai', message: d.error?.message || 'AI xatosi' }, 502, cors);
      text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    await db.from('usage').insert({ user_id: userId, mode, provider });
    return json({ text, provider }, 200, cors);
  } catch (_e) {
    console.error(_e);
    return json({ error: 'server', message: 'Server xatosi' }, 500, cors);
  }
});
