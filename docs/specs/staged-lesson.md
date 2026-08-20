# Bosqichli dars — "avval dars, keyin vazifa"

*Holat: spec · 2026-08-20 · Bog'liq: `lesson-and-exit-path.md`, `free-modes-gate.md`, `cefr-program.md`*

## Muammo

Repetitorda tartib aniq: **avval dars o'tiladi, keyin vazifa beriladi**. Botda hozir
teskari — dars unit boshida bir marta ochiladigan bitta quti (`unitLessonBox()`):
grammatika matni va 25 ta so'z bir ekranda, pastida "Tushundim" tugmasi.

Bu qutini o'qimasdan bosib o'tish 1 soniya. Ya'ni amalda dars **yo'q** — vazifa bor,
darsning o'rnida esa formal tugma turibdi. O'quvchi mavzuni ko'rmasdan vazifaga
kiradi va AI'dan xato ustiga xato oladi.

## Yechim (bir jumlada)

Dars bitta qutidan **bosqichli ekranga** aylanadi: qoida → misollar → so'zlar (5×5)
→ 3 savollik mini-tekshiruv. Mini-tekshiruvdan o'tmaguncha vazifa ochilmaydi.

Butunlay **lokal**: AI chaqirilmaydi, token sarflanmaydi, offline ishlaydi.

## Qulf zanjiri

```
DARS  ──(3 savoldan 2 to'g'ri)──▶  VAZIFA  ──(kunlik norma)──▶  ERKIN REJIMLAR
                                                              └─(obuna)─▶ AI
```

Uch bosqich, har biri oldingisiga bog'liq. `freeModeGate()` ga to'rtinchi holat
qo'shiladi — `lesson_pending` — va u `quota_pending` dan **oldin** turadi:
darsni ko'rmagan odamga "vazifani bajaring" deyish adashtiradi, chunki vazifa
tugmasi ham qulflangan bo'ladi.

## Data sxemasi

`data/curriculum-<level>.json` dagi unit'ga **ixtiyoriy** `lesson` maydoni qo'shiladi:

```json
{
  "id": "A1-01",
  "title": "...", "can": "...", "grammar": "...", "explain": "...",
  "words": [ { "en": "hello", "uz": "salom", "ipa": "həˈloʊ" } ],
  "tasks": ["read", "translate", "build", "listen", "translate", "build"],

  "lesson": {
    "rule": "Ingliz tilida har gapda fe'l bo'lishi shart...\n\nFormula: I + am · He/She/It + is · You/We/They + are",
    "examples": [
      { "en": "I am a student.", "uz": "Men talabaman.", "note": "I bilan doim am" },
      { "en": "She is from Bukhara.", "uz": "U Buxorodan.", "note": "" },
      { "en": "They are teachers.", "uz": "Ular o'qituvchilar.", "note": "ko'plikda are" }
    ],
    "practice": [
      { "q": "___ a student. (Men talabaman)", "options": ["I am", "I is", "I are"], "answer": 0 },
      { "q": "She ___ from Bukhara.",           "options": ["am", "is", "are"],      "answer": 1 },
      { "q": "\"salom\" inglizcha qanday?",     "options": ["bye", "hello", "sorry"], "answer": 1 }
    ]
  }
}
```

### Nega ixtiyoriy

`lesson` yo'q bo'lsa hozirgi xatti-harakat saqlanadi: `explain` + so'zlar ro'yxati,
mini-tekshiruvsiz. Bu ikki narsani kafolatlaydi:

1. Kodni data'dan **oldin** deploy qilish mumkin — 72 unit generatsiyasi kodni to'smaydi.
2. Generatsiya bir darajada yiqilsa, boshqa darajalar ishlashda davom etadi.

