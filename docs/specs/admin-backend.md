# Spec: Backend + Admin panel (kalitlarni yashirish, user count, limit, statistika)

## Maqsad
API kalitlarni (Gemini/Claude) brauzerdan butunlay olib tashlab, Supabase backend (proxy) orqali serverda saqlash. Faqat admin ko'ra/o'zgartira oladigan admin panel qo'shish: foydalanuvchilar soni/ro'yxati, model tanlash, kunlik limit, foydalanish statistikasi.

## Nega kerak
Hozir app sof client-side: API kalit brauzerda saqlanadi va istalgan foydalanuvchi DevTools orqali o'qiy oladi → kalit sizib chiqadi, kvota/balans o'g'irlanadi. Foydalanuvchilarni sanab ham bo'lmaydi (localStorage har brauzerga xos). Backend bu ikkala muammoni ham hal qiladi.

## ⚠️ Xavfsizlik/pul ogohlantirishi
Bu spec API kalitlar, pul (kvota/balans) va admin huquqlariga tegadi. Shuning uchun **test bo'limi majburiy**. Asosiy qoida: **kalit hech qachon non-admin brauzerga yuborilmaydi**.

## Qamrov ICHIDA

### Backend (Supabase)
- **DB jadvallari:**
  - `app_secrets` — `gemini_key`, `claude_key`, `active_provider`, `model`, `daily_limit`. RLS: faqat service-role o'qiydi (hech qaysi client emas).
  - `users` — `id` (uuid, brauzer tomonidan generatsiya), `name`, `level`, `goal`, `created_at`, `last_seen`.
  - `usage` — `user_id`, `mode`, `provider`, `created_at`. Limit va statistika uchun.
  - `admins` — yoki Supabase Auth orqali bitta admin email (admin parol secret sifatida).
- **Edge Function `chat`:** `{ userId, provider, system, messages, mode }` qabul qiladi → kunlik limitni tekshiradi → AI API'ga (kalit serverda) so'rov yuboradi → javob qaytaradi → `usage` ga yozadi. Limit oshsa 429 + xabar.
- **Edge Function `admin`:** admin auth tekshiradi → user count/list, statistika, sozlama (model/limit/kalit) o'qish/yozish.

### Frontend (index.html)
- 🔑 va provayder (🔵/🟣) tugmalari **olib tashlanadi** (oddiy foydalanuvchiga ko'rinmaydi).
- `callGemini`/`callClaude` o'rniga `callAI` Edge Function `chat`ni chaqiradi.
- Har brauzer uchun anonim `userId` (uuid) localStorage'da; birinchi kirishda backendga `users` yoziladi.
- Limit oshganda foydalanuvchiga "Bugungi limit tugadi" xabari.

### Admin panel (alohida sahifa: `admin.html`)
- Admin login (Supabase Auth yoki admin parol → Edge Function tekshiradi).
- Ko'rsatadi: foydalanuvchilar soni + ro'yxat (daraja/maqsad), umumiy statistika (jami so'rovlar, rejimlar bo'yicha, faol kunlar).
- O'zgartiradi: aktiv provayder, model, kunlik limit, Gemini/Claude kalitlari.

## Qamrov TASHQARISIDA (bularni qilma!)
- **Har foydalanuvchi uchun real login/akkaunt** — hozircha anonim (uuid). Keyingi versiya.
- **To'lov/obuna** — yo'q.
- **localStorage progressni (XP/lug'at) serverga ko'chirish** — progress hozircha client'da qoladi; serverga faqat identity + usage boradi. Sync keyin.
- **Ko'p admin / rollar** — bitta admin yetarli.
- **Kalitni admin panelda ochiq matn ko'rsatish** — faqat "mavjud/yangilash" (xavfsizlik uchun maskalangan), to'liq ochiq ko'rsatilmaydi.

## Texnik
- Backend: Supabase (DB + Edge Functions, Deno/TypeScript)
- Frontend: `index.html` (mavjud), yangi `admin.html`
- Hosting: frontend Vercel'ga deploy (barqaror origin → CORS uchun). Edge Function CORS faqat shu originga ruxsat beradi.
- Maxfiylik: kalitlar Supabase secrets / `app_secrets` (service-role). Admin parol — secret.
- Config: `.env` (Supabase URL, anon key — bular public bo'lishi normal; service-role key faqat edge function ichida).
- Migration: yangi Supabase loyiha + 4 jadval + RLS policy.

## Qoidalar (EARS)
- QACHON oddiy foydalanuvchi xabar yuborsa
  TIZIM Edge Function `chat`ni `userId` bilan chaqirishi SHART
  VA API kalitni brauzerga HECH QACHON yubormasligi SHART.

- QACHON foydalanuvchining bugungi so'rovlari `daily_limit`ga yetsa
  TIZIM 429 va "Bugungi limit tugadi" qaytarishi SHART
  VA AI API'ga so'rov yubormasligi SHART.

- QACHON admin panelga kirilsa
  AGAR admin auth muvaffaqiyatsiz bo'lsa
  TIZIM hech qanday user/statistika/kalit ma'lumotini qaytarMASLIGI SHART.

- QACHON admin kalitni yangilasa
  TIZIM uni `app_secrets`ga (service-role) yozishi SHART
  VA javobida kalitni ochiq qaytarMASLIGI SHART (faqat "yangilandi").

- AGAR Edge Function ishlamasa/ulanmasa
  TIZIM foydalanuvchiga tushunarli xato ko'rsatishi SHART (kalit yoki ichki tafsilotsiz).

## Acceptance criteria
- [ ] index.html'da 🔑 va provayder tugmalari yo'q
- [ ] Oddiy foydalanuvchi DevTools'da API kalitni topa olmaydi (Network/Sources'da kalit yo'q)
- [ ] Xabar yuborilganda javob Edge Function orqali keladi
- [ ] Admin panelga faqat to'g'ri auth bilan kiriladi
- [ ] Admin panelda foydalanuvchilar soni va ro'yxati ko'rinadi
- [ ] Admin model va kunlik limitni o'zgartira oladi, o'zgarish kuchga kiradi
- [ ] Limit oshgan foydalanuvchiga xabar chiqadi, so'rov bloklanadi
- [ ] Statistika (jami so'rovlar, rejimlar) ko'rinadi

## Test (MAJBURIY — kalit/pul/admin huquqi)
- Non-admin client javobida yoki Network'da kalit YO'Qligini tekshir
- Admin auth noto'g'ri parol bilan → ma'lumot qaytmasinmi
- `daily_limit=2` qo'yib, 3-so'rov bloklanishini tekshir
- Limit hisoblash sana bo'yicha (ertasi kuni nollansinmi)
- Admin kalit yangilasa → eski kalit bilan so'rov ishlamay, yangi bilan ishlashini tekshir
- RLS: oddiy anon key bilan `app_secrets` o'qib bo'lmasligini tekshir
- Edge Function down → frontend toza xato ko'rsatsinmi (kalit oshkor bo'lmasin)
