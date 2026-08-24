# Spec: Offline "Testlar" rejimi

> 2-bosqich — offline klient — [offline-client.md](offline-client.md) da.
> 3-bosqich — o'yinlar — [offline-games.md](offline-games.md) da.
> Bu spec `OFFLINE_BUILD` bilkasidagi Testlar rejimini belgilaydi.

## Maqsad

Onlayn ilovada "Testlar" (`tests` tab) AI orqali darajaga mos 10 ta savol
generatsiya qiladi (`buildSystem('quiz')`). Offline bilkada AI yo'q — bu
rejim shunchaki yashirilgan (`navTabs()` uni `games` bilan almashtiradi,
§10, `index.html:5893-5908`). Bu spec o'sha o'rnini AI'siz to'ldiradi:
**mavjud imtihon savollaridan** qurilgan, dastur tashqarisidagi, erkin
kirish mumkin bo'lgan sinov rejimi.

## Nega yangi kontent kerak emas

`data/tasks-<lv>.json` har bir unit uchun allaqachon `exam` (8 ta MCQ) va
har daraja uchun `levelExam` (10 ta MCQ) massivini o'z ichiga oladi —
`authoring-runbook.md`dagi qoidalar bilan yozilgan, `validate-tasks.mjs` va
`test-offline.mjs` 14b bo'limi orqali A1/A2/B1 uchun allaqachon tekshirilgan
(har biri offline dastur zanjirining bir qismi sifatida). Testlar bu
massivlarni **qayta ishlatadi** — yangi savol yozilmaydi, faqat ularni
dastur oqimidan tashqarida, istalgan vaqt o'ynatiladigan qilib chiqaruvchi
UI/motor qo'shiladi.

Shu sababli bu spec [offline-content-completion.md](offline-content-completion.md)ga
**bog'liq emas**: A1/A2/B1 uchun Testlar bugun ishlay oladi. B2/C1/C2
uchun `exam`/`levelExam` yo'q yoki to'liq emas joylarda Testlar o'sha
unit/darajani ro'yxatda ko'rsatmaydi (pastga qarang) — ikkala spec
mustaqil, parallel bajarilishi mumkin.

## Testlar vs `unit_exam` vs o'yinlar

Uchtasi ham xuddi shu MCQ ma'lumotidan (yoki shunga o'xshash shakldan)
foydalanadi, lekin maqsadlari boshqa:

| | `unit_exam` (dastur ichida) | Testlar (yangi) | O'yinlar |
|---|---|---|---|
| Qachon ochiladi | `taskIndex >= TASKS_PER_UNIT`, dastur navbatida | istalgan vaqt, nav orqali | istalgan vaqt |
| Qaysi unit | joriy, navbatdagi | **istalgan**, tugallanmagan ham | so'z hovuzi, unit emas |
| `advance()`ga ta'siri | bor — pass/fail dasturni siljitadi | **yo'q** | yo'q |
| XP | bor (dastur qoidasi) | **yo'q** | bor, lekin `GAME_XP_MAX` bilan cheklangan |
| Streak | bor (`updateStreakOnTask`) | **yo'q** | yo'q |

Testlar — sof **o'z-o'zini sinov**: dastur holatiga hech qanday yozish
qilmaydi, faqat o'qiydi (qaysi unitlar bor, `passedUnits` esa **tekshirilmaydi**
— barcha unit ochiq, chunki maqsad oldindan bilim darajasini ko'rish bo'lishi
ham mumkin, faqat "o'tilganlarni takrorlash" emas).

## Qamrov ICHIDA

- Yangi bottom-nav tab: `{ id:'quiz', emoji:'🎯', label:'Testlar' }` —
  faqat `OFFLINE_BUILD` da, `navTabs()`ga qo'shiladi (o'yin tabi bilan bir
  qatorda, uni almashtirmaydi — ikkalasi ham alohida ko'rinadi).
- Sinov tanlash ekrani: daraja bo'yicha guruhlangan (aккордеон yoki tab),
  har daraja ichida 12 unit + "Daraja imtihoni" (levelExam) qatori.
  Faqat `exam`/`levelExam`si mavjud va bo'sh bo'lmagan unit/daraja
  ro'yxatda ko'rinadi — yo'q yoki bo'sh bo'lsa umuman chiqmaydi (o'yin
  rejimidagi "TTS yo'q bo'lsa ko'rsatilmaydi" naqsh bilan bir xil mantiq,
  §"To'rt o'yin / listen_game").
