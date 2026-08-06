import { createClient } from 'jsr:@supabase/supabase-js@2';

// Mirrors chat/index.ts — the two functions deploy separately, so no shared module.
const ALLOWED_ORIGINS = [
  'https://english-repititor.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const MAX_PROGRESS_CHARS = 100_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const { userId, action, progress } = await req.json();

    if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
      return json({ error: 'no_user', message: 'userId kerak' }, 400, cors);
    }
    if (action !== 'get' && action !== 'save') {
      return json({ error: 'bad_action', message: "action 'get' yoki 'save' bo'lsin" }, 400, cors);
    }

    if (action === 'get') {
      const { data, error } = await db.from('users').select('progress').eq('id', userId).maybeSingle();
      if (error) {
        console.error('progress_get_error', error.message);
        return json({ error: 'db', message: 'Progress o\'qilmadi' }, 500, cors);
      }
      return json({ progress: data?.progress ?? {} }, 200, cors);
    }

    // action === 'save'
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
      return json({ error: 'bad_input', message: "progress obyekt bo'lishi kerak" }, 400, cors);
    }
    const serialized = JSON.stringify(progress);
    if (serialized.length > MAX_PROGRESS_CHARS) {
      return json({ error: 'too_large', message: 'Progress juda katta' }, 413, cors);
    }

    // Server owns updatedAt — the client clock is not trusted for conflict resolution.
    const saved = { ...progress, updatedAt: new Date().toISOString() };

    // Upsert: progress may be saved before chat has ever created the row.
    // Only the listed columns are written, so name/level/goal survive.
    const { error } = await db.from('users').upsert(
      { id: userId, progress: saved, last_seen: new Date().toISOString() },
      { onConflict: 'id' },
    );
    if (error) {
      console.error('progress_save_error', error.message);
      return json({ error: 'db', message: 'Progress saqlanmadi' }, 500, cors);
    }

    return json({ progress: saved }, 200, cors);
  } catch (_e) {
    console.error(_e);
    return json({ error: 'server', message: 'Server xatosi' }, 500, cors);
  }
});
