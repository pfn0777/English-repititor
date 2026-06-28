# Spec: Speaking uchun ovozli xabar (audio → Gemini)

## Maqsad
Foydalanuvchi chatda mikrofon orqali ovozli xabar yuborsin; backend audioni Gemini'ga (multimodal)
jo'natib, transkripsiya + talaffuz/ravonlik/grammatika bo'yicha baho oladi (IELTS Speaking band bilan).

## Nega kerak
Hozir faqat matn kiritiladi — IELTS Speaking yoki umuman gapirishni mashq qilib bo'lmaydi.
Talaffuzni faqat haqiqiy ovoz orqali baholash mumkin. Telegram Mini App ichida ham ishlashi shart.

## Qamrov ICHIDA
- Chat input'ida mikrofon tugmasi: bosib yozish, qayta bosib to'xtatish (max 60s, auto-stop).
- `MediaRecorder` + `getUserMedia` bilan audio yozish, base64'ga o'girib backend'ga yuborish.
- Chatda ovoz pufakchasi (`<audio controls>`).
- `chat` Edge Function `audio: { data, mimeType }` qabul qiladi; audio bo'lsa Gemini'ga `inline_data` bilan.
- Audio uchun alohida hajm/mimeType validatsiya.
- 1 ovoz = 1 `usage` qatori (limit hozirgidek).

## Qamrov TASHQARISIDA (qilinmaydi)
- Web Speech API (brauzer nutq tanish) — haqiqiy audio tanlandi.
- Claude bilan audio — qo'llamaydi; audio bo'lsa Gemini'ga yo'naltiriladi.
- Audioni DB/Storage'ga saqlash — yo'q.
- Audio history qayta yuborish — yo'q (keyingi navbatda transkripsiya matn sifatida qoladi).
- Real-time streaming/dictation — yo'q.

## Texnik
- Component: `index.html` (mic tugma, recorder, `callAI(msg, {audio})`, `appendAudioMsg`)
- Edge Function: `chat` (audio qabul + Gemini multimodal), source: `supabase/functions/chat/index.ts`
- DB: o'zgarmaydi
- Migration: kerak emas
- Config: `MAX_AUDIO_B64=2_000_000`, mimeType allowlist
- Locale: UI o'zbekcha

## Qoidalar (EARS)
- QACHON foydalanuvchi ovozli xabar yuborsa
  TIZIM audioni Gemini'ga yuborishi SHART
  VA active_provider claude bo'lsa ham Gemini'ga yo'naltirishi SHART.

- AGAR `gemini_key` yo'q bo'lsa
  TIZIM aniq xato (503) qaytarishi SHART
  VA hech qanday kalitni clientga chiqarMASLIGI SHART.

- AGAR audio hajmi `MAX_AUDIO_B64` dan oshsa yoki mimeType allowlist'da bo'lmasa
  TIZIM uni rad etishi SHART (413/400).

- QACHON foydalanuvchi limiti tugagan bo'lsa
  TIZIM ovozli so'rovni ham bloklashi SHART (429) — matn bilan bir xil hisob.

## Acceptance criteria
- [ ] Chatda 🎤 tugma bor, bosilganda yoziladi, qayta bosilganda to'xtaydi
- [ ] Ovoz pufakchasi chatda ko'rinadi va eshitiladi
- [ ] AI transkripsiya + talaffuz/ravonlik baho beradi; IELTS'da `🎯 Band: X.X`
- [ ] `gemini_key` yo'q bo'lsa aniq xato, kalit oqmaydi
- [ ] Katta/noto'g'ri audio rad etiladi
- [ ] Mikrofon ruxsati rad etilsa toast chiqadi (crash yo'q)

## Test (MAJBURIY — pul/limit/xavfsizlik)
- 🎤 bos → gapir → to'xtat → ovoz + AI baho keladimi
- IELTS goal'da Speaking band chiqadimi
- per-user `daily_limit=1` → 2-ovoz 429
- 60s'dan uzun → auto-stop; juda katta audio → 413
- `active_provider=claude` + `gemini_key` bor → audio Gemini'ga ketib ishlaydimi
- `gemini_key` bo'sh → 503, kalit oqmasligini tekshir
- Telegram WebApp'da mic ishlashi; ruxsat rad etilsa toast
