import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://english-repititor.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

// Anthropic has no public model-list endpoint reachable with the same key setup,
// so Claude options are maintained here.
const CLAUDE_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

const DAY_MS = 86_400_000;
const TRIAL_DAYS = 7;
const GLOBAL_DAILY_LIMIT = Number(Deno.env.get('GLOBAL_DAILY_LIMIT') ?? 2000);
// Qo'lda berish mumkin bo'lgan muddatlar. -1 = bekor qilish.
const GRANT_DAYS = [7, 30, 90, -1];

type Ent = 'active' | 'trial' | 'free';

// chat/index.ts va billing/index.ts dagi nusxalar bilan AYNAN bir xil bo'lishi
// shart — Edge Function'lar modul bo'lishmaydi. admin_user_rows() SQL
// funksiyasidagi mantiq ham shu.
function entitlementOf(row: { trial_started_at?: string | null; subscription_until?: string | null } | null, now: number): Ent {
  const sub = row?.subscription_until ? Date.parse(row.subscription_until) : NaN;
  if (Number.isFinite(sub) && sub > now) return 'active';
  const tr = row?.trial_started_at ? Date.parse(row.trial_started_at) : NaN;
  if (!Number.isFinite(tr)) return 'trial';
  return tr + TRIAL_DAYS * DAY_MS > now ? 'trial' : 'free';
}

function daysLeft(row: { trial_started_at?: string | null; subscription_until?: string | null }, now: number): number {
  const ent = entitlementOf(row, now);
  if (ent === 'active') return Math.ceil((Date.parse(row.subscription_until!) - now) / DAY_MS);
  if (ent === 'trial') {
    const tr = row.trial_started_at ? Date.parse(row.trial_started_at) : NaN;
    if (!Number.isFinite(tr)) return TRIAL_DAYS;
    return Math.ceil((tr + TRIAL_DAYS * DAY_MS - now) / DAY_MS);
  }
  return 0;
}

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

