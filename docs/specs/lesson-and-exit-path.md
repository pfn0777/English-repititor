# Mavzu darsi, etalon lug'at va tiqilishdan chiqish yo'li

## Muammo

A1 foydalanuvchi sifatida to'liq yo'l bosib o'tilganda uchta hal qiluvchi kamchilik topildi.

**1. Ilova hech qachon o'rgatmaydi — faqat so'raydi.** Har unitda 25 ta so'z bor, lekin ular
faqat `programContext()` orqali AI promptiga ketadi, ekranda **umuman ko'rinmaydi**.
Grammatika ham bir qatorlik sarlavha. Natijada yangi boshlovchining birinchi tajribasi:
hech narsa o'rganmasdan "5 ta jumlani tarjima qiling, o'tish uchun 80% kerak".

**2. Dastur lug'atni to'ldirmaydi.** `parseWords()` faqat AI `📌` formatida so'z chiqarganda
ishlaydi; dastur promptida bu ixtiyoriy, `check` fazasida umuman yo'q. `📌` ni ishonchli
chiqaradigan erkin rejimlar esa kunlik vazifa bajarilmaguncha qulflangan. Yakuniy holat:
faqat dastur bilan shug'ullanadigan o'quvchida lug'at 0, SRS 0.

**3. Tiqilib qolgan o'quvchi uchun chiqish yo'li yo'q.** `advance()` faqat o'tganda ishlaydi,
skip/hint/"javobni ko'rsat" yo'q. 3 urinishdan keyingi `relief` cheksiz qayta generatsiya
qilinadi. Erkin rejimlarni ochish uchun ham **bajarilgan** vazifa kerak — ya'ni tiqilgan odam
butun ilovadan mahrum bo'ladi.

Qo'shimcha: onboardingdagi daraja default'i **B1** edi, B1 syllabusi esa yo'q edi — dropdown'ga
tegmagan yangi boshlovchi jimgina **A2** dan boshlanardi.

## Yechim

### 1. So'z sxemasi: `{ en, uz, ipa }`

`data/curriculum-*.json` da `"words": ["hello", ...]` o'rniga:

```json
"words": [{ "en": "hello", "uz": "salom", "ipa": "həˈloʊ" }]
```

Uzbekcha tarjima endi **etalon**: `programContext()` AI'ga `hello — salom` juftliklarini
beradi va "AYNAN shu tarjimani ishlat" deydi. Shu bilan uchta joy bir-biriga mos keladi —
`build` vazifasidagi izohlar, unit imtihonidagi so'z savollari va o'quvchi lug'ati.
Ilgari AI har safar boshqacha tarjima o'ylab topardi va **unit imtihoni hech qanday
etalonsiz baholanardi**.

Har unitga `explain` maydoni ham qo'shildi: formula + 2 misol, o'zbekcha.

`build-curriculum.mjs` validatsiyasi: har element obyekt, `en`/`uz`/`ipa` bo'sh emas,
`en` kichik harfda va **barcha darajalar bo'yicha noyob**. Satr shaklidagi eski so'z
rad etiladi. `unitWords()` himoya uchun eski shaklni ham qabul qiladi.

### 2. Mavzu darsi ekrani

Sof funksiyalar (4.5-bo'lim): `needsLesson()`, `markLessonSeen(unitId)`, `seedUnitWords(unit)`.
Holat: `program.lessonsSeen: []`.

- `needsLesson()` → `taskIndex === 0` va unit id `lessonsSeen` da yo'q (ochiq vazifa yoki
  daraja imtihoni fazasida — false).
- UI: `unitLessonBox()` — grammatika (`grammar` + `explain`) va 25 so'z jadvali
  (`en` / IPA / `uz` / 🔊 mavjud `speakText` bilan). `programHeader()` dagi
  **📖 Mavzu darsi va so'zlar** tugmasi darsni istalgan paytda qayta ochadi.
- **AI chaqirilmaydi** — lokal data, 0 token, 0 kutish.
- "Tushundim" bosilganda `markLessonSeen()` + `seedUnitWords()`.

`seedUnitWords()` 25 so'zni `user.vocabulary` ga mavjud sxemada yozadi
(`parseWords` bilan bir xil), dublikatlarni case-insensitive tashlab ketadi.
**XP bermaydi** — 25 × 5 XP inflyatsiya bo'lardi. Natija: SRS birinchi kundanoq ishlaydi.

### 3. Chiqish yo'li

- `MAX_ATTEMPTS_BEFORE_SKIP = 5`. `applyResult()` shundan keyin `current.canSkip = true` qo'yadi.
- `revealAndSkip()` → yangi `reveal` prompt fazasi: AI har band uchun to'g'ri javobni va
  o'zbekcha bir jumlalik sababni beradi, mavzu qoidasini takrorlaydi. `📊 NATIJA` **yozmaydi**
  (bu baholash emas). Namuna javoblar grammatik mukammal bo'lishi talab qilinadi.
- So'ng `skipTask()`: `advance()`, **XP yo'q**, unit `program.weakUnits` ga yoziladi va
  `programContext()` orqali "imtihonda albatta tekshir" deb promptga tushadi.
  Kunlik hisobga kiradi — ya'ni erkin rejimlar ochiladi (asosiy tiqilish shu edi).
- AI javob bermasa ham o'tkazib yuboriladi — aks holda o'quvchi yana tiqilib qoladi.

### 4. Onboarding

Default **A1**. Syllabusi yo'q darajalar `disabled` va "(dastur tayyorlanmoqda)" deb
belgilangan. `renderOnboarding` ichidagi fallback va toast o'z kuchida qoladi — u endi
faqat edge holatlar uchun.

## Qamrov tashqarisi

- `PASS_THRESHOLD` o'zgartirilmadi (0.8) — dars qo'shilgach chegara adolatli bo'ldi.
- Kunlik kvota va `freeModeGate` mantig'iga tegilmadi.
- Skip'dan keyin vazifa qayta navbatga qo'yilmaydi — faqat unit imtihonida qaytariladi.
- Dars mazmuni AI tomonidan boyitilmaydi (lokalligi ataylab).

## Tekshiruv

`scripts/test-program.mjs`, 14–18-bo'limlar:
so'z sxemasi va noyoblik, `unitWords()` (obyekt va eski satr shakli), `needsLesson()` ning
to'rt holati, `seedUnitWords()` (25 ta, dublikatsiz, XP'siz), `skipTask()` (ruxsatsiz
ishlamaydi, XP bermaydi, `weakUnits` ga yozadi), `canSkip` 5-urinishda, `reveal` prompti,
va **barcha unitlar uchun** 20 000 belgi shifti (so'zlar ~3x uzaydi).

Brauzerda: `localStorage.clear()` → A1 default → dars ekrani 25 so'z bilan → lug'atda
25 ta so'z va `Takrorlash (25 ta navbatda)` → ataylab 5 marta yiqilish → 3-da relief,
5-da skip tugmasi → skip'dan keyin XP oshmadi, keyingi vazifaga o'tdi.
`build` vazifasida AI chiqargan tarjimalar JSON'dagi `uz` bilan aynan mos keldi.