Bu loyihadagi mavjud naqsh (`user.ielts`, `program.weakUnits`, `user.sub` — hammasi
yo'qligiga chidaydi). Yangi qoida buzilmaydi: **hech qachon yo'q maydonda yiqilmaslik**.

### Validatsiya (`build-curriculum.mjs` ga qo'shiladi)

`lesson` mavjud bo'lsa:

| Tekshiruv | Xato matni |
|---|---|
| `rule` — bo'sh emas, kirill yo'q | `${u.id}: lesson.rule bo'sh yoki kirill harfi bor` |
| `examples` — 3..4 ta | `${u.id}: lesson.examples soni N, kutilgan 3-4` |
| har `example.en` / `.uz` bo'sh emas, `uz` da kirill yo'q | — |
| `practice` — aynan `LESSON_QUIZ_TOTAL` (3) ta | `${u.id}: lesson.practice soni N, kutilgan 3` |
| har savolda `options` — aynan 3 ta, bo'sh emas | — |
| `answer` — butun son, `0..2` oralig'ida | — |
| variantlar takrorlanmasin | `${u.id}: practice[k] variantlari takror` |
| `q` va `uz` matnlarda kirill yo'q | — |

Ogohlantirish (xato emas): `examples` ichidagi jumla unit so'zlaridan hech birini
ishlatmasa — dars unit lug'atidan uzilgan bo'lishi mumkin.

Generator (`unitJs`) `lesson` ni faqat mavjud bo'lsa yozadi; `\n` `rule` ichida
bo'lishi mumkin — mavjud `q()` qochirish funksiyasi buni allaqachon uddalaydi.

## Bosqichlar

Bir dars = `lessonSteps(u)` qaytaradigan ketma-ketlik:

| # | Bosqich | Mazmun | Tugma |
|---|---|---|---|
| 0 | `rule` | `lesson.rule` (yo'q bo'lsa `explain`) + `u.grammar` sarlavhasi | Keyingi → |
| 1 | `examples` | 3-4 misol: en / uz / izoh + 🔊 | Keyingi → |
| 2..6 | `words:0`..`words:4` | 25 so'z **5 tadan** — en / IPA / uz / 🔊 | Keyingi → |
| 7 | `quiz` | 3 savol, variantli | Tekshirish |

Jami 8 bosqich, ~7 ta bosish. So'zlar 5 tadan berilishining sababi: 25 so'zlik
ro'yxat — devor, uni hech kim o'qimaydi; 5 ta so'z esa bir qarashda yodda qoladi
va keyingi mini-tekshiruv halol bo'ladi.

**Takroriy ochishda bosqich yo'q.** `lessonsSeen` ichidagi unitni "📖 Mavzu darsi"
tugmasi orqali qayta ochsa — hozirgi tekis ro'yxat ko'rinadi (qoida + 25 so'z bitta
ekranda), tekshiruvsiz. Bosqichli rejim faqat **birinchi marta**. Takrorlashda
7 marta bosish jazoga aylanadi.

## Mini-tekshiruv

- 3 savol, **2 tasi to'g'ri** bo'lishi shart (`LESSON_QUIZ_PASS = 2`)
- Urinish cheksiz, XP yo'q, jarima yo'q
- Yiqilsa: qaysi savol xato ekani ko'rsatiladi va **`rule` bosqichiga qaytariladi**
  (javob ko'rsatilmaydi — aks holda ikkinchi urinish yodlashga aylanadi)
- Savollar `lesson.practice` dan olinadi, tartib **aralashtirilmaydi**: data barqaror
  bo'lsin, test ham barqaror bo'lsin (`test-program.mjs` da `Math.random` yo'q)

`lesson` maydoni yo'q unitda mini-tekshiruv ham yo'q — hozirgidek "Tushundim" tugmasi.

## XP va norma

- **Dars XP bermaydi.** Sabab `seedUnitWords()` dagi bilan bir xil: 25 so'z × 5 XP
  inflatsiya, va dars o'qish — mehnat emas, tayyorgarlik.
- **Dars kunlik normaga kirmaydi.** `doneToday.count` faqat vazifadan oshadi.
  Aks holda odam darsni ochib normani "bajarib" qo'yadi va erkin rejimlar ochiladi.
- Rag'bat progress bar orqali beriladi (pastda).

So'zlar lug'atga `seedUnitWords()` bilan **mini-tekshiruvdan o'tgandan keyin**
ko'chiriladi — hozir "Tushundim" bosilganda ko'chirilardi. Yarim o'qilgan darsning
so'zlari SRS navbatiga tushmasligi kerak.

## Progress bar — daraja ichidagi harakat

Hozir `programHeader()` da `pct = passedUnits.length / units.length` — bu bir haftada
bir marta sakraydi va oradagi kunlar qotib turadi. Yangi formula unit ichini ham
hisoblaydi:

```
STEPS_PER_UNIT = 1 (dars) + TASKS_PER_UNIT (6) + 1 (unit imtihoni) = 8

stepsDone = (dars ko'rilgan ? 1 : 0) + min(taskIndex, TASKS_PER_UNIT + 1)
frac      = stepsDone / STEPS_PER_UNIT
pct       = round((passedUnits.length + frac) / units.length * 100)

levelExam.pending bo'lsa → pct = 100
```

Natijada har bajarilgan vazifa barni ~1.4% siljitadi — 60-kunda hali A1 bo'lgan
o'quvchi "A1 ning 68%" ni ko'radi. Matn ham o'zgaradi: `${done}/${units.length} unit`
o'rniga `${p.level} darajasi · ${pct}%`, yonida kichik `${done}/${units.length} unit`.

## Holat (state) va migratsiya

`user.program` ga bitta yangi maydon:

```js
lessonProgress: null    // yoki { unitId: 'A1-01', step: 3, quizFails: 0 }
```

- `null` — dars ochilmagan yoki tugagan
- Bosqich almashganda yangilanadi va `saveUser()` chaqiriladi → ilova yopilib
  ochilsa ham o'sha bosqichdan davom etadi
- Mini-tekshiruvdan o'tganda `markLessonSeen()` + `seedUnitWords()` ishlaydi va
  `lessonProgress = null`
- `unitId` joriy unitdan farq qilsa (daraja sakragan, kalibrovka siljitgan) — **e'tiborsiz
  qoldiriladi va nolga tushadi**. Boshqa unitning yarmida qolib ketish yo'q.

**Migratsiya** (`init()` da, mavjud naqsh bo'yicha):

```js
if (user.program.lessonProgress === undefined) user.program.lessonProgress = null;
```

`lessonsSeen` o'zgarmaydi. Eski foydalanuvchining ko'rilgan unitlari **ko'rilgan
bo'lib qoladi** — ularni majburan bosqichli darsga qaytarish jazo bo'lardi.
Bosqichli dars faqat **keyingi yangi unitdan** boshlanadi.

## Kod o'zgarishlari

### `index.html` §1b — konstantalar

```js
const LESSON_QUIZ_TOTAL   = 3;
const LESSON_QUIZ_PASS    = 2;
const WORDS_PER_LESSON_PAGE = 5;
const STEPS_PER_UNIT      = TASKS_PER_UNIT + 2;   // dars + vazifalar + unit imtihoni
```

### §4.5 — yangi sof funksiyalar (test qilinadi)

| Funksiya | Qaytaradi |
|---|---|
| `hasStagedLesson(u)` | `lesson` maydoni to'liq va yaroqlimi |
| `lessonSteps(u)` | `['rule','examples','words:0',…,'quiz']` yoki `['flat']` |
| `lessonStep()` | joriy bosqich `{ kind, index, total, unitId }` yoki `null` |
| `openLesson(unitId)` | `lessonProgress` ni 0-bosqichda boshlaydi |
| `nextLessonStep()` | bosqichni oshiradi, oxirgisidan keyin `'quiz'` da to'xtaydi |
| `checkLessonQuiz(answers)` | `{ ok, correct, need, wrong:[i] }`; `ok` bo'lsa darsni yopadi |
| `unitProgressFraction()` | progress bar uchun `0..1` |

Hammasi UI'siz — `renderProgram()` faqat ularni chaqiradi. Bu §4.5 ning mavjud
qoidasi, buzilmaydi.

### `freeModeGate()` — yangi holat

```js
if (needsLesson()) return { ok:false, reason:'lesson_pending', done:0, need };
if (done < need)   return { ok:false, reason:'quota_pending', done, need };
if (myEntitlement() === 'free') return { ok:false, reason:'needs_sub', done, need };
```

`lockText()` / `lockToast()` / `lockedReply()` ga mos matn: *"Avval mavzu darsini
o'qing — 2 daqiqa"*. `lockedReply()` lokal qoladi — token sarflanmaydi.

Escape hatch'lar saqlanadi: `!p` va `!getTaskType()` holatlarida qulf yo'q.

### `canStartTask()`

```js
if (needsLesson()) return { ok:false, reason:'lesson_pending' };
```

`renderProgram()` allaqachon `needsLesson()` ni tekshiradi, lekin qulfni sof
funksiyada ham ushlash kerak — UI shoxiga ishonib qolmaslik uchun.

### UI

`unitLessonBox(u)` ikkiga bo'linadi:
- `lessonStageBox(u, step)` — bosqichli (yangi)
- `unitLessonFlat(u)` — hozirgi tekis ro'yxat (takroriy ochish va offline uchun)

Offline shoxi (`isOffline()`) o'zgarmaydi — dars baribir lokal.

## Kontent generatsiyasi

### `scripts/build-lessons.mjs` (yangi)

`data/curriculum-*.json` dagi har unitni AI'ga beradi (unit id, title, grammar,
explain, can, 25 so'z) va `lesson` obyektini qaytartiradi. Natijani **JSON fayllarga
qaytarib yozadi** (`index.html` ga emas — u `build-curriculum.mjs` ning ishi).

- `node scripts/build-lessons.mjs` — barcha 72 unit
- `node scripts/build-lessons.mjs A1` — bitta daraja
- `--force` bermasa mavjud `lesson` ga tegmaydi (qayta ishga tushirish xavfsiz)
- Har unit alohida chaqiruv (72 chaqiruv), chunki natija strukturali va uzun

Prompt qat'iy: qoida **o'zbekcha**, misollar **unit so'zlaridan**, savol variantlari
**ishonarli chalg'ituvchi** bo'lsin (tasodifiy emas — tipik xato bo'lsin).

### `scripts/check-lessons.mjs` (yangi)

`check-glosses.mjs` naqshi: har darsni AI'ga tekshirtirib, **faqat shubhalilarini**
`.lesson-check/report.md` ga yozadi. Nimani xato deb belgilash kerakligi qat'iy
cheklanadi — aks holda 72 ta "yaxshiroq yozish mumkin edi" fikri haqiqiy xatoni
ko'mib yuboradi:

XATO deb belgilanadi:
- qoida grammatik jihatdan noto'g'ri yoki chalg'ituvchi
- misol jumlasi ingliz tilida xato
- `practice` javobi noto'g'ri (`answer` boshqa variantni ko'rsatadi)
- ikkita variant bir vaqtda to'g'ri
- savol unit mavzusiga aloqasiz
- o'zbekcha matnda imlo xatosi yoki kirill harfi

XATO deb belgilanMAYDI: uslub, sinonim afzalligi, "qisqa", "yana misol qo'shsa bo'lardi".

### Tartib

1. `A1-01` uchun `lesson` **qo'lda** yoziladi — generatsiya prompti uchun etalon ✅
2. `build-lessons.mjs` — 72 unit (A1 tugadi ✅, qolgan 60 tasi kutmoqda)
3. `check-lessons.mjs` — hisobot, qo'lda tuzatish
4. `build-curriculum.mjs` — `index.html` ga yozish
5. `test-program.mjs` — o'tishi shart

## Testlar (`test-program.mjs`)

`exported` ro'yxatiga: `hasStagedLesson`, `lessonSteps`, `lessonStep`, `openLesson`,
`nextLessonStep`, `checkLessonQuiz`, `unitProgressFraction`.

Yangi keyslar:

| # | Nima tekshiriladi |
|---|---|
| 1 | `lesson` bor unitda `lessonSteps()` = 8 element |
| 2 | `lesson` yo'q unitda = `['flat']`, mini-tekshiruv yo'q |
| 3 | `nextLessonStep()` oxirgi bosqichdan oshib ketmaydi |
| 4 | 3/3 to'g'ri → `ok:true`, `lessonsSeen` ga qo'shiladi, so'zlar lug'atga tushadi |
| 5 | 2/3 to'g'ri → `ok:true` (chegara aynan `LESSON_QUIZ_PASS`) |
| 6 | 1/3 → `ok:false`, `wrong` massivi to'g'ri, `lessonsSeen` **o'zgarmaydi**, so'zlar ko'chirilmaydi |
| 7 | Yiqilgandan keyin `lessonProgress.step` 0 ga qaytadi |
| 8 | `needsLesson()` rost bo'lganda `canStartTask()` → `lesson_pending` |
| 9 | `freeModeGate()` tartibi: `lesson_pending` → `quota_pending` → `needs_sub` |
| 10 | `lessonProgress.unitId` boshqa unit bo'lsa — e'tiborsiz, `null` ga tushadi |
| 11 | Eski foydalanuvchi (`lessonProgress === undefined`) `init()` dan keyin `null` |
| 12 | `lessonsSeen` da bo'lgan unit qayta ochilganda bosqichli rejim **yoqilmaydi** |
| 13 | `unitProgressFraction()` chegaralari: 0 (dars ham yo'q) … 7/8 (unit imtihoni oldida); `levelProgressPct()` daraja imtihonida 100 |
| 14 | Har daraja uchun `lesson` validatsiyasi (build skriptida, alohida) |

Prompt hajmi testiga ta'sir yo'q: dars AI'ga yuborilmaydi, 20 000 belgi shifti
o'zgarmaydi.

## Nima QILINMAYDI (bu bosqichda)

- **Cambridge tayyorgarligi** (KET/PET/FCE/CAE/CPE) — keyingi bosqich, alohida spec
- **Unit sonini oshirish** (12 → 20+) — real foydalanuvchi natijasidan keyin
- **Haftalik jadval modeli** (`Ingliz-tili-A1-C2-haftalik-dars-rejasi.md`) — hozirgi
  unit modeli qoladi; hafta ↔ unit moslashuvi keyingi ish
- **AI dars** — dars lokal qoladi

## Risklar

| Risk | Mitigatsiya |
|---|---|
| 7 bosqich birinchi kunda uzun tuyuladi | Bosqichli rejim faqat yangi unitda (haftada ~1 marta), takrorlashda tekis ro'yxat |
| 72 unit generatsiyasida bir xil tizimli xato | `check-lessons.mjs` + avval A1-01 etaloni |
| Qattiq qulf 1-kun churn'ni oshiradi | Mini-tekshiruv 2/3, cheksiz urinish, jarimasiz. O'lchash: 1-kun `lesson_pending` da to'xtaganlar ulushi |
| `index.html` hajmi oshadi (~+120 KB) | `sw.js` network-first — deploy yetib boradi; kerak bo'lsa keyingi bosqichda CURRICULUM lazy-load |
| Eski foydalanuvchi darsni ikki marta ko'radi | `lessonsSeen` tekshiruvi birinchi shart |
