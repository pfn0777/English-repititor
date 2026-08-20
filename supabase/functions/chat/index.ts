import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://english-repititor.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const GLOBAL_DAILY_LIMIT = Number(Deno.env.get('GLOBAL_DAILY_LIMIT') || '2000');
const MAX_PAYLOAD_CHARS = 20000;
// Fallback only — the active model lives in app_secrets.model (currently gemini-2.5-flash-lite).
// This alias stays as the safety net: Google keeps it pointed at a current model, so a retired
// pinned version can't take the bot down (see the retry below).
const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';
const MAX_AUDIO_B64 = 2_000_000; // ~1.5MB; ~60s opus is enough
// Thinking-capable Gemini models charge their reasoning tokens against maxOutputTokens — at 1000
// the visible answer was silently cut to ~40 tokens. gemini-2.5-flash-lite has thinking OFF by
// default, but the fallback alias does not, so the budget must still cover thinking + answer.
// thinkingConfig is rejected by the alias, so it is not set here.
const MAX_OUTPUT_TOKENS = 4000;
// Gemini 503 UNAVAILABLE ("This model is currently experiencing high demand") vaqtinchalik —
// qayta urinilsa odatda o'tadi. Kechikish jami ~2.5s, foydalanuvchi kutishi maqbul chegarada.
const GEMINI_RETRY_DELAYS_MS = [700, 1800];
const ALLOWED_AUDIO_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

// ─── Obuna (docs/specs/subscription-stars.md) ────────────────────
// Bu blok index.html §4.6 dagi mantiqning AYNAN nusxasi. Edge Function'lar
// modul ulashmaydi (ALLOWED_ORIGINS bilan bir xil holat), shuning uchun birini
// o'zgartirsang ikkinchisini ham o'zgartir — aks holda klient ochiq ko'rsatgan
// tugma serverda 429 beradi.
const DAY_MS = 86_400_000;
const TRIAL_DAYS = 7;
const LIMIT_ACTIVE = 60;
const LIMIT_TRIAL = 40;
const LIMIT_FREE = 5;
const INITDATA_MAX_AGE_S = 86_400; // 24 soat — replay oynasi

type Ent = 'active' | 'trial' | 'free';

function entitlementOf(row: { trial_started_at?: string | null; subscription_until?: string | null } | null, now: number): Ent {
  const sub = row?.subscription_until ? Date.parse(row.subscription_until) : NaN;
  if (Number.isFinite(sub) && sub > now) return 'active';
  const tr = row?.trial_started_at ? Date.parse(row.trial_started_at) : NaN;
  if (!Number.isFinite(tr)) return 'trial'; // hali boshlanmagan — soat 1-vazifadan yuradi
  return tr + TRIAL_DAYS * DAY_MS > now ? 'trial' : 'free';
}

// DIQQAT: bu AI CHAQIRUVLARI chegarasi. Kunlik VAZIFA normasi (tasksFor)
// faqat klientda: bu funksiya vazifalarni sanamaydi. Normani ko'targanda
// shu chegara sig'ishini tekshir — bitta vazifa ~2-3 chaqiruv.
function limitFor(ent: Ent): number {
  if (ent === 'active') return LIMIT_ACTIVE;
  if (ent === 'trial') return LIMIT_TRIAL;
  return LIMIT_FREE;
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}

const toHex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');

// Vaqti doimiy solishtirish — hash'ni belgima-belgi taxmin qilishga yo'l qo'ymaslik uchun.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Telegram rasmiy algoritmi: core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Qaytadi: { tgId, username } yoki null. null = ISHONMA (imzo yo'q/xato/eski).
export async function verifyInitData(initData: string, botToken: string): Promise<{ tgId: number; username: string | null } | null> {
  if (!initData || !botToken) return null;
  let params: URLSearchParams;
  try { params = new URLSearchParams(initData); } catch { return null; }

  const hash = params.get('hash');
  if (!hash) return null;

  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const expected = toHex(await hmacSha256(secretKey, dataCheckString));
  if (!timingSafeEqual(expected, hash)) return null;

  // Eski initData'ni qayta ishlatishga yo'l qo'ymaslik.
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > INITDATA_MAX_AGE_S) return null;

  try {
    const u = JSON.parse(params.get('user') || 'null');
    if (!u || typeof u.id !== 'number') return null;
    return { tgId: u.id, username: u.username ?? null };
  } catch { return null; }
}

