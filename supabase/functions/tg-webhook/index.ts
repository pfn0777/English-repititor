import { createClient } from 'jsr:@supabase/supabase-js@2';

// Stars to'lovini qayd etadi: payments'ga yozadi va obunani 30 kunga uzaytiradi.
//
// Bot POLLING rejimida ishlaydi (Hetzner, aiogram) — Telegram bu yerga
// to'g'ridan-to'g'ri murojaat QILMAYDI. Update'ni bot uzatadi va
// `X-Telegram-Bot-Api-Secret-Token` header'iga app_secrets.webhook_secret
// qo'yadi. Shakl Telegram update'i bilan bir xil, shuning uchun kelajakda
// setWebhook'ga o'tilsa bu fayl o'zgarishsiz ishlaydi.
//
// verify_jwt = false bilan deploy qilinadi (bot Authorization yubormaydi).
// CORS yo'q: bu endpointga brauzer murojaat qilmaydi.

const SUB_DAYS = 30;
const SUB_STARS = 150;

const ok = () => new Response('ok', { status: 200 });

async function tg(botToken: string, method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!d.ok) console.error('tg_api', method, r.status, JSON.stringify(d));
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: s } = await db.from('app_secrets').select('bot_token, webhook_secret').eq('id', 1).single();
  const botToken = String(s?.bot_token || '');
  const secret = String(s?.webhook_secret || '');

  // Sirsiz ishlashdan ko'ra ishlamagan yaxshi: aks holda istalgan odam
  // soxta successful_payment yuborib o'ziga obuna yozdirishi mumkin.
  if (!botToken || !secret) return new Response('not configured', { status: 503 });
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  let update: Record<string, any>;
  try { update = await req.json(); } catch { return new Response('bad json', { status: 400 }); }

  try {
    // 1) Pre-checkout — 10 soniya ichida javob berish SHART, aks holda to'lov bekor
    //    bo'ladi. Shuning uchun bu yerda DB'ga tegilmaydi.
    if (update.pre_checkout_query) {
      await tg(botToken, 'answerPreCheckoutQuery', {
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true,
      });
      return ok();
    }

    const msg = update.message;

    // 2) To'lov muvaffaqiyatli
    if (msg?.successful_payment) {
      const sp = msg.successful_payment;
      const tgId = msg.from?.id;
      const chargeId = String(sp.telegram_payment_charge_id || '');
      if (!tgId || !chargeId) return ok();

      const { data: row } = await db.from('users').select('*').eq('tg_id', tgId).maybeSingle();

      // Idempotentlik: Telegram bu update'ni takror yuborishi mumkin. UNIQUE
      // charge_id ikkinchi urinishni rad etadi va obuna ikki marta uzaymaydi.
      const { error: insErr } = await db.from('payments').insert({
        tg_id: tgId,
        user_id: row?.id ?? null,
        stars: Number(sp.total_amount ?? SUB_STARS),
        charge_id: chargeId,
        payload: String(sp.invoice_payload || ''),
      });
      if (insErr) {
        if (insErr.code === '23505') {
          console.log('duplicate_payment_ignored', chargeId);
          return ok();
        }
        console.error('payment_insert', insErr);
        return ok(); // Telegram qayta yuborsin
      }

      // Amaldagi obuna ustiga qo'shiladi, ustidan yozilmaydi — erta to'lagan
      // foydalanuvchi qolgan kunlarini yo'qotmasin.
      const now = Date.now();
      const base = row?.subscription_until ? Date.parse(row.subscription_until) : NaN;
      const from = Number.isFinite(base) && base > now ? base : now;
      const until = new Date(from + SUB_DAYS * 86_400_000).toISOString();

      // Obuna yozilmasa "faollashdi" deb aytish MUMKIN EMAS — pul olingan holda
      // yolg'on tasdiq eng yomon variant. Shuning uchun natija tekshiriladi.
      const { error: subErr } = row
        ? await db.from('users').update({ subscription_until: until }).eq('id', row.id)
        // Mini App'ga hali kirmagan, lekin bot orqali to'lagan holat.
        : await db.from('users').insert({
            tg_id: tgId,
            tg_username: msg.from?.username ?? null,
            subscription_until: until,
            last_seen: new Date().toISOString(),
          });

      if (subErr) {
        // payments qatori ALLAQACHON yozilgan, ya'ni to'lov fakti yo'qolmaydi va
        // obunani qo'lda tiklash mumkin. 200 qaytaramiz: takroriy urinish
        // charge_id UNIQUE ga urilib baribir shu yerga yetib kelmaydi.
        console.error('subscription_write_failed', tgId, chargeId, subErr);
        await tg(botToken, 'sendMessage', {
          chat_id: msg.chat.id,
          text: '⚠️ To\'lovingiz qabul qilindi, lekin obunani faollashtirishda texnik xatolik yuz berdi.\n\nPulingiz yo\'qolmadi va to\'lov qayd etildi — obuna qo\'lda tiklanadi. Iltimos, /start bosib qayta urinib ko\'ring yoki adminga yozing.',
        });
        return ok();
      }

      await tg(botToken, 'sendMessage', {
        chat_id: msg.chat.id,
        text: `✅ Obuna faollashdi!\n\nEndi kuniga 3 ta vazifa, erkin mashqlar va AI Ustoz ochiq.\nAmal qilish muddati: ${until.slice(0, 10)}`,
      });
      return ok();
    }

    // /start, /help va menyu tugmasi bu yerda EMAS — ular polling rejimidagi
    // Python botda (C:\Users\user\Documents\English bot\bot.py). Bu funksiya
    // faqat to'lovni qayd etadi.
    return ok();
  } catch (e) {
    console.error('webhook', e);
    return ok(); // 200 qaytaramiz — Telegram cheksiz qayta urinmasin
  }
});
