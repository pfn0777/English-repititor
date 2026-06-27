# Spec: IELTS repetitori + umumiy tutor kuchaytirish

## Maqsad
EnglishBot'ni (`index.html`) `language-tutor` skill talablariga to'liq moslab kuchaytirish va `goal='ielts'` tanlanganda mavjud rejimlarni to'laqonli IELTS imtihon repetitoriga aylantirish (Writing, Speaking, Reading, Listening + band score 0-9).

## Nega kerak
Hozir app umumiy suhbat repetitori sifatida ~70%, IELTS repetitori sifatida ~15%. Skillda majburiy bo'lgan talaffuz yo'q, IELTS'ning band scoring tuzilmasi umuman yo'q. Bu o'zgarish app'ni real imtihonga tayyorlovchi vositaga aylantiradi.

## Qamrov ICHIDA

### A. Umumiy tutor tuzatishlari (language-tutor skillga moslash)
- **Talaffuz qo'shish**: yangi so'z formati `📌 **word** (talaffuz) — [o'zbekcha]` ko'rinishiga o'tadi. `parseWords` regex va system prompt yangilanadi, lug'atda talaffuz saqlanadi va ko'rsatiladi.
- **Quiz session lug'atidan**: viktorina mumkin bo'lsa shu suhbatda chiqqan so'zlardan tuziladi (system prompt orqali).
- **Ruhiy holatga moslashish**: system promptga "agar foydalanuvchi qiynalsa — soddalashtir, qo'llab-quvvatla" qoidasi qo'shiladi.

### B. IELTS rejimi (goal='ielts' bo'lganda mavjud rejimlar moslashadi)
- **Speaking** (conversation rejimi): IELTS Speaking Part 1/2/3. Part 2 da cue card + 1 daqiqa tayyorgarlik + monolog. Har bo'limdan keyin band feedback (Fluency, Lexical, Grammar, Pronunciation).
- **Writing** (correction rejimi): foydalanuvchi Task 1 (grafik/diagramma tasvirlash, 150+ so'z) yoki Task 2 (esse, 250+ so'z) yozadi. AI 4 mezon bo'yicha (Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range) baholaydi + umumiy band + model jumlalar.
- **Reading** (story rejimi): IELTS uslubidagi passage + savol turlari (True/False/Not Given, Matching Headings, Multiple Choice). Javoblar tekshiriladi, band konvertatsiyasi ko'rsatiladi.
- **Listening** (quiz rejimi): AI matn yaratadi → browser TTS (`speechSynthesis`) o'qiydi → savollar beriladi. Chatda "🔊 Tinglash" tugmasi.
- **Grammar** rejimi: IELTS uchun lexical resource va murakkab grammatika (linking words, complex sentences).
- **Daily** rejimi: kunlik 5 daqiqalik IELTS mini-mashqi (har safar boshqa bo'lim).

### C. Band score tracking
- AI javobida standart marker: `🎯 Band: X.X`. `parseBand` funksiyasi uni ajratib oladi.
- `user.ielts = { targetBand, scores: [{section, band, date}], }` strukturasi saqlanadi.
- Onboarding'da goal=ielts tanlansa — target band tanlash (5.0–8.0).
- Progress sahifada: o'rtacha band, target band, bo'limlar bo'yicha oxirgi ballar.

## Qamrov TASHQARISIDA (bularni qilma!)
- **Haqiqiy IELTS audio fayllar** — backend/fayl talab qiladi; Listening faqat browser TTS bilan. Keyingi versiyada.
- **To'liq mock test (timer bilan)** — hozircha bo'lim-bo'lim mashq. Keyin.
- **PDF natija/sertifikat** — keyingi versiyaga.
- **Speaking ovozli javob (mikrofon/STT)** — hozircha matn orqali. Keyin.
- **Claude provayderi uchun alohida IELTS logikasi** — system prompt ikkalasiga ham bir xil ishlaydi, alohida ish kerak emas.

## Texnik
- Component: `index.html` (yagona fayl, vanilla JS)
- O'zgaradigan funksiyalar:
  - `buildSystem(mode)` — goal=ielts shoxobchasi (har rejim uchun IELTS yo'riqnomasi)
  - `parseWords(text)` — talaffuz qo'llab-quvvatlash (regex + struktura)
  - yangi `parseBand(text)` — band score ajratish va saqlash
  - `GOAL_SCENARIOS` / yangi `IELTS_GUIDE` konstanta
  - `renderOnboarding` — goal=ielts uchun target band selektori
  - `renderProgress` — IELTS band bloki
  - `renderChat` — Listening rejimida TTS tugmasi
  - yangi `speakText(text)` — `speechSynthesis` wrapper
- DB: yo'q (localStorage). `user` obyektiga `ielts` maydoni qo'shiladi (backward-compatible, default bo'sh).
- Migration: kerak emas — eski user'larda `user.ielts` bo'lmasa default yaratiladi.
- Config: yo'q
- Locale: UI o'zbekcha, IELTS kontenti inglizcha (skill qoidasiga mos)

## Qoidalar (EARS uslubida)
- QACHON foydalanuvchi goal='ielts' bilan correction (Writing) rejimida matn yuborsa
  TIZIM 4 IELTS mezoni bo'yicha baho berishi SHART
  VA umumiy band score'ni `🎯 Band: X.X` formatida chiqarishi SHART
  VA bandni `user.ielts.scores` ga saqlashi SHART.

- QACHON foydalanuvchi Listening (quiz) rejimida bo'lsa
  VA goal='ielts' bo'lsa
  TIZIM audio matnni `speechSynthesis` orqali o'qishi SHART
  VA matnni ekranda darrov ko'rsatMASLIGI SHART (avval tinglash).

- QACHON AI javobida yangi so'z bo'lsa
  TIZIM uni `📌 **word** (talaffuz) — [tarjima]` formatida berishi SHART.

- AGAR `speechSynthesis` brauzerda mavjud bo'lmasa
  TIZIM "Brauzeringiz audio qo'llamaydi, matn ko'rsatildi" deb ogohlantirishi SHART
  VA matnni darrov ko'rsatishi SHART.

- AGAR band marker `🎯 Band:` topilmasa
  TIZIM progress'ni o'zgartirMASLIGI SHART (silent, xato emas).

## Acceptance criteria (tugadi deganda)
- [ ] goal=ielts'da correction rejimi esseni 4 mezon + band bilan baholaydi
- [ ] Band score Progress sahifada o'rtacha va target bilan ko'rinadi
- [ ] Listening rejimida 🔊 tugma matnni ovoz bilan o'qiydi
- [ ] Speaking rejimi Part 1/2/3 va cue card beradi
- [ ] Reading rejimi passage + T/F/NG savol beradi va tekshiradi
- [ ] Yangi so'zlar talaffuz bilan saqlanadi va lug'atda ko'rinadi
- [ ] Eski (IELTS bo'lmagan) foydalanuvchilar uchun hech narsa buzilmaydi
- [ ] goal≠ielts'da rejimlar avvalgidek umumiy repetitor sifatida ishlaydi

## Test (band/progress saqlashga tegadi — qo'lda tekshiriladi)
- Writing essesiga band qaytsa → localStorage `eb_user.ielts.scores` ga yozildimi
- target band tanlanmasa → default (masalan 6.5) ishlatiladimi, crash bo'lmasinmi
- band markeri yo'q javobda → progress o'zgarmasinmi (silent)
- TTS yo'q brauzerda → fallback matn ko'rsatilsinmi
- eski user (ielts maydoni yo'q) → init'da crash bo'lmasinmi
