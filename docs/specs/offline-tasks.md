# Offline vazifa kontenti (APK bilkasi)

> Status: **1-bosqich — kontent quvuri.** Klient (APK) va o'yin rejimlari bu specda yo'q.
> Bu spec faqat `data/tasks-<level>.json` ni yaratadigan va tekshiradigan uchta skriptni belgilaydi.

## Nima uchun

Hozir har bir vazifa AI tomonidan **runtime'da** generatsiya qilinadi va **runtime'da**
baholanadi. Bu uch narsani mumkin qilmaydi:

1. **Offline ishlash** — internetsiz dastur umuman ochilmaydi;
2. **Zudlik bilan javob** — har tekshiruv 7-8 soniya, Duolingo hissi 200ms javobdan tug'iladi;
3. **Daromadsiz tarqatish** — bepul APK foydalanuvchilari `GLOBAL_DAILY_LIMIT = 2000`
   ni yeydi va to'lovchi Telegram foydalanuvchilariga joy qolmaydi.

Yechim — **AI'ni runtime'dan build-time'ga ko'chirish**. Kontentni AI bir marta
generatsiya qiladi, JSON'ga tushadi, keyin abadiy bepul va bir zumda ishlaydi.
Bu `build-lessons.mjs` allaqachon `lesson` uchun qilgan ishning kengaytmasi.

## Pedagogik cheklov — buzib bo'lmaydigan qoida

[reading-and-unit-shape.md](reading-and-unit-shape.md) da yozilgan: unit sof tarjima
mashqiga qulasa, u "avval o'zbekcha o'ylab, keyin tarjima qilish" odatini
mustahkamlaydi. `build-curriculum.mjs` validatorida shuning uchun **majburiy** ikki
qoida bor: har unitda kamida bitta **retseptiv** va bitta **erkin produktiv** vazifa.

Offline rejimda `write` va `speak` (erkin ochiq javob) baholanmaydi — AI kerak.
Ularni shunchaki **o'chirib tashlash yaramaydi**: unit `translate + build + read + listen`
ga tushadi, ya'ni 6 vazifadan 2 tasi diskret tarjima — aynan qaytarilmasligi kerak
bo'lgan holat, faqat endi produktiv chiqish umuman yo'q.

Shuning uchun ikkita **yangi offline tur** kiritiladi. Ikkalasi ham to'liq
mashinada tekshiriladi, lekin ikkalasi ham tarjima mashqi EMAS:

| Onlayn tur | Offline o'rnini bosuvchi | Nimani saqlaydi |
|---|---|---|
| `speak` | **`dictate`** — TTS jumlani aytadi, o'quvchi uni so'z plitkalaridan yig'adi | quloq → shakl bog'lanishi, o'zbekcha oraliq bosqichsiz |
| `write` | **`order`** — aralashtirilgan 5 jumlani mantiqiy tartibda joylashtiradi | matn darajasidagi bog'lanish (kogeziya), gap emas |

`dictate` — retseptiv-produktiv, `order` — diskurs darajasi. Ikkalasida ham
o'zbekcha manba yo'q, ya'ni "tarjima qilish" odati mustahkamlanmaydi.

**Bu qaror tasdiqlanishi kerak.** Agar rad etilsa — offline unit 4 vazifaga tushadi
va `TASKS_PER_UNIT` o'zgaradi, bu esa dastur mexanizmini (`advance()`, `getTaskType()`,
`test-program.mjs`) qayta yozishni talab qiladi.

## Turlarni moslashtirish jadvali

Onlayn unit shabloni: `read, translate, build, listen, speak, write`.
Offline shabloni pozitsiya-ba-pozitsiya bir xil qoladi:

| # | Onlayn | Offline | Kiritish usuli | Baholash |
|---|---|---|---|---|
| 1 | `read` | `read` | 4 variantli test | kalit indeks |
| 2 | `translate` | `translate` | so'z plitkalari | normallashtirilgan satr |
| 3 | `build` | `build` | so'z plitkalari (berilgan so'z bilan) | normallashtirilgan satr |
| 4 | `listen` | `listen` | 4 variantli test (matn yashirin, TTS) | kalit indeks |
| 5 | `speak` | `dictate` | so'z plitkalari (TTS eshitib) | normallashtirilgan satr |
| 6 | `write` | `order` | jumlalarni tartiblash | pozitsiya taqqoslash |

