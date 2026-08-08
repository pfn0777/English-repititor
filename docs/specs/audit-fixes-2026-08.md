# Spec: Code-review kamchiliklarini tuzatish (2026-08)

## Maqsad

`main...a1-lesson-and-exit-path` diffida topilgan 8 ta nuqsonni bosqichma-bosqich
tuzatish. Yangi funksiya qo'shilmaydi — faqat mavjud xatti-harakat to'g'rilanadi.

## Nega kerak

Ikkita nuqson **pul yo'qotadi yoki ma'lumot buzadi**, to'rttasi foydalanuvchini
ekranda qamab qo'yadi yoki mehnatini yo'qotadi, ikkitasi kelajakdagi refaktor
uchun mina. Hozir tuzatilmasa, birinchi haqiqiy Stars to'lovi bilan aniqlanadi.

Jonli bazada tekshirilgan holat (2026-08-08):

| Tekshiruv | Natija |
|---|---|
| `users.id` default | **yo'q edi** (uuid, NOT NULL) → tuzatildi |
| Dublikat `tg_id` qatorlari | 0 ta (aslida `tg_id` li qator umuman yo'q — 18 tasi anonim) |
| `users.tg_id` unikalligi | **BOR edi** — review xato aytgan, quyiga qarang |

### Review'ning 2-topilmasi noto'g'ri

Review "`users.tg_id` da UNIQUE yo'q" degan, chunki `pg_constraint` ni tekshirgan.
Aslida uniqueness **partial unique index** bilan ta'minlangan:

```
CREATE UNIQUE INDEX users_tg_id_key ON public.users USING btree (tg_id)
  WHERE (tg_id IS NOT NULL)
```

Partial index `pg_constraint` da ko'rinmaydi — faqat `pg_indexes` da. Himoya
joyida va oddiy UNIQUE constraint'dan yaxshiroq (NULL qatorlar aniq chetlab
o'tilgan). Hech narsa o'zgartirilmadi. `check-schema.sql` shu sababdan
`pg_indexes` ni tekshiradi, `pg_constraint` ni emas.

## Qamrov ICHIDA

Prioritet tartibida, 5 bosqich:

**Bosqich 1 — Pul (kritik)**
1. `users.id` ga `gen_random_uuid()` default (`tg_id` uniqueligi allaqachon bor edi)
2. `tg-webhook` dagi "hech kirmagan foydalanuvchi to'ladi" insertini tuzatish +
   xatoni tekshirish (xato bo'lsa "obuna faollashdi" xabari YUBORILMASIN)

**Bosqich 2 — UI qulflanishi**
3. `teardownRec()` `programBusy` va `chatBusy` ni tiklasin
4. `online` listener faqat dastur ekranida `renderProgram()` chaqirsin
5. `ch-mic` onclick `toggleRec` ga MouseEvent uzatmasin

**Bosqich 3 — Offline qobiq**
6. `sw.js` document tarmog'i faqat o'z origin'i uchun ishlasin
7. `sw.js` faqat `res.ok` javobni keshlasin

**Bosqich 4 — Streak**
8. Onboardingda `lastTaskDay` qo'yilmasin (streak bir kunga oshib ketmasin)

**Bosqich 5 — Qaytalanmasligi uchun**
9. `scripts/check-schema.sql` — kutilgan DB invariantlarini tekshiradigan so'rov.
   `.mjs` emas: loyihada package manager yo'q, service-role kalit lokal mashinada
   yo'q, va `pg_indexes` PostgREST orqali ko'rinmaydi. Supabase SQL editor yoki
   MCP `execute_sql` orqali ishga tushiriladi.
10. `scripts/test-program.mjs` ga yangi holatlar

## Qamrov TASHQARISIDA (bularni QILMA)

- **`init()` dagi `lastTaskDay = user.lastVisit` seed'iga tegilmaydi.** Bu ataylab
  qilingan (CLAUDE.md da hujjatlashtirilgan): eski foydalanuvchi yangilanishda
  streak'ini yo'qotmasin. Uni olib tashlash minglab foydalanuvchining streak'ini
  nolga tushiradi — bir kunlik noaniqlikdan ko'ra yomonroq.
- **`admin` funksiyasidagi plain-text parol solishtiruvi.** CLAUDE.md aniq aytadi:
  so'ramasdan "hardening" qilinmasin. Alohida qaror talab qiladi.
- **`payments` jadvaliga FK yoki yangi index** — hozirgi idempotentlik ishlayapti.
- **Kurikulum JSON mazmuni** — review uni struktura bo'yicha tekshirgan, so'zma-so'z
  emas. Bu alohida ish (`check-glosses.mjs`).
- **`currentView` uchun to'liq router** — faqat bitta o'zgaruvchi qo'shiladi, SPA
  navigatsiyasi qayta yozilmaydi.

## Texnik

| Qism | Fayl |
|---|---|
| DB migration | Supabase MCP `apply_migration` (project `wbcwavqbxjflgtxepdmf`) |
| Webhook | `supabase/functions/tg-webhook/index.ts` |
| Rec/nav/streak | `index.html` (§4.5, §7.5, Views, Onboarding) |
| Service worker | `sw.js` (`VERSION` `eb-v3` → `eb-v4`) |
| Yangi skript | `scripts/check-schema.sql` |
| Test | `scripts/test-program.mjs` |

Deploy: `tg-webhook` — `deploy_edge_function`, **`verify_jwt: false`** (majburiy).

## Qoidalar (EARS)

### 1. DB sxemasi

- QACHON `users` jadvaliga `id` siz qator qo'shilsa
  TIZIM `gen_random_uuid()` bilan avtomatik uuid berish SHART.

- QACHON `users` ga mavjud `tg_id` bilan ikkinchi qator qo'shilmoqchi bo'linsa
  TIZIM uni `23505` xatosi bilan rad etish SHART.
  VA `tg_id IS NULL` qatorlar (brauzer foydalanuvchilari) cheklanMASLIGI SHART.
  Bu allaqachon `users_tg_id_key` partial unique index bilan ta'minlangan —
  yangi constraint qo'shilMASIN.

### 2. tg-webhook — to'lov

- QACHON `successful_payment` kelsa
  VA shu `tg_id` bilan `users` qatori TOPILMASA
  TIZIM yangi qator yaratish SHART
  VA insert natijasini (`error`) tekshirish SHART.

- AGAR foydalanuvchi qatori yaratilmasa yoki yangilanmasa (DB xatosi)
  TIZIM "✅ Obuna faollashdi" xabarini YUBORMASLIGI SHART
  VA xatoni `console.error` bilan yozish SHART
  VA foydalanuvchiga "to'lov qabul qilindi, faollashtirish kechikmoqda, admin bilan
  bog'laning" mazmunidagi xabar yuborish SHART
  VA `200` qaytarish SHART (Telegram cheksiz qayta urinmasin — `payments` qatori
  allaqachon yozilgan, ya'ni pul yo'qolmaydi va qo'lda tiklash mumkin).

  Sabab: `payments` insert'i `users` insert'idan OLDIN bo'ladi, shuning uchun
  to'lov faktining o'zi har doim saqlanadi. Yolg'on "faollashdi" xabari esa
  foydalanuvchini adashtiradi va shikoyatga olib keladi.

### 3. Ovoz yozish holati

- QACHON `teardownRec()` chaqirilsa
  TIZIM `programBusy = false` va `chatBusy = false` qilish SHART
  VA buni yozuv haqiqatan ketayotgan-ketmaganidan qat'i nazar qilish SHART.

- QACHON foydalanuvchi speak vazifasida yozib turib pastki nav orqali chiqsa
  TIZIM qaytib kelganda barcha tugmalarni ishlaydigan holatda ko'rsatish SHART.

### 4. Aloqa tiklanishi

- QACHON `online` hodisasi kelsa
  VA foydalanuvchi HOZIR dastur ekranida bo'lsa
  TIZIM `renderProgram()` chaqirish SHART.

- AGAR foydalanuvchi chat, review yoki boshqa ekranda bo'lsa
  TIZIM faqat toast ko'rsatish SHART
  VA ekranni qayta chizMASLIGI SHART (yozilgan matn yo'qolmasin).

Mexanizm: modul darajasida `let currentView = ''`; har bir to'liq ekran
`render*()` funksiyasi boshida o'z nomini yozadi (`'program'`, `'chat'`,
`'dashboard'`, `'progress'`, `'vocab'`, `'review'`).

### 5. Service worker

- QACHON so'rov document bo'lsa (`req.mode === 'navigate'`, `.html`, yoki `/`)
  VA so'rov **shu origin'ga** tegishli bo'lsa (`url.origin === self.location.origin`)
  TIZIM network-first ishlatish SHART.

- AGAR so'rov boshqa hostga ketsa (masalan `cdn.tailwindcss.com`)
  TIZIM uni document tarmog'iga TUSHIRMASLIGI SHART — cache-first tarmog'iga o'tsin.

- QACHON document javobi keladi
  VA `res.ok` bo'lsa
  TIZIM uni keshlash SHART.

- AGAR javob `res.ok` bo'lmasa (masalan deploy paytidagi 500)
  TIZIM uni keshlaMASLIGI SHART
  VA javobni foydalanuvchiga o'zgarishsiz qaytarish SHART.

- QACHON `sw.js` o'zgartirilsa
  TIZIM `VERSION` ni oshirish SHART (`eb-v3` → `eb-v4`), aks holda eski kesh qoladi.

### 6. Streak

- QACHON yangi foydalanuvchi onboardingni tugatsa
  TIZIM `streak: 0` va `lastTaskDay: null` qo'yish SHART
  VA `lastVisit: today` ni saqlab qolish SHART (30 kunlik kalendar shunga bog'liq).

- QACHON shu foydalanuvchi birinchi vazifasini bajarsa
  TIZIM `streak` ni 1 qilish SHART.

  Hozirgi xato: onboarding `streak:1, lastTaskDay:today` qo'yadi. Foydalanuvchi
  ro'yxatdan o'tib, birinchi vazifani **ertasi kuni** bajarsa,
  `updateStreakOnTask()` kechagi kunni "ketma-ket" deb hisoblaydi va streak 2
  bo'ladi — bitta vazifa bajarilgan holda.

### 7. Mic tugmasi

- QACHON `ch-mic` bosilsa
  TIZIM `toggleRec('chat')` ni ANIQ argument bilan chaqirish SHART
  VA MouseEvent obyektini `recTarget` sifatida uzatMASLIGI SHART.

### 8. Sxema tekshiruvi

- QACHON `node scripts/check-schema.mjs` ishga tushirilsa
  TIZIM kutilgan constraint'lar ro'yxatini jonli baza bilan solishtirish SHART
  VA yetishmagan har birini nomi bilan chiqarish SHART
  VA kamida bittasi yetishmasa nolga teng bo'lmagan exit code qaytarish SHART.

Kutilgan ro'yxat: `users.id` default bor, `users.tg_id` UNIQUE,
`payments.charge_id` UNIQUE, `app_secrets` da id=1 qatori bor.

## Acceptance criteria

**Bosqich 1**
- [ ] `insert into users (tg_id) values (...)` `id` siz ishlaydi
- [ ] Bir xil `tg_id` bilan ikkinchi insert `23505` beradi
- [ ] `tg_id = null` bilan ikkita qator qo'shish hamon mumkin
- [ ] `tg-webhook` yangi foydalanuvchi uchun obunani haqiqatan yozadi
- [ ] DB xatosi simulyatsiya qilinganda "Obuna faollashdi" xabari chiqmaydi

**Bosqich 2**
- [ ] Speak vazifasida yozib turib "Bosh sahifa" → "Vazifalar" — tugmalar ishlaydi
- [ ] Chatda matn yozib turib internetni uzib-ulash — matn joyida qoladi
- [ ] Dastur ekranida internet tiklanganda ekran yangilanadi
- [ ] Chatdagi mic tugmasi hamon ishlaydi va javob chatga tushadi (dasturga emas)

**Bosqich 3**
- [ ] Offline holatda ilova ochiladi va stillar joyida
- [ ] Tailwind CDN so'roviga hech qachon `index.html` qaytmaydi
- [ ] 500 javob keshga tushmaydi (`caches.match` bo'sh qoladi)
- [ ] `VERSION` oshirilgan, eski keshlar `activate` da o'chadi

**Bosqich 4**
- [ ] Yangi foydalanuvchida onboardingdan keyin streak 0
- [ ] Birinchi vazifadan keyin streak 1
- [ ] Ro'yxatdan o'tib ertasi kuni birinchi vazifa — streak 1 (2 emas)
- [ ] Eski foydalanuvchining streak'i o'zgarmaydi

**Bosqich 5**
- [ ] `node scripts/check-schema.mjs` toza o'tadi
- [ ] `node scripts/test-program.mjs` toza o'tadi

## Test (MAJBURIY — pul va foydalanuvchi ma'lumotiga tegadi)

Bu spec Telegram Stars to'lovi va `users` jadvali identifikatsiyasiga tegadi,
shuning uchun quyidagilar **qo'lda** tekshiriladi, avtotest yetarli emas:

1. **Migration xavfsizligi** — qo'llashdan OLDIN dublikat `tg_id` yana bir marta
   sanaladi (hozir 0 ta). Noldan katta bo'lsa migration TO'XTATILADI va avval
   birlashtirish rejasi yoziladi.
2. **Yangi foydalanuvchi to'lovi** — Mini App'ni hech ochmagan test akkaunti
   botdan to'laydi → `users` da qator paydo bo'ladi, `subscription_until` +30 kun,
   xabar keladi. Bu hozir ISHLAMAYDI, ya'ni bu asosiy regressiya testi.
3. **Takroriy to'lov** — bir xil `charge_id` bilan ikkinchi update yuboriladi →
   obuna uzaymaydi, `duplicate_payment_ignored` logi chiqadi.
4. **Uzaytirish** — amaldagi obunasi bor akkaunt to'laydi → qolgan kunlar
   ustiga 30 kun qo'shiladi, ustidan yozilmaydi.
5. **Kalitlar oqmaydi** — deploy'dan keyin Network/Sources'da API kaliti yoki
   bot token yo'qligi tekshiriladi.
6. **`verify_jwt: false`** — deploy'dan keyin bot haqiqiy to'lov bilan
   `401` olmasligi tasdiqlanadi.
