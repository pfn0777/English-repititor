# Spec: Admin panel — obuna boshqaruvi va foydalanuvchi faoliyati

## Maqsad

`admin.html` va `admin` Edge Function'ga uchta imkoniyat qo'shish: har bir
foydalanuvchining **obuna holatini ko'rish**, **nimadan qancha foydalanayotganini
ko'rish**, va **qo'lda obuna berish/bekor qilish**.

## Nega kerak

Hozir admin panel faqat umumiy statistika (`userCount`, `todayReq`, `totalReq`,
`byMode`) va per-user kunlik limitni ko'rsatadi. Obuna to'liq ko'rinmas:

- Kim to'lagan, kimning trial'i tugagan — bilib bo'lmaydi. Faqat Supabase SQL
  editor orqali qo'lda `select` qilish mumkin.
- Muammoli to'lov (Telegram pulni yechdi, `tg-webhook` `users` yozuvida
  xato berdi) yuz bersa, adminda tuzatish vositasi yo'q.
- Beta-tester, do'st, bloger yoki kompensatsiya uchun obuna berishning yagona
  yo'li — SQL yozish. Bu xavfli va tarixsiz.
- Qaysi foydalanuvchi qancha so'rov ishlatayotgani ko'rinmaydi, ya'ni
  `GLOBAL_DAILY_LIMIT = 2000` ga qachon yaqinlashayotganini foydalanuvchi
  kesimida baholab bo'lmaydi.

## Qamrov ICHIDA

### 1. Foydalanuvchilar jadvaliga yangi ustunlar

Mavjud jadval (`Ism | Daraja | Maqsad | Oxirgi | Limit`) kengaytiriladi:

| Ustun | Manba | Ko'rinishi |
|---|---|---|
| Ism | `users.name` | mavjud |
| TG | `users.tg_username` / `tg_id` | `@username` yoki `id:123456`, yo'q bo'lsa `—` |
| Obuna | `entitlementOf(row, now)` | `✅ Active (23 kun)` / `⏳ Trial (3 kun)` / `⚪ Free` |
| Daraja | `users.name`+program | mavjud (`level`) |
| Bugun | `usage` count (bugun) | `4/60` — bugungi so'rov / amaldagi limit |
| Jami | `usage` count (hammasi) | butun son |
| Oxirgi | `users.last_seen` | mavjud |
| Limit | `users.daily_limit` | mavjud (override input) |
| Amal | — | `+7` `+30` `+90` `✕` tugmalari |

Saralash: `last_seen desc`. Chegaralar bo'limiga qarang (100 ta).

### 2. Qidiruv va filtr

- Qidiruv maydoni: `name`, `tg_username`, `tg_id` bo'yicha (case-insensitive,
  `ilike %q%`; `tg_id` faqat butun son kiritilganda tekshiriladi).
- Filtr tugmalari: `Hammasi` / `Active` / `Trial` / `Free`.
- Qidiruv va filtr **serverda** bajariladi (`stats` action'ga `q` va `ent`
  parametrlari). Entitlement hisoblanadigan qiymat bo'lgani uchun `ent` filtri
  SQL sana shartiga tarjima qilinadi (pastdagi "Qoidalar" ga qarang).

### 3. Qo'lda obuna berish

Yangi action: `grant_sub`. Nishon **ikki yo'l** bilan tanlanadi:

- **`userId`** — jadvaldagi mavjud qator (qatorli `+7/+30/+90/✕` tugmalari).
- **`tgId`** (+ ixtiyoriy `tgUsername`) — panel tepasidagi forma. Qator
  mavjud bo'lmasa **yaratiladi**, ya'ni odam ilovaga hech kirmagan bo'lsa ham
  obuna berish mumkin va u Mini App'ni ochganda tayyor turadi. Bu yangi naqsh
  emas — `tg-webhook` "Mini App'ga kirmasdan to'lagan" holatda aynan shuni
  qiladi. `users_tg_id_key` — *partial* unique index, shuning uchun PostgREST
  `upsert onConflict` ishlamaydi: `select` → `insert`, `23505` kelsa qayta
  `select` qilinib mavjud qator yo'liga o'tiladi.

