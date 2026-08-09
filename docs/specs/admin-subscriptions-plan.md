# Reja: Admin panel — obuna boshqaruvi va faoliyat

Spec: `docs/specs/admin-subscriptions.md`

## Aniqlangan faktlar (tekshirildi, taxmin emas)

- Supabase loyihasi `wbcwavqbxjflgtxepdmf` — `ACTIVE_HEALTHY`.
- `admin` funksiyasi v4, `verify_jwt: false`. Manbasi olib kelindi.
- `payments` jadvalida `source` ustuni **yo'q**, `tg_id` — **not null**,
  jadval **bo'sh (0 qator)** → migration hech narsani buzmaydi.
- `users` — 18 qator, `usage` — 213 qator.
- Hozirgi `stats` 200 ta userni oladi va `byMode` uchun 5000 ta `usage`
  qatorini brauzergacha emas, funksiyagacha tortadi.

## O'zgaradigan / yangi fayllar

1. **DB migration** (`apply_migration`) — `payments.source` ustuni + indeks.
2. **DB funksiya** (`apply_migration`) — `admin_user_rows(q, ent, lim)`
   SQL funksiyasi: `users` + `usage` agregatini bitta so'rovda qaytaradi,
   qidiruv va entitlement filtri SQL ichida.
3. **`supabase/functions/admin/index.ts`** — YANGI fayl (repoga tushiriladi):
   olib kelingan v4 manbasi + `stats` kengaytmasi + `grant_sub` action.
4. **`admin.html`** — jadval ustunlari, qidiruv/filtr, `+7/+30/+90/✕`,
   6 ta statistika kartochkasi.
5. **`scripts/check-schema.sql`** — `payments.source` va funksiya grant'i
   tekshiruvi.
6. **`docs/specs/subscription-stars.md`** — `payments` DDL'iga `source`.
7. **`CLAUDE.md`** — admin panel va `admin` funksiyasi bo'limi.

## Qadamlar

### 1. Migration: `payments.source`

```sql
alter table payments add column source text not null default 'stars';
create index if not exists payments_source_idx on payments (source);
```

### 2. Migration: `admin_user_rows()` SQL funksiyasi

Nega funksiya: `supabase-js` da `group by` yo'q. Har user uchun `usage`
sonini alohida so'rov bilan olish 18 ta userda 36 ta so'rov demakdir — bu
o'smaydi. Bitta SQL funksiya hammasini bir marta qaytaradi.

Qaytaradi: `id, name, level, goal, daily_limit, last_seen, tg_id,
tg_username, trial_started_at, subscription_until, ent, days_left,
today_req, total_req`.

`ent` SQL ichida hisoblanadi va `chat`/`billing` dagi `entitlementOf` bilan
**aynan bir xil** mantiqda (`subscription_until > now` → active; `trial_started_at
is null` → trial; `trial_started_at + 7d > now` → trial; qolgani free).

**Xavfsizlik:** Postgres'da yangi funksiya default'da `PUBLIC` ga
`execute` beradi. Anon kalit brauzerda ochiq turgani uchun bu butun
foydalanuvchi bazasini oshkor qiladi. Shuning uchun migration'da:

```sql
revoke all on function admin_user_rows(text, text, int) from public, anon, authenticated;
grant execute on function admin_user_rows(text, text, int) to service_role;
```

Funksiya `security invoker` bo'ladi (default) — service_role RLS'ni
allaqachon aylanib o'tadi, `security definer` kerak emas.

### 3. `supabase/functions/admin/index.ts` — repoga tushirish

Olib kelingan v4 manbasi o'zgarishsiz yoziladi, keyin ustiga
o'zgartirishlar kiritiladi. Bu spec'dagi 💡 taklif — keyingi safar
"deploy qilingan versiya repodan farq qiladi" muammosi bo'lmaydi.

### 4. `admin` funksiyasi: `stats` kengaytmasi

- `users` so'rovi o'rniga `db.rpc('admin_user_rows', { q, ent, lim: 100 })`.
- Yangi hisoblar: `activeSubs`, `trialUsers` (bitta `count` so'rovi bilan).
- `GLOBAL_DAILY_LIMIT` (env, default 2000) javobga qo'shiladi — panel
  `312/2000` ko'rsatishi uchun.
- `byMode` o'zgarishsiz qoladi.

### 5. `admin` funksiyasi: `grant_sub` action

`chat`/`billing` dagi bilan bir xil `entitlementOf()` va `TRIAL_DAYS`
konstantasi ko'chiriladi (Edge Function'lar modul bo'lishmaydi).

Tartib qat'iy:
1. `days ∈ {7,30,90,-1}` tekshiruvi → aks holda `400`.
2. Userni o'qish; `tg_id` yo'q bo'lsa `400` (spec'dagi sabab).
3. `days === -1` → `subscription_until = null`, `payments` ga yozilmaydi.
4. `days > 0` → `from = max(now, mavjud until)`, yangi sana yoziladi.
5. `users` update **muvaffaqiyatli bo'lgandan keyin** `payments` ga
   `source='manual'`, `stars=0` qatori yoziladi. Teskari tartib emas —
   `tg-webhook` da tartib teskari, chunki u yerda pul allaqachon olingan;
   bu yerda pul yo'q, shuning uchun yozuv faqat haqiqiy o'zgarishga.
6. Javob: `{ ok, subscription_until, ent, days_left }`.

### 6. `admin.html` — UI

- Jadval: 9 ustun (spec'dagi jadval).
- Qidiruv input (300ms debounce) + 4 ta filtr tugmasi → `renderPanel()`
  parametr bilan qayta chaqiriladi.
- `+7/+30/+90` va `✕` tugmalari; bosilganda `disabled`, javob kelgach
  **faqat shu `<tr>` qayta chiziladi** (butun panel emas — qidiruv holati
  yo'qolmasin).
- `tg_id` yo'q bo'lsa tugmalar `disabled` + `title` bilan sabab.
- `✕` uchun `confirm()` — obunani bexosdan o'chirib yubormaslik uchun.
- 6 ta kartochka.

### 7. Deploy va tekshirish

- `deploy_edge_function` bilan **`verify_jwt: false`** (default `true` —
  unutilsa panel butunlay ishlamay qoladi).
- `scripts/check-schema.sql` yangilanadi va ishga tushiriladi.
- Spec'dagi 10 punktli qo'lda test ro'yxati bajariladi.
- `node scripts/test-program.mjs` — bu o'zgarish `index.html` ga tegmaydi,
  lekin regressiya yo'qligini tasdiqlash uchun baribir yuritiladi.

## Xavf (qo'lda tekshirish shart)

| Xavf | Nima bo'lishi mumkin | Tekshiruv |
|---|---|---|
| `admin_user_rows` ga `anon` execute qolib ketishi | Butun user bazasi brauzerdan o'qiladi | Anon kalit bilan `rpc` chaqirib `401/403` olinishi |
| `verify_jwt: true` bilan deploy | Panel butunlay ishlamaydi | Deploydan keyin login sinovi |
| Obuna sanasi matematikasi | Foydalanuvchi kunlarini yo'qotadi yoki bepul oy oladi | Spec test 3 va 4 |
| Ikki marta bosish | Obuna 2x uzayadi | Spec test 5 |
| `payments` ga `stars=0` yozuv | Daromad hisobini buzishi | `source='stars'` filtri bilan hisoblash (spec test 7) |
| `entitlementOf` 4 ta nusxaga bo'linishi | Panel bir narsa, server boshqa narsa ko'rsatadi | 3 ta TS fayl + SQL funksiyani solishtirish (spec test 10) |