Istisnolar (`NO_WRITE_YET` = A1-01/02/03, `NO_SPEAK_YET` = A1-01) **saqlanadi**:
o'sha slotlar `data/curriculum-*.json` dagi haqiqiy `tasks` massividan olinadi,
shablon taxmin qilinmaydi. Ya'ni offline tur ro'yxati **har doim** shu formuladan
chiqadi:

```
offlineType = { speak: 'dictate', write: 'order' }[onlineType] || onlineType
```

Har unitda `tasks` nechta bo'lsa, shuncha offline vazifa bo'ladi (hozir hamma joyda 6).

## Fayl joylashuvi

Yangi fayl: `data/tasks-<level>.json` (kichik harf: `tasks-a1.json`).

`data/curriculum-*.json` ga **tegilmaydi**. Sabab: kurrikulum fayllari Telegram
versiyasining manbasi va `build-curriculum.mjs` ular ustida ishlaydi; vazifa
kontenti esa faqat offline bilka uchun. Ikkalasini bitta faylga qo'shish
kurrikulum faylini ~3 barobar shishiradi va har generatsiya butun faylni diffga
chiqaradi.

Bog'lanish `id` orqali: `tasks-a1.json` dagi har unit `id` si
`curriculum-a1.json` dagi unit `id` siga **aynan** mos kelishi shart.

## JSON sxemasi — qat'iy shartnoma

Uchala skript aynan shu sxemaga tayanadi. O'zgartirish — uchalasini birga o'zgartirish.

```jsonc
{
  "level": "A1",
  "units": [
    {
      "id": "A1-01",
      "tasks": [ /* <task> — curriculum'dagi tasks soniga teng, hozir 6 */ ],
      "exam":  [ /* <mcq> × 8 — unit imtihoni */ ]
    }
    /* × 12 */
  ],
  "levelExam": [ /* <mcq> × 10 */ ]
}
```

### `<mcq>` — variantli savol

```jsonc
{
  "q": "What is the man's job?",     // savol matni (read/listen/exam: inglizcha yoki o'zbekcha, quyida)
  "options": ["a teacher", "a doctor", "a driver", "a student"],   // AYNAN 4 ta
  "answer": 1                        // to'g'ri variant indeksi, 0..3
}
```

### `<task>` — turiga qarab

**`read`** — matn ko'rinadi

```jsonc
{
  "type": "read",
  "text": "Ali is a student. He lives in Bukhara ...",   // uzunlik darajaga qarab (pastda)
  "items": [ /* <mcq> × 5 */ ]
}
```

**`listen`** — matn yashirin, TTS o'qiydi

```jsonc
{
  "type": "listen",
  "text": "Ali is a student ...",     // klient ko'rsatmaydi, faqat aytadi
  "items": [ /* <mcq> × 5 */ ]
}
```

**`translate`** — o'zbekcha jumla → inglizchani plitkalardan yig'ish

```jsonc
{
  "type": "translate",
  "items": [
    {
      "uz": "Men talabaman.",
      "en": "I am a student.",
      "tiles": ["I", "am", "a", "student"],   // `en` ning so'zlari, tartibsiz emas — skript aralashtiradi
      "distractors": ["is", "are"],           // 2-4 ta ortiqcha plitka
      "alt": []                               // ixtiyoriy: qabul qilinadigan boshqa to'g'ri variantlar
    }
    /* × 5 */
  ]
}
```

**`build`** — berilgan so'z bilan gap yig'ish

```jsonc
{
  "type": "build",
  "items": [
    {
      "word": "student",              // unit lug'atidan, `en` ichida BOR bo'lishi shart
      "uz": "talaba",                 // curriculum'dagi tarjima AYNAN ko'chiriladi
      "en": "I am a student.",
      "tiles": ["I", "am", "a", "student"],
      "distractors": ["are", "the"],
      "alt": []
    }
    /* × 5 */
  ]
}
```