// Gemini 503/UNAVAILABLE — model band, xato emas. Status ham, matn ham tekshiriladi:
// Google ba'zan 503 ni boshqa status matni bilan qaytaradi.
function isOverloaded(r: Response, d: unknown): boolean {
  if (r.ok) return false;
  const e = (d as { error?: { message?: string; status?: string } } | null)?.error;
  if (r.status === 503) return true;
  if (String(e?.status || '') === 'UNAVAILABLE') return true;
  return /high demand|overloaded|unavailable|try again later/i.test(String(e?.message || ''));
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
    const { userId, initData, system, messages, mode, profile, audio } = await req.json();
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

    const { data: s } = await db.from('app_secrets').select('*').eq('id', 1).single();
    if (!s) return json({ error: 'no_config', message: 'Sozlama topilmadi' }, 500, cors);

    // ─── Kimligi va huquqi ──────────────────────────────────────────
    // initData tekshiruvi o'tmasa ham so'rovni bloklamaymiz va jarima sifatida
    // 'free'ga tushirmaymiz — brauzer holatidagi kabi tg_id'siz davom etadi,
    // pastda entitlementOf sana asosida hisoblaydi (yangi/sanasiz → 'trial').
    const tg = initData ? await verifyInitData(String(initData), String(s.bot_token || '')) : null;

    const nowMs = Date.now();
    const profileFields = {
      name: profile?.name ?? null,
      level: profile?.level ?? null,
      goal: profile?.goal ?? null,
      last_seen: new Date().toISOString(),
    };

    // tg_id — barqaror shaxs. localStorage tozalansa eb_uid o'zgaradi, lekin
    // tg_id o'sha qatorga olib keladi: trial qaytadan boshlanmaydi.
    let row: Record<string, unknown> | null = null;
    if (tg) {
      const { data: byTg } = await db.from('users').select('*').eq('tg_id', tg.tgId).maybeSingle();
      if (byTg) {
        await db.from('users').update({ ...profileFields, tg_username: tg.username }).eq('id', byTg.id);
        row = { ...byTg, ...profileFields };
      } else {
        const { data: claimed } = await db.from('users')
          .upsert({ id: userId, ...profileFields, tg_id: tg.tgId, tg_username: tg.username }, { onConflict: 'id' })
          .select('*').single();
        row = claimed ?? null;
      }
    } else {
      const { data: plain } = await db.from('users')
        .upsert({ id: userId, ...profileFields }, { onConflict: 'id' })
        .select('*').single();
      row = plain ?? null;
    }

    const uid = (row?.id as string) ?? userId;
    const ent = entitlementOf(row as { trial_started_at?: string | null; subscription_until?: string | null }, nowMs);

    // Admin qo'lda qo'ygan limit hamma narsadan ustun turadi.
    const override = (row?.daily_limit ?? null) as number | null;
    const effectiveLimit = override !== null ? Number(override) : limitFor(ent);

    const subState = {
      trial_started_at: (row?.trial_started_at as string | null) ?? null,
      subscription_until: (row?.subscription_until as string | null) ?? null,
      entitlement: ent,
    };

    const { count } = await db.from('usage').select('*', { count: 'exact', head: true })
      .eq('user_id', uid).gte('created_at', since.toISOString());
    if ((count ?? 0) >= effectiveLimit) {
      return json({
        error: 'limit',
        message: ent === 'free'
          ? 'Bepul rejim tugadi. Obuna bo‘lsangiz kuniga 5 vazifa ochiladi.'
          : "Bugungi limit tugadi. Ertaga qayta urinib ko'ring.",
        sub: subState,
      }, 429, cors);
    }

    // Trial soati birinchi VAZIFADAN yuradi — ilovani ochib ko'rgan odam kun yo'qotmasin.
    if (mode === 'program_issue' && !subState.trial_started_at) {
      const startedAt = new Date(nowMs).toISOString();
      await db.from('users').update({ trial_started_at: startedAt }).eq('id', uid);
      subState.trial_started_at = startedAt;
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
        body: JSON.stringify({ model, max_tokens: MAX_OUTPUT_TOKENS, system, messages }),
      });
      const d = await r.json();
      if (!r.ok) {
        console.error('claude_error', r.status, JSON.stringify(d.error || d));
        if (r.status === 529 || r.status === 503) {
          return json({ error: 'busy', message: "AI hozir juda band. 10-15 soniyadan keyin qayta urinib ko'ring.", sub: subState }, 503, cors);
        }
        return json({ error: 'ai', message: "AI javob bera olmadi. Qayta urinib ko'ring.", sub: subState }, 502, cors);
      }
      text = d.content?.[0]?.text || '';
    } else {
      if (!s.gemini_key) {
        const msg = hasAudio ? 'Ovozli xabar uchun Gemini kerak. Admin Gemini kalitini kiritmagan.' : 'Admin Gemini kalitini kiritmagan.';
        return json({ error: 'no_key', message: msg }, 503, cors);
      }
      const model = String(s.model || '').startsWith('gemini') ? s.model : GEMINI_FALLBACK_MODEL;
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
        // Program tasks parse a "📊 NATIJA: N/M" marker from the FIRST line, so the
        // generic voice suffix must not push a transcription ahead of it.
        sys = String(mode || '').startsWith('program_')
          ? `${system}\n\nThe user answered with a VOICE message (audio attached). Listen to it and grade it exactly as instructed above — the required output format, including the first line, stays unchanged. Add the transcription of what you actually heard AFTER the required first line. Judge pronunciation only when it changes the meaning. CRITICAL: if the audio has no intelligible speech, score it zero and say so — never reconstruct a transcription from the expected answers in the task text.`
          : `${system}\n\nThe user sent a VOICE message (audio attached). First transcribe what they said, then assess pronunciation, fluency and grammar. Give concrete corrections in the standard format. If the goal is IELTS, also give a Speaking band as "\u{1F3AF} Band: X.X".`;
      }

      const body = JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      });
      const callGemini = (m: string) => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${s.gemini_key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      );

      // 503 (band) vaqtinchalik — backoff bilan qayta urinamiz. 404/boshqa xatolar
      // retry bilan tuzalmaydi, shuning uchun darhol qaytadi.
      const callWithRetry = async (m: string) => {
        let r = await callGemini(m);
        let d = await r.json().catch(() => ({}));
        for (const delay of GEMINI_RETRY_DELAYS_MS) {
          if (!isOverloaded(r, d)) break;
          console.error('gemini_overloaded_retry', m, r.status, 'wait', delay);
          await sleep(delay);
          r = await callGemini(m);
          d = await r.json().catch(() => ({}));
        }
        return { r, d };
      };

      let { r, d } = await callWithRetry(model);
      // Birinchi urinish xatosi ham loglanadi — fallback'dan keyin uni bilib bo'lmasdi.
      if (!r.ok) console.error('gemini_error_1', model, r.status, JSON.stringify(d?.error || d));
      // Pinned Gemini versions get retired over time; retry once on the always-current alias
      // so a stale admin setting doesn't take the bot down. Band model "retired" EMAS —
      // aks holda har 503 da keraksiz ikkinchi modelga o'tib, kechikish ikkilanadi.
      const retired = !r.ok && !isOverloaded(r, d)
        && (r.status === 404 || /no longer available|not found|not supported/i.test(String(d?.error?.message || '')));
      if (retired && model !== GEMINI_FALLBACK_MODEL) {
        console.error('gemini_model_retired', model, '-> fallback', GEMINI_FALLBACK_MODEL);
        ({ r, d } = await callWithRetry(GEMINI_FALLBACK_MODEL));
      }
      if (!r.ok) {
        console.error('gemini_error', r.status, JSON.stringify(d.error || d));
        if (isOverloaded(r, d)) {
          return json({ error: 'busy', message: "AI hozir juda band. 10-15 soniyadan keyin qayta urinib ko'ring.", sub: subState }, 503, cors);
        }
        if (r.status === 429) {
          return json({ error: 'rate_limit', message: "Hozir band, biroz kuting va qayta urinib ko'ring.", sub: subState }, 429, cors);
        }
        // Xom provayder matni inglizcha va texnik — u faqat logda qoladi.
        return json({ error: 'ai', message: "AI javob bera olmadi. Qayta urinib ko'ring.", sub: subState }, 502, cors);
      }
      text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Surfaced so a silent truncation shows up in logs instead of looking like a bad answer.
      const finish = d.candidates?.[0]?.finishReason;
      if (finish && finish !== 'STOP') console.error('gemini_finish', finish, 'chars', text.length);
    }

    await db.from('usage').insert({ user_id: uid, mode, provider });
    return json({ text, provider, sub: subState }, 200, cors);
  } catch (_e) {
    console.error(_e);
    return json({ error: 'server', message: 'Server xatosi' }, 500, cors);
  }
});
