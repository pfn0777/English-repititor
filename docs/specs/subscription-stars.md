# Spec: Telegram Mini App + 7 kunlik trial + Stars obunasi

## Maqsad

EnglishBot'ni Telegram Mini App sifatida ishga tushirish va pullik qilish: yangi
foydalanuvchi **7 kun to'liq bepul**, keyin **150 star/oy** obuna. To'lamagan
foydalanuvchi kuniga **1 vazifa** bilan qoladi — progress va streak saqlanadi.

## Nega kerak

Ikkita muammoni bir vaqtda hal qiladi:

1. **Ochiq zarar teshigi.** `app_secrets.daily_limit` hozir **500** — bitta
   foydalanuvchi kuniga 500 AI chaqiruvi qila oladi, bu oyiga **$33 gacha**
   rasxod. Hech qanday obuna buni qoplamaydi.
2. **Identifikatsiya yo'q.** Foydalanuvchi `localStorage`dagi `eb_uid` bilan
   tanilyapti. Brauzer xotirasini tozalash = yangi shaxs. Trial ham, obuna ham
   bunday identifikatsiya ustiga qurilmaydi.

Iqtisod (o'lchangan prompt hajmlari va Gemini 2.5 Flash-Lite narxi bo'yicha,
$1 = 12 000 so'm):

| Modda | Chaqiruv | Rasxod |
|---|---|---|
| 1 dastur chaqiruvi (`issue`/`check`) | — | $0.00028 |
| 1 vazifa (o'rtacha 2.5 chaqiruv) | 2.5 | $0.0007 |
| 1 kunlik norma (3 vazifa) | ~8 | $0.0021 = 25 so'm |
| **7 kunlik trial** | ~56 | **$0.014 = 170 so'm** |
| **Obunachi / oy** (3 vazifa + 20 chat) | ~840 | **$0.25 = 3 000 so'm** |
| Obunachi / oy, eng yomon holat | 1 800 | $1.20 = 14 400 so'm |

Daromad: 150 star → sizga **$0.013 × 150 = $1.95**, Fragment −5% → **$1.85
(22 200 so'm)**. Foydalanuvchi 36 999 so'm to'laydi; farq Apple/Google va
Telegram'ga ketadi va uni **foydalanuvchi** to'laydi, siz emas.

**Marja: odatiy 86%, eng yomon holatda 35%.** 100 ta trial'dan 2 tasi to'lasa
ham foydada qolinadi.

## Qamrov ICHIDA

- Telegram Mini App qobig'i: `Telegram.WebApp.ready()`, `expand()`, `initData`
- `initData` imzosini **serverda** tekshirish (HMAC-SHA256), `tg_id` ni olish
- `users` jadvalini `tg_id` bo'yicha bog'lash (mavjud `eb_uid` migratsiyasi bilan)
- 7 kunlik trial — **birinchi vazifadan** boshlanadi, `trial_started_at`
- Uch holatli huquq (entitlement): `trial` / `active` / `free`
- Kunlik limitni huquqdan hisoblash (60 / 40 / 5), `app_secrets.daily_limit`
  o'rniga
- Stars invoice: `createInvoiceLink` (currency `XTR`) → `WebApp.openInvoice()`
- Telegram webhook: `pre_checkout_query` va `successful_payment`
- To'lovlar jurnali (`payments`), `telegram_payment_charge_id` bo'yicha idempotent
- Paywall ekrani va trial hisoblagichi (o'zbek tilida)
- Brauzerdan (Telegram'siz) ochilganda — bepul rejim + "Telegram'da ochish"

## Qamrov TASHQARISIDA (bularni qilma!)

- **Avto-uzaytirish (`subscription_period` bilan recurring Stars)** — birinchi
  versiyada bir martalik 30 kunlik to'lov. Avto-uzaytirish bekor qilish oqimini,
  `subscription_expiration_date` kuzatuvini va "obuna bekor qilindi" holatini
  talab qiladi — alohida bosqich.
- **Refund (`refundStarPayment`)** — qo'lda, admin orqali. Avtomatik qaytarish
  mexanizmi hozir kerak emas (birinchi oyda 0-5 to'lov kutilyapti).
- **Payme / Click / karta** — yuridik shaxs va shartnoma talab qiladi. Stars
  ishlagach ko'riladi.
- **Yillik tarif, promokod, referral** — narx eksperimentlari obunachi bazasi
  paydo bo'lgandan keyin.
- **admin.html'da obuna boshqaruvi** — birinchi versiyada obunani qo'lda
  uzaytirish SQL orqali qilinadi. UI keyin.
- **Bot ichida suhbat (Mini App'siz)** — bot faqat `/start` va to'lov
  webhook'i uchun. Butun o'quv jarayoni Mini App ichida.
- **Eski 15 ta foydalanuvchini "grandfather" qilish** — ular ham hammadek
  7 kunlik trial oladi. Alohida imtiyoz yo'q.

## Texnik

### Fayllar

| Fayl | Nima qilinadi |
|---|---|
| `supabase/functions/tg-webhook/index.ts` | **YANGI** — Telegram update'lari (`pre_checkout_query`, `successful_payment`) |
| `supabase/functions/billing/index.ts` | **YANGI** — `status` (huquq) va `invoice` (to'lov havolasi) |
| `supabase/functions/chat/index.ts` | `initData` qabul qilish, limitni huquqdan hisoblash |
| `supabase/functions/progress/index.ts` | `tg_id` bo'yicha ham topish (o'zgarish minimal) |
| `index.html` §1 Constants | `TRIAL_DAYS`, `SUB_STARS`, `LIMITS` |
| `index.html` §3 State | `user.tg`, `user.entitlement` |
| `index.html` yangi §2.5 | Telegram qatlami: `tgInit()`, `getInitData()`, `isInTelegram()` |
| `index.html` §7.5 Program flow | `startTask()` da huquq tekshiruvi |
| `index.html` Views | `renderPaywall()`, trial hisoblagichi header'da |
| `scripts/test-program.mjs` | `entitlementOf()`, `limitFor()`, `trialDaysLeft()` testlari |
| `CLAUDE.md` | obuna chegarasi va yangi funksiyalar hujjati |

### DB

```sql
alter table users add column tg_id            bigint unique;
alter table users add column tg_username      text;
alter table users add column trial_started_at timestamptz;
alter table users add column subscription_until timestamptz;

create table payments (
  id         uuid primary key default gen_random_uuid(),
  tg_id      bigint not null,
  user_id    uuid references users(id),
  stars      int not null,
  charge_id  text unique not null,   -- telegram_payment_charge_id, idempotentlik
  payload    text,
  source     text not null default 'stars',  -- 'stars' | 'manual' (admin qo'lda bergan)
  created_at timestamptz default now()
);

create index on users (tg_id);
create index on payments (tg_id, created_at desc);
```

`charge_id` **unique** — Telegram webhook'ni takror yuborsa obuna ikki marta
uzaymasin. Bu spec'dagi eng muhim bitta ustun.

### Config (`app_secrets`, faqat serverda)

| Kalit | Qiymat |
|---|---|
| `bot_token` | Telegram bot tokeni — **hech qachon klientga chiqmaydi** |
| `webhook_secret` | `setWebhook` dagi `secret_token`, tasodifiy 32 belgi |
| `daily_limit` | **500 → 5** (endi faqat huquqsiz foydalanuvchi uchun zaxira) |

Yangi konstantalar (`index.html` va Edge Function'larda bir xil bo'lishi shart):

```
TRIAL_DAYS = 7
SUB_STARS  = 150
SUB_DAYS   = 30
LIMIT_ACTIVE = 60    // obunachi
LIMIT_TRIAL  = 40    // trial
LIMIT_FREE   = 5     // trial tugagan / tg_id yo'q
TASKS_ACTIVE = 3     // MAX_DAILY_TASKS obunachi/trial uchun
TASKS_FREE   = 1
```

### Huquq (entitlement) — yagona funksiya

Server tomonda bitta sof funksiya, uchta holat qaytaradi:

```
entitlementOf(row, now):
  'active'  — subscription_until > now
  'trial'   — trial_started_at is null           (hali boshlanmagan)
              yoki trial_started_at + 7d > now
  'free'    — qolgan barcha holat
```

Trial `null` bo'lganda ham `trial` qaytishi ataylab: odam ilovani ochib
ko'rsin, soat faqat birinchi vazifadan yursin.

### `initData` tekshiruvi (Telegram rasmiy algoritmi)

1. `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`
2. `data_check_string` = `hash` dan tashqari barcha maydonlar, kalit bo'yicha
   alifbo tartibida, `key=value` ko'rinishida, `\n` bilan birlashtirilgan
3. `calculated_hash = hex(HMAC_SHA256(key=secret_key, msg=data_check_string))`
4. `calculated_hash === hash` bo'lishi shart
5. `auth_date` hozirgi vaqtdan **24 soatdan** eski bo'lmasligi shart (replay)

Bu kod `chat` va `billing` funksiyalarida **takrorlanadi** — Edge Function'lar
alohida deploy bo'ladi va modul ulashmaydi (`ALLOWED_ORIGINS` bilan bir xil
holat). Birini o'zgartirsang, ikkinchisini ham o'zgartir.

### To'lov oqimi

```
Mini App                    billing fn              Telegram          tg-webhook fn
   │                            │                       │                   │
   ├─ POST {initData} ─────────►│                       │                   │
   │   action:'invoice'         ├─ createInvoiceLink ──►│                   │
   │                            │   currency:'XTR'      │                   │
   │                            │   payload: uuid       │                   │
   │◄──── {link} ───────────────┤                       │                   │
   ├─ WebApp.openInvoice(link) ────────────────────────►│                   │
   │                            │                       ├─ pre_checkout ───►│
   │                            │                       │◄─ answerPreCheckout(ok)
   │                            │                       ├─ successful_payment ─►│
   │◄──── callback('paid') ─────────────────────────────┤                   ├─ subscription_until += 30d
   ├─ POST action:'status' ────►│                       │                   ├─ payments.insert
   │◄──── {entitlement:'active'}│                       │                   │
```

`tg-webhook` **`verify_jwt = false`** bilan deploy qilinadi (Telegram
`Authorization` header yubormaydi) va o'rniga
`X-Telegram-Bot-Api-Secret-Token` header'i `app_secrets.webhook_secret` bilan
solishtiriladi. Mos kelmasa — `401`, hech narsa qilinmaydi.

`pre_checkout_query` ga **10 soniya ichida** javob berish shart, aks holda
to'lov bekor bo'ladi. Shuning uchun webhook'da DB yozuvi `answerPreCheckoutQuery`
dan **keyin** qilinadi.

## Qoidalar (EARS)

**Identifikatsiya**

- QACHON Mini App ochiladi
  VA `Telegram.WebApp.initData` bo'sh emas
  TIZIM har bir `chat`/`billing`/`progress` so'rovida `initData` ni yuborishi SHART
  VA server `initData` imzosini tekshirishi SHART
  VA imzo to'g'ri bo'lsa `users` qatorini `tg_id` bo'yicha topishi yoki yaratishi SHART

- AGAR `initData` imzosi noto'g'ri yoki `auth_date` 24 soatdan eski bo'lsa
  TIZIM `401` qaytarishi SHART
  VA `tg_id` ni ishlatMASLIGI SHART
  VA foydalanuvchini `free` huquqi bilan davom ettirMASLIGI SHART (so'rov rad etiladi)

- QACHON `initData` umuman yuborilmagan (oddiy brauzer)
  TIZIM `eb_uid` bo'yicha ishlashda davom etishi SHART
  VA huquqni `free` deb hisoblashi SHART
  VA klientda "Telegram'da ochish" tugmasini ko'rsatishi SHART

**Trial**

- QACHON foydalanuvchi birinchi marta vazifa oladi (`program:'issue'`)
  VA `trial_started_at` `null`
  TIZIM `trial_started_at = now()` yozishi SHART
  VA javobda `trial_days_left = 7` qaytarishi SHART

- QACHON `trial_started_at + 7 kun` o'tgan
  VA `subscription_until` yo'q yoki o'tgan
  TIZIM huquqni `free` qilishi SHART
  VA kunlik limitni `5` ga tushirishi SHART
  VA klient kuniga `1` vazifa ko'rsatishi SHART

- AGAR foydalanuvchi `localStorage` ni tozalasa
  TIZIM `tg_id` bo'yicha o'sha qatorni topishi SHART
  VA trial'ni qaytadan boshlaMASLIGI SHART

**Limit**

- QACHON `chat` so'rovi keladi
  TIZIM limitni **huquqdan** hisoblashi SHART (`active`→60, `trial`→40, `free`→5)
  VA `app_secrets.daily_limit` ni faqat huquq aniqlanmaganda ishlatishi SHART
  VA `users.daily_limit` (admin override) mavjud bo'lsa **uni ustun** qo'yishi SHART

- QACHON kunlik limit tugaydi
  TIZIM `429` va `{ error:'limit', entitlement }` qaytarishi SHART
  VA huquq `free` bo'lsa klient limit xabari o'rniga **paywall** ko'rsatishi SHART

**To'lov**

- QACHON `pre_checkout_query` keladi
  TIZIM 10 soniya ichida `answerPreCheckoutQuery(ok:true)` yuborishi SHART

- QACHON `successful_payment` keladi
  VA `telegram_payment_charge_id` `payments` da yo'q
  TIZIM `payments` ga yozishi SHART
  VA `subscription_until = max(now, subscription_until) + 30 kun` qilishi SHART
  VA foydalanuvchiga tasdiq xabarini yuborishi SHART

- AGAR `telegram_payment_charge_id` allaqachon `payments` da bo'lsa
  TIZIM `200` qaytarishi SHART
  VA obunani **qayta uzaytirMASLIGI** SHART

- AGAR webhook `secret_token` mos kelmasa
  TIZIM `401` qaytarishi SHART
  VA hech qanday DB yozuvi qilMASLIGI SHART

**Xavfsizlik**

- TIZIM `bot_token`, `webhook_secret`, AI kalitlarini klientga yuborMASLIGI SHART
- TIZIM obuna holatini **faqat serverda** hisoblashi SHART
- AGAR klient `entitlement:'active'` deb yuborsa
  TIZIM buni e'tiborsiz qoldirishi SHART (klient hech qachon huquq manbai emas)

## Acceptance criteria

- [ ] Mini App Telegram ichida ochiladi, `initData` server tomonda tasdiqlanadi
- [ ] Yangi foydalanuvchi birinchi vazifani olganda `trial_started_at` yoziladi
- [ ] Header'da "Bepul sinov: N kun qoldi" ko'rinadi, N to'g'ri kamayadi
- [ ] 8-kuni foydalanuvchi paywall ko'radi, kuniga 1 vazifa qoladi
- [ ] "150 ⭐ obuna" tugmasi Stars oynasini ochadi
- [ ] To'lovdan keyin huquq darhol `active` bo'ladi, 3 vazifa qaytadi
- [ ] `subscription_until` aniq 30 kun uzayadi
- [ ] `localStorage` tozalangach — o'sha progress va o'sha obuna qaytadi
- [ ] Brauzerdan ochilsa ilova ishlaydi, lekin bepul rejimda
- [ ] `node scripts/test-program.mjs` yashil
- [ ] Klientning hech bir joyida (Sources, Network) `bot_token` yo'q

## Test (MAJBURIY — pul va xavfsizlikka tegadi)

**Imzo tekshiruvi**

1. To'g'ri `initData` → `200`, `tg_id` to'g'ri o'qiladi
2. `hash` ning bitta belgisi o'zgartirilgan → `401`
3. `auth_date` 25 soat oldingi → `401`
4. `initData` umuman yo'q → `free` huquqi bilan ishlaydi, `401` emas
5. Boshqa botning tokeni bilan imzolangan `initData` → `401`

**Trial**

6. Yangi `tg_id` → ilovani ochadi, vazifa olMAYDI → `trial_started_at` **null**
7. Birinchi vazifani oladi → `trial_started_at` yoziladi
8. `trial_started_at` ni qo'lda 8 kun oldinga surish → huquq `free`, limit 5
9. `localStorage` tozalanadi, o'sha Telegram akkaunt → trial qayta boshlanMAYDI
10. Trial paytida 41-chaqiruv → `429`

**To'lov**

11. Test to'lov (Telegram test muhiti) → `subscription_until` = now + 30 kun
12. Bir xil `charge_id` bilan webhook'ni **ikki marta** yuborish → obuna
    faqat bir marta uzayadi, `payments` da bitta qator
13. Obuna faolligida yana to'lov → 30 kun **qo'shiladi** (ustiga yoziladi emas)
14. `secret_token` siz webhook so'rovi → `401`, DB o'zgarmaydi
15. `pre_checkout_query` ga javob 10 soniyadan kech → to'lov bekor bo'lishini
    log'da ko'rish (sun'iy kechikish bilan bir marta sinaladi)

**Limit va huquq**

16. `active` → 60-chaqiruvda ishlaydi, 61-da `429`
17. `free` → 6-chaqiruvda `429` va paywall
18. Klient so'rovga `entitlement:'active'` qo'shib yuboradi → server e'tibor
    bermaydi, haqiqiy huquq bo'yicha limit qo'llanadi
19. `users.daily_limit` admin override → huquqdan ustun turadi

**Sirlar**

20. Brauzer Network va Sources'da `bot_token`, `webhook_secret`, `gemini_key`
    qidirish → **hech biri topilmasligi shart**