Bu ikkinchi yo'lsiz feature amalda o'lik edi: birinchi versiyada bazadagi
18 ta qatordan **hech birida `tg_id` yo'q edi**, ya'ni tugma hech kimga
ishlamasdi.

- Kirish: `userId` **yoki** `tgId`, `days` (`7 | 30 | 90 | -1`).
- `days > 0` → `subscription_until` **ustiga qo'shiladi** (`tg-webhook` bilan
  aynan bir xil mantiq: `from = max(now, mavjud subscription_until)`).
- `days === -1` → bekor qilish: `subscription_until = null`.
- Har muvaffaqiyatli berish `payments` jadvaliga yoziladi:
  `stars = 0`, `source = 'manual'`, `charge_id = 'manual:<userId>:<ISO vaqt>'`,
  `payload = 'admin:+<days>d'`.
- Bekor qilish `payments` ga **yozilmaydi** (pul harakati emas), lekin javobda
  yangi holat qaytadi.

### 4. Umumiy statistika kartochkalari

Mavjud 3 ta kartochka (`Foydalanuvchi / Bugungi so'rov / Jami so'rov`) 6 taga
kengayadi:

- Faol obunachi (`subscription_until > now`)
- Trial'da (entitlement === 'trial')
- Bugungi so'rov / `GLOBAL_DAILY_LIMIT` (masalan `312/2000`)

### 5. DB migration

```sql
alter table payments add column source text not null default 'stars';
create index if not exists payments_source_idx on payments (source);
```

Mavjud qatorlar avtomatik `'stars'` bo'ladi — real to'lov statistikasi buzilmaydi.

## Qamrov TASHQARISIDA (bularni qilma!)

- **Per-user faoliyat detali (modal, oxirgi 20 ta so'rov, to'lov tarixi)** —
  keyingi versiyaga. Hozir jadval ustunlari yetadi.
- **Sahifalash (pagination)** — 100 ta + qidiruv yetarli. User soni 500 dan
  oshganda qaytamiz.
- **`admin_log` alohida jadvali** — `payments.source = 'manual'` audit uchun
  yetarli. Limit o'zgartirish logi hozircha yozilmaydi.
- **Aniq sana tanlash (date picker)** — faqat `+7/+30/+90/bekor`. Sana kiritish
  xato imkoniyatini oshiradi (o'tmish sanasi, format).
- **Obuna berilganda foydalanuvchiga Telegram xabari** — bot alohida repoda
  (`C:\Users\user\Documents\English bot`), bu spec unga tegmaydi. Admin o'zi
  yozadi.
- **`tg_id` siz (brauzer) foydalanuvchiga obuna berish** — texnik jihatdan
  mumkin emas (pastga qarang). Tugma o'chirilgan holatda ko'rsatiladi;
  o'rniga `tg_id` bo'yicha berish formasi taklif qilinadi.
- **Mavjud anonim qatorga `tg_id` biriktirish** — noto'g'ri biriktirish
  boshqa odamning qatorini egallaydi, alohida qaror talab qiladi.
- **`@username` dan `tg_id` ni aniqlash** — Bot API buni oddiy
  foydalanuvchilar uchun ishonchli qilmaydi. `tgUsername` faqat belgi
  (label) sifatida saqlanadi.
- **Obuna narxini yoki `TRIAL_DAYS` ni paneldan o'zgartirish** — kod
  konstantasi bo'lib qoladi.
- **Foydalanuvchini o'chirish / bloklash** — alohida spec.

## Texnik

| Fayl | O'zgarish |
|---|---|
| `admin.html` | jadval ustunlari, qidiruv/filtr, `+7/+30/+90/✕` tugmalari, 6 ta kartochka |
| `admin` Edge Function | `stats` kengaytiriladi (`q`, `ent`, obuna+usage ustunlari), yangi `grant_sub` action |
| DB migration | `payments.source` ustuni |
| `scripts/check-schema.sql` | `payments.source` mavjudligini tekshirish qatori |
| `docs/specs/subscription-stars.md` | `payments` DDL'ga `source` qo'shiladi |
| `CLAUDE.md` | admin panel bo'limi yangilanadi |

**MUHIM — `admin` funksiyasining manbasi bu repoda yo'q.** `supabase/functions/`
da faqat `chat`, `progress`, `billing`, `tg-webhook` bor. O'zgartirishdan oldin
Supabase MCP `get_edge_function` bilan deploy qilingan manbani olib kelish,
undan keyin tahrirlash va `deploy_edge_function` bilan **`verify_jwt: false`**
qilib qayta deploy qilish shart. Taxmin bilan yozish mumkin emas.

**MUHIM — obuna faqat `tg_id` bor foydalanuvchida ishlaydi.** `chat/index.ts`
da `tgEnabled && !tg → 'free'`: `bot_token` o'rnatilgan (o'rnatilgan holatda),
`initData` kelmasa entitlement har doim `free`. Ya'ni `tg_id` bo'lmagan
foydalanuvchi qatoriga `subscription_until` yozish **hech narsa bermaydi**.
Bundan tashqari `payments.tg_id` — `not null`. Shuning uchun `grant_sub`
`tg_id` yo'q bo'lsa xato qaytaradi va UI tugmani `disabled` qiladi.