**`dictate`** — TTS aytadi, plitkalardan yig'ish

```jsonc
{
  "type": "dictate",
  "items": [
    {
      "en": "She is from Bukhara.",   // TTS shuni aytadi
      "uz": "U Buxorodan.",           // faqat javobdan keyin ko'rsatiladi
      "tiles": ["She", "is", "from", "Bukhara"],
      "distractors": ["are", "in"],
      "alt": []
    }
    /* × 5 */
  ]
}
```

**`order`** — jumlalarni mantiqiy tartibda joylashtirish

```jsonc
{
  "type": "order",
  "topic": "Introducing yourself",    // qisqa sarlavha, o'zbekcha ko'rsatiladi
  "topicUz": "O'zingizni tanishtirish",
  "sentences": [                      // TO'G'RI tartibda yoziladi, klient aralashtiradi
    "Hello! My name is Aziz.",
    "I am from Bukhara.",
    "I am a student.",
    "I study English every day.",
    "Nice to meet you!"
  ]
}
```

Barcha turlarda band soni **5** (`order` da 5 jumla = 5 pozitsiya), shu sababli
`PASS_THRESHOLD = 0.8` o'zgarishsiz ishlaydi: 4/5 o'tadi.

## Kontent qoidalari

Umumiy:

- Ingliz tili grammatik jihatdan benuqson. Odam aytmaydigan gap ("I live in an office")
  — xato, garchi grammatikasi to'g'ri bo'lsa ham.
- O'zbekcha matn **faqat lotin** yozuvida. Kirill harfi (`а е о с`) mutlaqo mumkin emas.
- Unit lug'ati **etalon**: so'z tarjimasi kerak bo'lganda `curriculum-*.json` dagi
  `uz` maydoni AYNAN ko'chiriladi, qayta o'ylab topilmaydi.
- Har vazifa unit `grammar` maydonidagi shaklni ko'rsatishi shart — unit so'zini
  ishlatish yetarli emas.

Turga xos:

| Tur | Qoida |
|---|---|
| `read` | Matn uzunligi: A1-A2 — 60-90 so'z, B1-B2 — 100-140, C1-C2 — 150-200. Savollar: 1) umumiy mazmun 2-3) aniq fakt 4) so'zning **kontekstdagi** ma'nosi 5) mantiqiy xulosa |
| `listen` | Matn 60-100 so'z, darajadan qat'i nazar (quloq bilan qabul qilish qiyinroq). Savollar matnda **aniq javobi bor** faktlarga |
| `translate` | Jumlalar oddiydan murakkabga. 4-10 so'z. Har biri unit grammatikasini ko'rsatadi |
| `build` | 5 ta har xil so'z, hammasi unit lug'atidan. Gap 4-10 so'z |
| `dictate` | Jumlalar QISQA — 4-8 so'z (quloqdan yig'ish qiyin). Omofon chalkashlikdan qoch |
| `order` | 5 jumla bitta mavzuda, mantiqiy ketma-ketlik **bir xil yechimli** bo'lsin. Bog'lovchi so'zlar (first, then, after that, finally) tartibni aniq qilsin |
| `exam` | 8 ta: 1-5 grammatika/tarjima (o'zbekcha jumla → 4 ta inglizcha variant), 6-8 unit lug'atidan so'z ma'nosi |
| `levelExam` | 10 ta: 1-6 grammatika (barcha unitlar aralash), 7-8 xato topish (xato gap + 4 ta tuzatish varianti), 9-10 daraja lug'atidan so'z ma'nosi |

Variantlar (`options`) uchun alohida qoida — **noto'g'ri variantlar tipik xato
bo'lsin**, tasodifiy so'z emas ("I is", "He have"). Faqat bitta variant to'g'ri
bo'lishi SHART; ikkita to'g'ri variant — eng ko'p uchraydigan generatsiya xatosi.

`tiles` va `distractors` uchun:

- `tiles` — `en` ning so'zlari, **aynan o'sha ko'p to'plam** (tinish belgilari
  oxirgi plitkaga qo'shilib ketmaydi; nuqta/vergul plitkalardan tashqarida qoladi,
  klient uni o'zi qo'shadi).
- `distractors` — 2-4 ta, `tiles` da yo'q, lekin **ishonarli**: shu unitning
  grammatik xatosini ifodalasin (`is` o'rniga `are`, `a` o'rniga `the`).
- Plitkalar soni 12 tadan oshmasin — telefon ekraniga sig'sin.

## Uchta skript

### 1. `scripts/build-tasks.mjs` — generatsiya

`build-lessons.mjs` naqshini aynan takrorlaydi (u ishlab tekshirilgan):

```
node scripts/build-tasks.mjs             # yo'q bo'lgan hamma narsa
node scripts/build-tasks.mjs A1          # faqat bitta daraja
node scripts/build-tasks.mjs A1 --force  # mavjudini ham qayta yozadi
node scripts/build-tasks.mjs A1 --uid=<uuid>   # alohida limit hisobi
node scripts/build-tasks.mjs A1 --dry-run     # reja, API'siz
node scripts/build-tasks.mjs A1 --normalize   # javob indekslarini qayta taqsimlash, API'siz
```

**Kunlik limit:** `chat/index.ts` da `LIMIT_OPEN = 40` — bitta uid 85 chaqiruvni
ko'tarmaydi va yugurish yarmida jimgina to'xtaydi. `users.daily_limit` override
qo'yilgan ikkita xizmat qatori bor: `…ba01` (TaskBuild) va `…ba02` (TaskCheck),
ikkalasida `daily_limit = 400`.

- Har **vazifa** uchun alohida chaqiruv (unit boshiga emas). Sabab: `MAX_OUTPUT_TOKENS = 4000`
  va Gemini'da thinking tokenlari ham shu byudjetdan yeyiladi — bitta unitning
  6 vazifasi bitta javobga sig'maydi va jimgina kesilib qoladi.
  A1 uchun: 12 × 6 + 12 imtihon + 1 daraja imtihoni = **85 chaqiruv**.
- `chat` Edge Function orqali, `mode: 'task_build'`.
- 429 uchun backoff: `[8000, 20000, 45000]` ms — `build-lessons.mjs` dagi bilan bir xil.
- Javobdan JSON birinchi `{` dan oxirgi `}` gacha kesib olinadi (model ```json bilan o'raydi).
- **Shakl gate**: `validateTask()` (2-skriptdan `import` qilinadi) o'tmasa —
  saqlanmaydi, `failed++`. Yarim data yo'qidan battar.
- Har vazifadan keyin faylga yozadi (uzilib qolsa ish yo'qolmaydi), `compact()`
  formatlash bilan — `build-lessons.mjs` dagi funksiya ko'chiriladi.
- Chiqishda: `N ta vazifa yozildi · M o'tkazildi · K yiqildi`, `process.exit(failed ? 1 : 0)`.

#### Generatsiya paytida topilgan uchta tuzatish

Bular pilot davomida amalda yiqilgandan keyin qo'shildi — spec'ni o'qib
takrorlamaslik uchun yozib qo'yilgan.

**1. `build` so'zlarini skript tanlaydi, model emas.** `pickWords(u, 5)` lug'atdan
teng oraliqda 5 so'z oladi va promptga majburiy ro'yxat sifatida qo'yadi. Sababi:
lug'ati asosan yordamchi so'zlardan iborat unitda (A1-06 — `do/does/why/please`)
model doim tashqaridan so'z olib keladi (`speak`, `work`) va shakl gate uni rad
etadi. Promptni kuchaytirish yordam bermadi — **ketma-ket olti urinish yiqildi**.
So'z oldindan berilganda birinchi urinishda o'tdi. Yon foyda: lug'at qamrovi
tasodifga qolmaydi.

**2. To'g'ri javob indeksi generatsiyadan keyin taqsimlanadi.** `spreadAnswers()`
(`validate-tasks.mjs` da) har vazifadagi bandlar bo'ylab `answer` ni `0,1,2,3,0…`
qilib suradi; boshlang'ich siljish birinchi savol matnining xeshidan chiqadi, ya'ni
**deterministik** — bir xil data har safar bir xil natija beradi va diff shovqin
qilmaydi. Sababi: A1 pilotida 5 ta vazifada bandlarning 4-5 tasi bir xil indeksda
chiqdi (`A1-09 read` da beshtasi ham 0), ya'ni o'quvchi doim birinchi variantni
bosib 5/5 olardi va baho hech narsani o'lchamasdi. Promptda "indekslarni aralashtir"
deb so'rash **ishlamadi** — shuning uchun qaror mexanik.

`build-tasks.mjs` uni gate'dan keyin avtomatik qo'llaydi. Mavjud faylga qayta
qo'llash uchun alohida rejim:

```
node scripts/build-tasks.mjs A1 --normalize   # API'siz, tekin
```

**3. Matn uzunligi promptda "qat'iy talab" deb belgilandi.** Birinchi yugurishda
9 ta `listen` matni 23-54 so'z chiqdi (kerakli 60-100). 23 so'zli matndan 5 ta
mustaqil savol chiqmaydi — savollar bir-birini takrorlaydi. Promptga "yozib
bo'lgach so'zlarni SANA" va nima qo'shish kerakligi (kim/qayerda/qachon/nima
uchun) kiritilgandan keyin qayta generatsiyada 10 tadan 7 tasi oraliqqa tushdi,
qolgan uchtasi chegarada (52-58).

### 2. `scripts/validate-tasks.mjs` — shakl validatori (API'siz, tekin)

`build-curriculum.mjs` validatori naqshida: `errors` va `warnings` massivlari,
xato bo'lsa `exit 1`.

```
node scripts/validate-tasks.mjs          # hamma tasks-*.json
node scripts/validate-tasks.mjs A1
```

Tekshiradi (xato → `errors`):

1. `level` maydoni fayl nomiga mos; `units` massiv, uzunligi `curriculum-<lv>.json`
   dagi unit soniga teng (12).
2. Har unit `id` si curriculum'dagi mos indeksdagi `id` bilan **aynan** bir xil.
3. `tasks` soni curriculum'dagi shu unitning `tasks` soniga teng, va har
   pozitsiyadagi `type` moslashtirish formulasidan chiqqan turga teng.
4. `<mcq>`: `q` bo'sh emas; `options` aynan 4 ta, hammasi noyob (kichik harfda
   solishtirilib); `answer` butun son, 0..3.
