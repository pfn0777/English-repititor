import { createClient } from 'jsr:@supabase/supabase-js@2';

// Obuna holati va Stars to'lov havolasi. Sirlar (bot_token) hech qachon
// klientga qaytmaydi — bu funksiya faqat tayyor invoice havolasini beradi.
//
// DIQQAT: `verifyInitData`, `entitlementOf` va obuna konstantalari chat/index.ts
// dagi nusxaning AYNAN o'zi. Edge Function'lar modul ulashmaydi — birini
// o'zgartirsang, ikkinchisini ham o'zgartir.

const ALLOWED_ORIGINS = [
  'https://english-repititor.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const DAY_MS = 86_400_000;
const TRIAL_DAYS = 7;
const SUB_STARS = 150;
const SUB_DAYS = 30;
const INITDATA_MAX_AGE_S = 86_400;

type Ent = 'active' | 'trial' | 'free';

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

function entitlementOf(row: { trial_started_at?: string | null; subscription_until?: string | null } | null, now: number): Ent {
  const sub = row?.subscription_until ? Date.parse(row.subscription_until) : NaN;
  if (Number.isFinite(sub) && sub > now) return 'active';
  const tr = row?.trial_started_at ? Date.parse(row.trial_started_at) : NaN;
  if (!Number.isFinite(tr)) return 'trial';
  return tr + TRIAL_DAYS * DAY_MS > now ? 'trial' : 'free';
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}

const toHex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyInitData(initData: string, botToken: string): Promise<{ tgId: number; username: string | null } | null> {
  if (!initData || !botToken) return null;
  let params: URLSearchParams;
  try { params = new URLSearchParams(initData); } catch { return null; }

  // chat/index.ts dagi bilan bir xil — rad etish sababi logga tushadi.
  const keys = [...params.keys()].sort().join(',');

  const hash = params.get('hash');
  if (!hash) { console.error('initdata_reject no_hash keys=' + keys); return null; }

  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  if (!timingSafeEqual(toHex(await hmacSha256(secretKey, dataCheckString)), hash)) {
    console.error('initdata_reject bad_hash keys=' + keys + ' bot=' + botToken.split(':')[0]);
    return null;
  }

  const authDate = Number(params.get('auth_date') || 0);
  const ageS = authDate ? Math.floor(Date.now() / 1000) - authDate : -1;
  if (!authDate || ageS > INITDATA_MAX_AGE_S) {
    console.error('initdata_reject stale age_s=' + ageS);
    return null;
  }

  try {
    const u = JSON.parse(params.get('user') || 'null');
    if (!u || typeof u.id !== 'number') { console.error('initdata_reject no_user keys=' + keys); return null; }
    return { tgId: u.id, username: u.username ?? null };
  } catch { console.error('initdata_reject bad_user_json'); return null; }
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { userId, initData, action } = await req.json();
    if (!userId || typeof userId !== 'string') return json({ error: 'no_user' }, 400, cors);
    if (action !== 'status' && action !== 'invoice') return json({ error: 'bad_action' }, 400, cors);

    const { data: s } = await db.from('app_secrets').select('bot_token').eq('id', 1).single();
    const botToken = String(s?.bot_token || '');
    if (!botToken) return json({ error: 'no_bot', message: 'Bot sozlanmagan' }, 503, cors);

    // To'lov ham, holat ham Telegram shaxsiga bog'langan — imzosiz gaplashmaymiz.
    const tg = await verifyInitData(String(initData || ''), botToken);
    if (!tg) return json({ error: 'bad_auth', message: 'Telegram ichida oching' }, 401, cors);

    const { data: byTg } = await db.from('users').select('*').eq('tg_id', tg.tgId).maybeSingle();
    let row = byTg;
    if (!row) {
      const { data: claimed } = await db.from('users')
        .upsert({ id: userId, tg_id: tg.tgId, tg_username: tg.username, last_seen: new Date().toISOString() }, { onConflict: 'id' })
        .select('*').single();
      row = claimed;
    }

    const sub = {
      trial_started_at: row?.trial_started_at ?? null,
      subscription_until: row?.subscription_until ?? null,
      entitlement: entitlementOf(row, Date.now()),
    };

    if (action === 'status') return json({ sub }, 200, cors);

    // payload webhook'ga qaytib keladi — qaysi qatorni uzaytirishni shundan bilamiz.
    const payload = `sub30:${row?.id ?? userId}`;
    const r = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'EnglishBot — 1 oy',
        description: `Kuniga 3 vazifa, erkin mashqlar va AI Ustoz. ${SUB_DAYS} kun.`,
        payload,
        currency: 'XTR',
        prices: [{ label: '1 oylik obuna', amount: SUB_STARS }],
      }),
    });
    const d = await r.json();
    if (!d.ok) {
      console.error('createInvoiceLink', r.status, JSON.stringify(d));
      return json({ error: 'invoice', message: 'To‘lov havolasi olinmadi' }, 502, cors);
    }
    return json({ link: d.result, sub }, 200, cors);

  } catch (e) {
    console.error(e);
    return json({ error: 'server', message: 'Server xatosi' }, 500, cors);
  }
});