`entitlementOf()` **to'rtinchi nusxasi yaratilmaydi** — `admin` funksiyasiga
`chat`/`billing` dagi bilan aynan bir xil funksiya ko'chiriladi (Edge
Function'lar modul bo'lishmaydi). `TRIAL_DAYS = 7`, `DAY_MS` konstantalari ham.

## Qoidalar (EARS)

### Ko'rish

- QACHON admin `stats` so'rasa
  TIZIM har foydalanuvchi uchun `entitlementOf(row, now)` ni hisoblashi SHART
  VA `subscription_until` bor bo'lsa qolgan kunni (`ceil((until - now)/DAY)`) qaytarishi SHART
  VA bugungi va jami `usage` sonini qaytarishi SHART
  VA `last_seen desc` bo'yicha eng ko'pi 100 ta qator qaytarishi SHART.

- QACHON `q` parametri bo'sh bo'lmasa
  TIZIM `name ilike %q%` YOKI `tg_username ilike %q%` bo'yicha filtrlashi SHART
  VA `q` butun son bo'lsa `tg_id = q` shartini ham OR bilan qo'shishi SHART.

- QACHON `ent` parametri berilsa
  TIZIM uni sana shartiga aylantirishi SHART:
  `active` → `subscription_until > now`;
  `trial` → `(subscription_until is null OR <= now)` VA `(trial_started_at is null OR trial_started_at > now - 7d)`;
  `free` → `(subscription_until is null OR <= now)` VA `trial_started_at <= now - 7d`.

### Obuna berish

- QACHON admin `grant_sub` ni `days ∈ {7,30,90}` bilan yuborsa
  VA autentifikatsiya to'g'ri bo'lsa
  VA foydalanuvchida `tg_id` bo'lsa
  TIZIM `from = max(now, mavjud subscription_until)` ni hisoblashi SHART
  VA `subscription_until = from + days` qilib yozishi SHART
  VA `users` yozuvi muvaffaqiyatli bo'lgandan **keyin** `payments` ga
  `source='manual'`, `stars=0`, `charge_id='manual:<userId>:<ISO>'` qatorini yozishi SHART
  VA yangi `subscription_until` va `entitlement` ni qaytarishi SHART.

- AGAR foydalanuvchida `tg_id` bo'lmasa
  TIZIM `400` va "Bu foydalanuvchida Telegram ID yo'q — obuna ishlamaydi" xabarini qaytarishi SHART
  VA `users` ni ham, `payments` ni ham o'zgartirMASLIGI SHART.

- AGAR `days` ruxsat etilgan qiymatlar (`7 | 30 | 90 | -1`) dan tashqarida bo'lsa
  TIZIM `400` qaytarishi SHART
  VA hech narsa yozMASLIGI SHART.

- QACHON `days === -1` bo'lsa
  TIZIM `subscription_until = null` qilishi SHART
  VA `payments` ga yozMASLIGI SHART
  VA `trial_started_at` ga tegMASLIGI SHART (trial qayta boshlanmasin).

- AGAR `users` yozuvi xato bersa
  TIZIM `payments` ga yozMASLIGI SHART
  VA adminga xatoni ko'rsatishi SHART.