5. Plitkali turlar: `en` va `uz` bo'sh emas; `tiles` ning normallashtirilgan
   ko'p to'plami `en` ning so'z ko'p to'plamiga **teng**; `distractors` 2-4 ta va
   `tiles` bilan kesishmaydi; `tiles.length + distractors.length <= 12`;
   `alt` massiv (bo'sh bo'lishi mumkin).
6. `build`: har item'ning `word` i `en` ichida bor; 5 ta `word` noyob; hammasi
   unit lug'atida bor; `uz` curriculum'dagi tarjima bilan **aynan** bir xil.
7. `order`: `sentences` 5 ta, noyob, bo'sh emas; `topic`/`topicUz` bo'sh emas.
8. `exam` 8 ta `<mcq>`, `levelExam` 10 ta `<mcq>`.
9. Kirill harfi (`/[Ѐ-ӿ]/`) hech qaysi o'zbekcha maydonda yo'q.
10. Inglizcha maydonlarda (`en`, `text`, `tiles`, `sentences`) o'zbekcha
    apostrofli harf (`o'`, `g'`) yo'q — bu aralashib ketganini bildiradi.

Ogohlantiradi (`warnings`, exit kodga ta'sir qilmaydi):

- Bir vazifadagi `answer` indekslari bir xil (model 0 ni yaxshi ko'radi) —
  5 banddan 4 tasi bir xil indeksda bo'lsa ogohlantir.
- Unit lug'atidan ishlatilgan so'zlar soni 5 tadan kam.
- `read`/`listen` matni belgilangan so'z oralig'idan tashqarida.
- `dictate` jumlasi 8 so'zdan uzun.

### 3. `scripts/check-tasks.mjs` — mazmun tekshiruvi (AI, token sarflaydi)

`check-lessons.mjs` naqshini aynan takrorlaydi: **tor ta'rif**, faqat haqiqiy
xato belgilanadi, "yaxshiroq yozish mumkin edi" turidagi fikrlar 400 ta shovqinga
aylanib haqiqiy xatoni ko'mib yuboradi.

```
node scripts/check-tasks.mjs             # hamma darajalar
node scripts/check-tasks.mjs A1
node scripts/check-tasks.mjs A1 --uid=<uuid>
```

- **Vazifa boshiga bitta chaqiruv**, `mode: 'task_check'`.
- Natija: `.task-check/report-A1.md` — jadval: `| Unit | Vazifa | Joy | Muammo | Taklif |`.
- Yiqilgan chaqiruv "tekshirildi" deb hisoblanmaydi — hisobot boshida
  `Tekshirildi: N / M` va tekshirilmaganlar ro'yxati (`check-lessons.mjs:173` naqshi).
- 429 backoff bir xil.

Faqat shu hollarda xato deb belgilanadi:

- ko'rsatilgan javob (`answer`) noto'g'ri;
- bitta savolda ikkita yoki undan ko'p variant to'g'ri;
- inglizcha jumlada grammatik xato;
- o'zbekcha tarjima noto'g'ri yoki ortiqcha ma'no qo'shadi;
- jumla ma'no jihatdan bema'ni (grammatikasi to'g'ri bo'lsa ham);
- vazifa unit grammatikasini ko'rsatmaydi yoki unga **zid** shaklda;
- `read`/`listen` savolining javobi matnda yo'q;
- `order` jumlalarini boshqa tartibda ham mantiqiy joylashtirish mumkin
  (yagona yechim yo'q) — bu turning asosiy xato manbasi;
- `distractors` aslida to'g'ri gap tuzishga imkon beradi;
- o'zbekcha matnda imlo xatosi, tushib qolgan probel, apostrof xatosi
  (`o'`/`g'` o'rniga `o`/`g`), kirill harfi.

Xato deb belgilanmaydi: uslub, sinonim afzalligi, "yana misol qo'shsa bo'lardi",
noto'g'ri variantlarning juda oson tuyulishi, matnning qisqaligi.

## Ish tartibi

```
node scripts/build-tasks.mjs A1        # generatsiya (~85 chaqiruv)
node scripts/validate-tasks.mjs A1     # shakl — tekin, xato bo'lsa exit 1
node scripts/check-tasks.mjs A1        # mazmun — .task-check/report-A1.md
# hisobotni qo'lda ko'rib chiqish → tuzatish → validate qayta
```

## A1 pilot natijasi — o'lchangan

Ikki marta to'liq mazmun tekshiruvi o'tkazildi (har biri 85 chaqiruv).

| | 1-yugurish | 2-yugurish (prompt kuchaytirilgandan keyin) |
|---|---|---|
| Belgilangan | 15 / 85 (17.6%) | 12 / 85 (14.1%) |
| Qo'lda tekshirilgan namuna | 7 | 6 |
| Ulardan haqiqiy xato | 6 | 5 |
| **Tekshiruvchining yolg'on ijobiysi** | ~15-25% | ~15-25% |
| Baholangan haqiqiy xato ulushi | ~15% | ~12% |

**Birinchi xulosa: belgilangan sonni xom holda ishlatib bo'lmaydi.** Tekshiruvchi
o'zi ham xato qiladi — masalan `data` da `"a new chair"` turgan joyda `"an new
umbrella"` xatosini "topgan", va grammatik jihatdan buzilgan chalg'ituvchilarni
"takroriy variant" deb belgilagan. Har bir belgilangan band **manba data bilan
solishtirilishi shart**; aks holda haqiqiy xatolar shovqin ichida qoladi va
mezon noto'g'ri ishlaydi.

**Ikkinchi xulosa: qayta generatsiya yassilanadi.** Prompt uchta aniq xato sinfiga
qarshi kuchaytirilgandan keyin ham daraja ~12% da qoldi: eski xatolar ketdi,
o'rniga yangilari keldi. Bir xato (`A1-12 dictate` — "She is drinking tea" →
"U hozir choy **ichyapman**") qayta generatsiyada **aynan takrorlandi**. Ya'ni
"generatsiya → tekshir → qayta generatsiya" tsikli yakka o'zi yetarli emas.

**Uchinchi xulosa: `order` har unitga tushmaydi.** Grammatikasi *qarama-qarshilik*
bo'lgan unitda (A1-12 — Present Simple vs Continuous) generator ketma-ketlik
bog'lovchilarini majburlab qo'ydi va mantiqan bema'ni matn chiqdi: "First, I
always eat breakfast… Then, I am eating right now… After that, I usually drink
coffee during the weekend". `order` **hikoya qilinadigan** unitga mos keladi.
Qarama-qarshilik unitlarida tartibni ketma-ketlik emas, **havola zanjiri**
qulflashi kerak (olmosh oldingi jumladagi otga tayansin, "After breakfast" undan
oldin nonushta tilga olingan bo'lsin).

## Ish tartibiga qo'shimcha bosqich — qo'lda tuzatish

Yuqoridagi uchta xulosadan kelib chiqib, quvur ikki emas, **uch** bosqichli:

```
node scripts/build-tasks.mjs A1 --uid=<build-uid>    # generatsiya
node scripts/validate-tasks.mjs A1                   # shakl — tekin
node scripts/check-tasks.mjs A1 --uid=<check-uid>    # mazmun → hisobot
#  ↓ hisobotning HAR bandini manba data bilan solishtir
#  ↓ haqiqiylarini QO'LDA tuzat (plitkalar `en` bilan mos qolsin)
node scripts/build-tasks.mjs A1 --normalize          # javob indekslari
node scripts/validate-tasks.mjs A1                   # shakl qayta
```

A1 da qo'lda tuzatilgani: 9 ta band (uz↔en shaxs/son mosligi, "kitchen table" ↔
"oshxonada stol", "The cat is under the floor", to'g'ri javobning imlo xatosi
chalg'ituvchi bo'lib qolgani) va 2 ta `order` vazifasi butunlay qayta yozildi.
Bu ish darajaga **~40-60 daqiqa** oladi.

## To'xtash mezoni

A1 — pilot. Dastlabki mezon: "shubhali band ulushi 10% dan oshsa — to'xta".

**Mezon oshib ketdi** (o'lchangan ~12-15%), va bu yozib qo'yilishi kerak.
Lekin mezon noto'g'ri narsani o'lchagan ekan: u **nazoratsiz generatsiya**ni
nazarda tutgan edi. Amalda muhim savol boshqa — xatolar **topiladimi va
arzon tuzatiladimi**. Ikkalasiga ham javob ha: `check-tasks.mjs` ularni unit va
band aniqligida ko'rsatadi, tuzatish darajaga ~1 soat.

Shuning uchun qaror **foydalanuvchiniki**, avtomatik emas. Ikki yo'l:

- **davom etamiz** — qolgan 5 daraja × (85 chaqiruv + ~1 soat qo'lda tuzatish)
  ≈ 5 soat ish va ~$0.10. Natija: to'liq offline kontent;
- **to'xtaymiz** — A1 tayyor va ishlatishga yaroqli, lekin bitta daraja bilan
  APK chiqarish mantiqli emas.

Qayta ko'rib chiqiladigan haqiqiy signal — **qo'lda tuzatish ham yordam bermasa**
yoki xato ulushi keyingi darajada 12% dan ko'tarilsa (A1 eng oson daraja; C1-C2
da matn murakkabroq, xato ehtimoli yuqoriroq).

## Bu specga KIRMAYDI

- APK klienti, offline render, plitka UI, TTS integratsiyasi — 2-bosqich;
- o'yin rejimlari (vaqtga qarshi, memory, anagram, quloq) — 3-bosqich;
- `index.html` ga har qanday o'zgartirish;
- alohida repo / branch ajratish;
- RuStore build va moderatsiya.

1-bosqich yakuni — tekshirilgan `data/tasks-a1.json`, va "davom etamizmi" qaroriga
yetarli dalil.
