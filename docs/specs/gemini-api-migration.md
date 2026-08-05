# Spec: Vertex AI'dan Gemini API (Tier 1)ga o'tish

## Maqsad
Vertex AI Express trial tugagani sababli, chat backend AI so'rovlarini Google AI Studio Gemini API (Tier 1, billing ulangan) orqali yuborishga o'tkazish.

## Nega kerak
Vertex AI kalit muddati/trial tugagan — AI javob bermay qolgan yoki qolishi mumkin. Loyihada hozircha foydalanuvchi kam, shu bois Tier 1 Gemini API (Gemini 2.5 Flash uchun 1000 RPM / 10 000 RPD — AI Studio dashboard'dan tasdiqlangan) yetarlicha keng zaxiraga ega va narxi juda arzon.

## ⚠️ Pul ogohlantirishi
Loyihaning "AI pimov" Google Cloud proyektida (`gen-lang-client-0770318041`) billing allaqachon ulangan (Tier 1). Demak bu endi to'liq bepul emas — token bo'yicha kichik summalar yechiladi. Shu sabab test bo'limi majburiy va budget alert tavsiya qilinadi.

## Qamrov ICHIDA
- Admin panelda (`admin.html`) mavjud Gemini kalit maydoniga yangi AI Studio Tier 1 kalitini (`AIza...` prefiksli) kiritish.
- Backend (`chat/index.ts`) kod o'zgarishisiz ishlaydi — kalit prefiksiga (`AIza`) qarab avtomatik `generativelanguage.googleapis.com` endpointiga yo'naltiradi (mavjud logika, [chat/index.ts:125-128](../../supabase/functions/chat/index.ts#L125)).
- Model nomi admin panelda `gemini-2.5-flash` deb tasdiqlanadi (bo'sh qoldirilsa ham shu default ishlatiladi — [chat/index.ts:107](../../supabase/functions/chat/index.ts#L107)).
- Gemini'dan 429 (rate limit/quota) xatosi kelganda, foydalanuvchiga hozirgi umumiy "AI xatosi" o'rniga alohida tushunarli xabar: "Hozir band, biroz kuting va qayta urinib ko'ring."
- Google Cloud Console'da "AI pimov" proyekti uchun xarajat budget alert o'rnatish tavsiyasi (qo'lda, admin tomonidan).
- Eski Vertex kalitini almashtirilgach ishlamay qolishini tasdiqlash.

## Qamrov TASHQARISIDA (bularni qilma!)
- Vertex AI bilan bog'liq kodni o'chirish — kod ikkalasini ham qo'llab-quvvatlaydi, kelajakda Vertex'ga qaytish imkoniyati saqlanadi.
- Gemini limit oshganda Claude'ga avtomatik fallback — keyingi versiyaga qoldiriladi.
- `GLOBAL_DAILY_LIMIT`/`daily_limit` qiymatlarini o'zgartirish — joriy standart (2000/kun) Tier 1'ning 10 000 RPD zaxirasidan past, xavfsiz, o'zgartirish shart emas.
- RPM darajasida navbat/throttling — 1000 RPM zaxirasi joriy kam-foydalanuvchi holatiga yetarli.
- Budget alert'ni kod orqali avtomatlashtirish — Cloud Console UI orqali qo'lda qilinadi.

## Texnik
- Backend: `supabase/functions/chat/index.ts` — faqat Gemini javobidan xato kelganda 429 statusni alohida ushlab, maxsus xabar qaytarish qo'shiladi (mavjud oqimga kichik filial, [chat/index.ts:134-136](../../supabase/functions/chat/index.ts#L134) atrofida).
- Admin: `admin.html` — kod o'zgarishi yo'q, faqat mavjud UI orqali kalit/model qiymati yangilanadi ([admin.html:150](../../admin.html#L150) atrofida).
- DB: o'zgarish yo'q.
- Migration: yo'q.
- Config: yo'q — kalit `app_secrets.gemini_key` ustunida, allaqachon mavjud.
- Tashqi: Google Cloud Console'da budget alert (kod tashqarisida, qo'lda).

## Qoidalar (EARS)
- QACHON admin `app_secrets.gemini_key`ni yangi Tier 1 AI Studio kalitiga (`AIza...` prefiksli) yangilasa
  TIZIM keyingi so'rovlarda avtomatik `generativelanguage.googleapis.com` endpointini ishlatishi SHART
  VA Vertex (`aiplatform.googleapis.com`) endpointiga so'rov yubormasligi SHART.

- QACHON Gemini API javobi 429 status (rate limit/quota oshgan) qaytarsa
  TIZIM foydalanuvchiga "Hozir band, biroz kuting va qayta urinib ko'ring" xabarini qaytarishi SHART
  VA bu holatni umumiy "AI xatosi" xabaridan ajratishi SHART.

- AGAR Gemini API boshqa (429 bo'lmagan) xato qaytarsa
  TIZIM hozirgi umumiy "AI xatosi" xabarini davom ettirishi SHART (o'zgarish yo'q).

- QACHON eski Vertex kaliti o'chirilib, yangi kalit kiritilsa
  TIZIM eski kalit bilan endi so'rov yubormasligi SHART.

## Acceptance criteria
- [ ] Admin panelda yangi Tier 1 AI Studio kalit saqlangach, chat javob berayapti (matn mode)
- [ ] Ovozli xabar (audio) rejimi ham yangi kalit bilan ishlayapti (audio har doim Gemini orqali yuboriladi)
- [ ] Model sifatida `gemini-2.5-flash` ishlatilyapti (admin panel `model` maydonida tasdiqlangan)
- [ ] Gemini 429 qaytarganda foydalanuvchi "Hozir band, biroz kuting" xabarini ko'radi, generic "AI xatosi" emas
- [ ] Boshqa Gemini xatolari hali ham umumiy "AI xatosi" bilan ishlaydi (regressiya yo'q)
- [ ] Google Cloud Console'da budget alert o'rnatilgan (qo'lda, admin tomonidan)

## Test (MAJBURIY — billing/pulga tegadi)
- Yangi kalit bilan oddiy matn xabar yuborib, javob kelishini tekshir
- Ovozli xabar yuborib, javob kelishini tekshir (Gemini audio yo'li)
- Network/DevTools'da kalitning brauzerga chiqmasligini qayta tasdiqla (mavjud xavfsizlik talabi buzilmagani)
- Google Cloud Console > Billing'da joriy oy xarajati kutilganidek past (bir necha sentga yaqin yoki $0) ekanini tekshir