- AGAR `username`/`password` `app_secrets` dagi bilan mos kelmasa
  TIZIM `401` qaytarishi SHART
  VA hech qanday foydalanuvchi ma'lumotini qaytarMASLIGI SHART.

### UI

- QACHON `grant_sub` muvaffaqiyatli bo'lsa
  TIZIM faqat shu qatorni yangilashi SHART (butun panelni qayta yuklaMASLIGI)
  VA "Obuna: <sana> gacha" toast ko'rsatishi SHART.

- QACHON tugma bosilsa
  TIZIM javob kelguncha tugmani `disabled` qilishi SHART (ikki marta bosish
  ikki marta uzaytirmasin).

- AGAR foydalanuvchida `tg_id` bo'lmasa
  TIZIM `+7/+30/+90` tugmalarini `disabled` ko'rsatishi SHART
  VA sababni `title` atributida yozishi SHART.

## Acceptance criteria

- [ ] Jadvalda har foydalanuvchi uchun obuna holati va qolgan kun ko'rinadi
- [ ] Bugungi/jami so'rov soni har foydalanuvchi uchun ko'rinadi
- [ ] Qidiruv `name`, `@username` va `tg_id` bo'yicha ishlaydi
- [ ] `Active/Trial/Free` filtri to'g'ri ajratadi
- [ ] `+30` bosilganda obuna 30 kunga uzayadi, qator darhol yangilanadi
- [ ] Mavjud obunasi bor userga `+30` bosilsa **ustiga qo'shiladi**, almashtirilmaydi
- [ ] `✕` bosilganda obuna bekor bo'ladi, `trial_started_at` o'zgarmaydi
- [ ] `tg_id` yo'q userda tugmalar `disabled`
- [ ] Har qo'lda berish `payments` da `source='manual'` bilan ko'rinadi
- [ ] Umumiy statistikada faol obunachi va trial soni to'g'ri
- [ ] Ro'yxat eng ko'pi 100 ta qator qaytaradi
- [ ] `admin` funksiyasi `verify_jwt: false` bilan deploy qilingan
- [ ] `scripts/check-schema.sql` `payments.source` ni tekshiradi va o'tadi

## Test (MAJBURIY — pul va admin huquqlariga tegadi)

Bu feature obuna muddatini o'zgartiradi va admin autentifikatsiyasidan
foydalanadi. Quyidagilar **qo'lda** tekshiriladi, deploydan oldin:

1. **Auth** — noto'g'ri parol bilan `grant_sub` yuborilsa `401` qaytadi va DB
   o'zgarmaydi (`select subscription_until` bilan tasdiqlanadi).
2. **Kalitlar oqmaydi** — panel yuklanganda Network tab'da hech bir javobda
   to'liq API kalit, `bot_token` yoki `admin_password` yo'q; `users` javobida
   faqat kerakli ustunlar bor.
3. **Uzaytirish matematikasi** — obunasi 10 kun qolgan test userga `+30`
   bosiladi → `subscription_until` 40 kunga siljiydi (10 kun yo'qolmaydi).
4. **Obunasi tugagan** userga `+7` bosiladi → `now + 7 kun` (o'tmishdan emas).
5. **Ikki marta bosish** — tugma tez ikki marta bosilsa faqat bitta so'rov
   ketadi (`disabled`), obuna bir marta uzayadi.
6. **`tg_id` yo'q user** — `grant_sub` to'g'ridan-to'g'ri `curl` bilan
   yuborilsa `400` qaytadi, `users` va `payments` o'zgarmaydi.
7. **Real to'lov statistikasi buzilmaydi** — `select count(*) from payments
   where source='stars'` migration'dan oldingi son bilan bir xil.
8. **Uchidan uchiga** — qo'lda obuna berilgan test user Mini App'ni ochsa,
   `billing status` `active` qaytaradi va bloklangan rejimlar ochiladi.
9. **Bekor qilish** — `✕` dan keyin foydalanuvchi `trial` ga **qaytmaydi**
   (agar trial'i tugagan bo'lsa `free` bo'ladi).
10. **`entitlementOf` mosligi** — `admin` dagi nusxa `chat` va `billing`
    dagilar bilan aynan bir xil (uchala fayl solishtiriladi).