function mask(k: string): string {
  if (!k) return '';
  if (k.length <= 6) return '••••';
  return k.slice(0, 4) + '••••' + k.slice(-3);
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { action, username, password, settings, userId, limit, q, ent, days, tgId, tgUsername } = await req.json();

    const { data: s } = await db.from('app_secrets').select('*').eq('id', 1).single();
    if (!s) return json({ error: 'no_config' }, 500, cors);
    if (username !== s.admin_username || password !== s.admin_password) {
      return json({ error: 'auth', message: "Login yoki parol noto'g'ri" }, 401, cors);
    }

    if (action === 'login') {
      return json({ ok: true }, 200, cors);
    }

    if (action === 'stats') {
      const search = typeof q === 'string' ? q.trim() : '';
      const entFilter = typeof ent === 'string' && ['active', 'trial', 'free'].includes(ent) ? ent : null;

      const { data: users, error: rowsErr } = await db.rpc('admin_user_rows', {
        q: search || null,
        ent: entFilter,
        lim: 100,
      });
      if (rowsErr) {
        console.error('admin_user_rows', rowsErr.message);
        return json({ error: 'rows_failed', message: "Ro'yxat olinmadi" }, 500, cors);
      }

      const { data: summary, error: sumErr } = await db.rpc('admin_summary');
      if (sumErr) {
        console.error('admin_summary', sumErr.message);
        return json({ error: 'summary_failed', message: 'Statistika olinmadi' }, 500, cors);
      }

      return json({
        ok: true,
        users: users ?? [],
        userCount: summary.userCount ?? 0,
        activeSubs: summary.activeSubs ?? 0,
        trialUsers: summary.trialUsers ?? 0,
        freeUsers: summary.freeUsers ?? 0,
        totalReq: summary.totalReq ?? 0,
        todayReq: summary.todayReq ?? 0,
        paidCount: summary.paidCount ?? 0,
        manualCount: summary.manualCount ?? 0,
        starsTotal: summary.starsTotal ?? 0,
        byMode: summary.byMode ?? {},
        globalLimit: GLOBAL_DAILY_LIMIT,
        trialDays: TRIAL_DAYS,
        settings: {
          active_provider: s.active_provider,
          model: s.model,
          daily_limit: s.daily_limit,
          gemini_key_masked: mask(s.gemini_key),
          claude_key_masked: mask(s.claude_key),
          gemini_set: !!s.gemini_key,
          claude_set: !!s.claude_key,
        },
      }, 200, cors);
    }

    // Qo'lda obuna berish / bekor qilish. Nishon ikki yo'l bilan tanlanadi:
    // { userId } — jadvaldagi mavjud qator, yoki { tgId, tgUsername? } — hali
    // ilovaga kirmagan odam. Ikkinchisi qator bo'lmasa yaratadi.
    if (action === 'grant_sub') {
      const d = Number(days);
      if (!GRANT_DAYS.includes(d)) {
        return json({ error: 'bad_days', message: "Muddat noto'g'ri" }, 400, cors);
      }

      const SEL = 'id,tg_id,tg_username,trial_started_at,subscription_until';
      type Row = { id: string; tg_id: number | null; tg_username: string | null; trial_started_at: string | null; subscription_until: string | null };

      const now = Date.now();
      const byTg = tgId !== undefined && tgId !== null && String(tgId).trim() !== '';
      let u: Row | null = null;
      let tgNum = 0;

      if (byTg) {
        tgNum = Number(tgId);
        if (!Number.isInteger(tgNum) || tgNum <= 0) {
          return json({ error: 'bad_tg', message: "Telegram ID musbat butun son bo'lishi kerak" }, 400, cors);
        }
        const { data, error } = await db.from('users').select(SEL).eq('tg_id', tgNum).maybeSingle();
        if (error) {
          console.error('grant_sub_read_tg', error.message);
          return json({ error: 'read_failed', message: "Foydalanuvchi o'qilmadi" }, 500, cors);
        }
        u = data as Row | null;
      } else {
        if (!userId || typeof userId !== 'string') return json({ error: 'bad_input', message: 'userId yoki tgId kerak' }, 400, cors);
        const { data, error } = await db.from('users').select(SEL).eq('id', userId).maybeSingle();
        if (error) {
          console.error('grant_sub_read', error.message);
          return json({ error: 'read_failed', message: "Foydalanuvchi o'qilmadi" }, 500, cors);
        }
        u = data as Row | null;
      }

      // Audit — obuna YOZILGANDAN keyin. Bu yerda pul harakati yo'q, shuning
      // uchun tg-webhook'dagi teskari tartib kerak emas: yozuv faqat haqiqiy
      // o'zgarishga qo'yiladi. Audit xatosi obunani bekor qilmaydi.
      const audit = async (row: Row, granted: number) => {
        const { error } = await db.from('payments').insert({
          tg_id: row.tg_id,
          user_id: row.id,
          stars: 0,
          charge_id: `manual:${row.id}:${new Date(now).toISOString()}`,
          payload: `admin:+${granted}d`,
          source: 'manual',
        });
        if (error) console.error('grant_sub_audit', error.message);
        return !error;
      };

      const respond = (row: Row, until: string | null, ok: boolean) => {
        const next = { trial_started_at: row.trial_started_at, subscription_until: until };
        return json({
          ok: true,
          userId: row.id,
          subscription_until: until,
          ent: entitlementOf(next, now),
          days_left: daysLeft(next, now),
          audit: ok,
        }, 200, cors);
      };

      // Qator yo'q. tg_id bo'yicha yangi obuna uchun uni yaratamiz — bu
      // tg-webhook'dagi "Mini App'ga kirmasdan to'lagan" holatining aynan o'zi.
      // Bekor qilishda yaratmaymiz: bo'sh obunani bekor qilishning ma'nosi yo'q.
      if (!u) {
        if (!byTg || d === -1) return json({ error: 'not_found', message: 'Foydalanuvchi topilmadi' }, 404, cors);

        const uname = typeof tgUsername === 'string' && tgUsername.trim()
          ? tgUsername.trim().replace(/^@/, '') : null;
        const until = new Date(now + d * DAY_MS).toISOString();

        const { data: created, error: insErr } = await db.from('users')
          .insert({ tg_id: tgNum, tg_username: uname, subscription_until: until, last_seen: new Date(now).toISOString() })
          .select(SEL).single();

        if (insErr && insErr.code === '23505') {
          // Poyga: qator o'qish bilan yozish orasida paydo bo'ldi. Qayta
          // o'qib, pastdagi "mavjud qator" yo'liga tushamiz — obuna
          // ustidan yozilmasin.
          const { data: again } = await db.from('users').select(SEL).eq('tg_id', tgNum).maybeSingle();
          u = again as Row | null;
          if (!u) return json({ error: 'update_failed', message: 'Obuna yozilmadi' }, 500, cors);
        } else if (insErr) {
          console.error('grant_sub_insert', insErr.message);
          return json({ error: 'update_failed', message: 'Obuna yozilmadi' }, 500, cors);
        } else {
          const row = created as Row;
          return respond(row, until, await audit(row, d));
        }
      }

      // Bekor qilish tg_id talab qilmaydi — noto'g'ri qo'yilgan sanani ham
      // tozalash kerak. trial_started_at ga tegilmaydi: trial qayta boshlanmasin.
      if (d === -1) {
        const { error } = await db.from('users').update({ subscription_until: null }).eq('id', u.id);
        if (error) {
          console.error('grant_sub_cancel', error.message);
          return json({ error: 'update_failed', message: 'Bekor qilinmadi' }, 500, cors);
        }
        return respond(u, null, true);
      }

      // tg_id yo'q bo'lsa obuna hech narsa bermaydi: chat/index.ts da
      // `tgEnabled && !tg` har doim 'free' qaytaradi. Bundan tashqari
      // payments.tg_id — NOT NULL.
      if (!u.tg_id) {
        return json({ error: 'no_tg', message: "Bu foydalanuvchida Telegram ID yo'q — obuna ishlamaydi" }, 400, cors);
      }

      // tg-webhook bilan bir xil: amaldagi obuna ustiga qo'shiladi, ustidan yozilmaydi.
      const base = u.subscription_until ? Date.parse(u.subscription_until) : NaN;
      const from = Number.isFinite(base) && base > now ? base : now;
      const until = new Date(from + d * DAY_MS).toISOString();

      const { error: updErr } = await db.from('users').update({ subscription_until: until }).eq('id', u.id);
      if (updErr) {
        console.error('grant_sub_update', updErr.message);
        return json({ error: 'update_failed', message: 'Obuna yozilmadi' }, 500, cors);
      }

      return respond(u, until, await audit(u, d));
    }

    // Lists models the stored keys can actually use. The key stays server-side —
    // only model names are returned.
    if (action === 'list_models') {
      const models: Record<string, string[]> = { gemini: [], claude: CLAUDE_MODELS };
      let warning = '';
      if (s.gemini_key) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${s.gemini_key}&pageSize=200`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error('list_models_error', r.status, JSON.stringify(d?.error || d));
          warning = String(d?.error?.message || 'Gemini modellar ro\'yxati olinmadi');
        } else {
          models.gemini = (d.models || [])
            .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map((m: { name: string }) => String(m.name).replace(/^models\//, ''))
            .sort();
        }
      } else {
        warning = 'Gemini kaliti kiritilmagan';
      }
      return json({ ok: true, models, current: s.model, warning }, 200, cors);
    }

    if (action === 'set_user_limit') {
      if (!userId || typeof userId !== 'string') return json({ error: 'bad_input', message: 'userId kerak' }, 400, cors);
      let value: number | null;
      if (limit === null || limit === '' || limit === undefined) {
        value = null;
      } else {
        const n = Number(limit);
        if (!Number.isInteger(n) || n < 0) return json({ error: 'bad_limit', message: "Limit 0 yoki musbat butun son bo'lishi kerak" }, 400, cors);
        value = n;
      }
      const { error } = await db.from('users').update({ daily_limit: value }).eq('id', userId);
      if (error) return json({ error: 'update_failed', message: 'Yangilanmadi' }, 500, cors);
      return json({ ok: true, daily_limit: value }, 200, cors);
    }

    if (action === 'save') {
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (settings?.active_provider) upd.active_provider = settings.active_provider;
      if (settings?.model) upd.model = settings.model;
      if (settings?.daily_limit != null) upd.daily_limit = Number(settings.daily_limit);
      if (settings?.gemini_key) upd.gemini_key = settings.gemini_key;
      if (settings?.claude_key) upd.claude_key = settings.claude_key;
      if (settings?.admin_password) upd.admin_password = settings.admin_password;
      await db.from('app_secrets').update(upd).eq('id', 1);
      return json({ ok: true }, 200, cors);
    }

    return json({ error: 'unknown_action' }, 400, cors);
  } catch (_e) {
    return json({ error: 'server', message: 'Server xatosi' }, 500, cors);
  }
});