- Sinov ekrani: bitta savol bir vaqtda, 4 variant, darhol vizual javob
  (to'g'ri/xato — o'yinlardagi bilan bir xil uslub), keyingisiga o'tish.
  Oxirida: `N/M to'g'ri`, foizi, "Yana urinish" va "Ro'yxatga qaytish".
- Sof mantiq: `buildQuizSession(examArray)` / `scoreQuizAnswer(item, idx)` —
  UI'dan ajratilgan, `test-offline.mjs`da to'g'ridan-to'g'ri sinaladi
  (o'yinlar bilan bir xil naqsh, §"Sof mantiq ... UI'dan ajratilsin").
- Rekord/tarix saqlash: `eb_quiz_results` (localStorage, `LS` orqali),
  `{ "<LEVEL>-<unitId|levelExam>": { best: pct, attempts: n } }` — faqat
  ko'rsatish uchun, hech qanday gate/unlock mantiqiga ta'sir qilmaydi.
- Chiqish tugmasi sinov ichida — progress ogohlantirishsiz yo'qoladi
  (o'yin sessiyasi bilan bir xil qoida — qimmatli data emas).

## Qamrov TASHQARISIDA

- Yangi savol yozish yoki mavjud `exam`/`levelExam`ni tahrirlash — bu
  [offline-content-completion.md](offline-content-completion.md) ishi.
- XP yoki streak berish — Testlar bunisiz.
- Dastur holatiga (`user.program`) har qanday yozish — `passedUnits`,
  `weakUnits`, `calibration` va h.k. o'qilmaydi ham, o'zgartirilmaydi ham.
- Onlayn bilkada o'zgarish — `OFFLINE_BUILD` tashqarisida `navTabs()`,
  `navTo()` xulq-atvori bir zarra ham o'zgarmaydi (xuddi o'yin rejimi kabi).
- Savollarni tasodifiy aralashtirish yoki adaptiv qiyinlashtirish — MVP
  savollarni `exam`/`levelExam` massividagi tartibda ko'rsatadi.

## Texnik

- Manba: `data/tasks-<lv>.json` — `units[].exam` (8 ta) va `levelExam`
  (10 ta), `{ q, options[4], answer }` shakli, hech narsa o'zgartirilmaydi.
- Yangi funksiyalar `index.html`ga §4.8 (o'yinlar) yonida, masalan
  yangi §4.9 "Testlar" bo'limida:
  - `availableQuizzes()` — barcha darajalar bo'ylab `exam`/`levelExam`si
    bo'sh bo'lmagan unit/daraja ro'yxatini qaytaradi.
  - `buildQuizSession(items)` — savollar massivini sessiya holatiga
    o'giradi (`{ items, idx, correct, answers[] }`).
  - `scoreQuizAnswer(session, chosenIdx)` — `items[idx].answer ===
    chosenIdx` ni solishtiradi, sessiyani yangilaydi.
  - `renderQuizList()`, `renderQuizSession()`, `renderQuizResult()` — UI.
- `navTabs()` (`index.html:5899`) ga Testlar tabini qo'shish; `navTo()`
  (`index.html:5942`) ga `tab === 'quiz'` shoxobchasi.
- DB/migration yo'q — hammasi lokal, statik JSON'dan o'qiladi.

## Qoidalar (EARS uslubida)

- QACHON `availableQuizzes()` chaqiriladi
  TIZIM faqat `exam.length > 0` bo'lgan unitlarni va `levelExam.length > 0`
  bo'lgan darajalarni ro'yxatga qo'shishi SHART.
- QACHON foydalanuvchi sinov boshlaydi
  TIZIM `user.program`ning hech qanday maydonini o'qimasligi (gate uchun)
  va yozmasligi SHART.
- QACHON sinov tugaydi (oxirgi savol javob berilgach)
  TIZIM natijani `eb_quiz_results`ga yozishi SHART
  VA hech qanday XP/streak funksiyasini chaqirmasligi SHART.
- QACHON `OFFLINE_BUILD === false`
  TIZIM Testlar tabini `navTabs()`da qo'shmasligi SHART
  VA `navTo('quiz')` chaqirilsa (masalan eski keshdan) xatosiz boshqa
  ekranga (`renderDashboard()`) tushishi SHART.
- AGAR biror daraja uchun `exam`/`levelExam` bo'sh yoki mavjud bo'lmasa
  TIZIM o'sha daraja/unitni ro'yxatda umuman ko'rsatmasligi SHART (xato
  ekrani emas — shunchaki ro'yxatda yo'q).

## Test talablari

`scripts/test-offline.mjs`ga yangi bo'lim (o'yinlar bo'limi yonida):

1. `availableQuizzes()`: `exam`/`levelExam`si bo'sh bo'lgan unit/daraja
   ro'yxatda yo'qligini tekshiradi (sun'iy bo'sh massiv bilan).
2. `buildQuizSession`/`scoreQuizAnswer`: to'g'ri javob indeksi to'g'ri
   hisoblanadi, xato javob `correct`ni oshirmaydi, sessiya oxirida
   `correct/items.length` nisbati to'g'ri chiqadi.
3. Har mavjud daraja (A1/A2/B1, keyinchalik B2/C1/C2 tugagach) uchun:
   har bir unit `exam`i va `levelExam`i orqali "oltin javob" bilan
   yurilganda 100% natija chiqishini tekshiradi (mavjud `tasks-*.json`
   ma'lumotidan, yangi fixture kerak emas).
4. `OFFLINE_BUILD = false`da Testlar tabi `navTabs()` natijasida yo'q —
   `test-program.mjs`ning tegishli bo'limi o'zgarishsiz o'tadi.

## Acceptance criteria

- [ ] `navTabs()` — offline'da 5 ta tab: Bosh, Vazifalar, O'yin, Testlar, Progress
- [ ] A1/A2/B1 uchun barcha unit + levelExam Testlar ro'yxatida ko'rinadi
- [ ] Sinov 100% to'g'ri javob bilan o'tkazilganda natija to'g'ri hisoblanadi
- [ ] Testlar `user.program`ga hech narsa yozmaydi (diff bo'yicha tekshiriladi)
- [ ] `node scripts/test-offline.mjs` — yangi bo'lim HAMMASI OK
- [ ] `node scripts/test-program.mjs` — HAMMASI OK, `OFFLINE_BUILD=false`
      holatida navigatsiya o'zgarmagan
- [ ] Onlayn bilkada (`OFFLINE_BUILD=false`) hech qanday vizual/funksional
      farq yo'q
