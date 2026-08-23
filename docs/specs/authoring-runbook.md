# Kontentni qo'lda yozish — runbook

Offline vazifa kontentini **AI generatsiyasisiz**, to'g'ridan-to'g'ri yozish tartibi.
Sxema [offline-tasks.md](offline-tasks.md) da; bu hujjat — yozuvchi uchun.

`scripts/build-tasks.mjs` (Gemini orqali generatsiya) endi ishlatilmaydi. Sabab:
bepul kvota kuniga ~500 so'rov va u jonli ilova bilan bitta hovuzda —
generatsiya haqiqiy foydalanuvchilarni bloklab qo'ydi. Yozuvchi model
kontentni to'g'ridan-to'g'ri yozsa, kvota umuman kerak emas va sifat yuqoriroq
bo'ladi.

## Nima yoziladi

Bitta daraja = **12 unit × 6 vazifa + 12 unit imtihoni + 1 daraja imtihoni**.

Manba: `data/curriculum-<lv>.json` — har unitning `id`, `title`, `can`,
`grammar`, `explain`, `words[25]` (`{en, uz, ipa}`) va `tasks[6]` (onlayn tur
nomlari).

Natija: `data/tasks-<lv>.json`.

Offline tur onlayn turdan formula bilan chiqadi:

```
{ speak: 'dictate', write: 'order' }[onlineType] || onlineType
```

Shablonni **taxmin qilma** — har unitning haqiqiy `tasks` massividan o'qi
(A1-01/02/03 da istisnolar bor va boshqa darajalarda ham bo'lishi mumkin).

## Ish tartibi — unit-ba-unit

Butun faylni bir marta yozishga urinma. Har unitdan keyin tekshir:

```
node scripts/validate-tasks.mjs <LEVEL>
```

Shakl xatosi darhol ko'rinadi va bitta unitni tuzatish oson; 12 unit yozib
qo'yib keyin 40 ta xato bilan kurashish qiyin.

Skelet yaratish va unit yozish uchun Python qulay:

```
PYTHONIOENCODING=utf-8 python - << 'EOF'
import io, json, os
lv = 'A2'; p = f'data/tasks-{lv.lower()}.json'
cur = json.load(io.open(f'data/curriculum-{lv.lower()}.json', encoding='utf-8'))[lv]
if os.path.exists(p):
    d = json.load(io.open(p, encoding='utf-8'))
else:
    d = { 'level': lv,
          'units': [ { 'id': u['id'], 'tasks': [None]*len(u['tasks']), 'exam': [] } for u in cur ],
          'levelExam': [] }
# ... unitni to'ldir ...
io.open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2))
EOF
```

## Sifat qoidalari

Bular A1 pilotida **amalda topilgan** xatolardan chiqarilgan. Har biri haqiqiy
holat, taxmin emas.

### Umumiy

- Ingliz tili benuqson. Grammatikasi to'g'ri, lekin odam aytmaydigan gap
  (`"I live in an office"`, `"The cat is under the floor"`) — xato.
- O'zbekcha matn **faqat lotin**. Kirill `а е о с` mutlaqo mumkin emas —
  lotin bilan bir xil ko'rinadi va ko'zdan qochadi.
- `o'` va `g'` to'g'ri apostrof bilan (`o'qituvchi`, emas `oqituvchi`).
- **uz va en bir xil ma'noni bersin**: shaxs, son, zamon uchtasi ham mos.
  Amalda chiqqan xatolar: `"Bu shahar katta"` → `"These cities are big"`,
  `"She is drinking tea"` → `"U hozir choy ichyapman"`.
- So'zma-so'z tarjima ma'noni buzmasin: `"Oshxonada stol bor"` ≠
  `"There is a kitchen table"` (bu "oshxona stoli" degani).
- Til, mamlakat, shahar nomlari bosh harf bilan: `English`, `Bukhara`.
- Har vazifa unit `grammar` maydonidagi **shaklni ko'rsatsin**. Unit so'zini
  ishlatish yetarli emas: kauzativ (`have something done`) unitida
  `"She wants to renovate her apartment"` — o'rgatilayotgan shaklning aksi.
- Unit lug'ati **etalon**: so'z tarjimasi kerak bo'lganda `curriculum` dagi
  `uz` maydoni AYNAN ko'chiriladi.

### Variantli savollar (`read`, `listen`, `exam`, `levelExam`)

- Aynan **4 variant**, hammasi noyob, **faqat bittasi to'g'ri**.
- Noto'g'ri variantlar **tipik xato** bo'lsin (`"I is"`, `"He have"`), tasodifiy
  so'z emas.
- Chalg'ituvchi **to'g'ri javobning imlo xatosi bo'lmasin**: `['honzir',
  'hozir', …]` — o'quvchi tasodifan noto'g'ri bosadi va sababini tushunmaydi.
- `answer` indeksi bandlar bo'ylab **turlicha** bo'lsin (0,1,2,3 aralash).
  Hammasi 0 bo'lsa o'quvchi doim birinchisini bosib 5/5 oladi.
  Yozib bo'lgach `node scripts/build-tasks.mjs <LEVEL> --normalize` ishga tushir —
  u indekslarni mexanik taqsimlaydi (API'ga chiqmaydi, tekin).
- `read`/`listen`: **har savolning javobi matnda bo'lsin** va faqat bitta
  variant matnga mos kelsin. Amalda chiqqan xato: matnda `"the apple is small"`,
  javob esa `"The apple is old"`.
- Kontekstdagi so'z ma'nosi savolida javob so'zning **matndagi** ma'nosi
  bo'lsin: `box` — quti, "stol" emas.

### Plitkali turlar (`translate`, `build`, `dictate`)

- `tiles` — `en` ning so'zlari, **aynan o'sha ko'p to'plam**, tinish belgisisiz.
  Takrorlanuvchi so'z ikki marta: `"The cat and the dog"` → beshta plitka
  (`The, cat, and, the, dog`).
- `distractors` — **2 yoki 3 ta**, `tiles` da bo'lmasin, ishonarli grammatik
  xato bo'lsin (`is` o'rniga `are`, `a` o'rniga `the`).
- **Chalg'ituvchilardan boshqa to'g'ri gap tuzib bo'lmasin.** Misol:
  tiles `["She","is","a","doctor"]` + distractors `["He","was"]` →
  `"He was a doctor"` ham to'g'ri, ya'ni ikkita javob paydo bo'ladi. Xato.
- **Arifmetika**: gap eng ko'pi **8 so'z** + eng ko'pi 3 chalg'ituvchi = 11 ≤ 12.
  Gapni 8 so'zdan uzun yozma. Uzun so'zli darajada ham so'z **soni** muhim.
- `build`: `word` unit lug'atidan, `en` ichida **ishlatilgan** bo'lsin
  (`sit` → `sitting` qabul qilinadi), `uz` — lug'atdagi tarjima aynan.
  5 ta band, 5 ta har xil so'z.
- `dictate`: jumla **4-8 so'z**, omofon juftlardan qoch (their/there, two/too/to,
  your/you're, its/it's, buy/by, know/no, hear/here).

### `read` va `listen` matnlari

- Uzunlik: A1-A2 — 60-90 so'z (`read`), B1-B2 — 100-140, C1-C2 — 150-200.
  `listen` har doim 60-100 so'z (quloq bilan qabul qilish qiyinroq).
- **So'zlarni sana.** Qisqa matndan 5 ta mustaqil savol chiqmaydi va savollar
  bir-birini takrorlaydi.
- `read` savollari: 1) umumiy mazmun 2-3) aniq fakt 4) so'zning kontekstdagi
  ma'nosi 5) mantiqiy xulosa.
- `listen` savollari faqat matnda **aniq aytilgan** faktlarga — matn ko'rinmaydi,
  xulosa chiqarish adolatsiz.

### `order`

Eng nozik tur. **Yagona yechim bo'lishi shart.**

- 5 jumla, bitta mavzu, har biri 5-12 so'z.
- Tartibni **havola zanjiri** qulflasin, faqat bog'lovchi emas:
  ot birinchi marta to'liq aytilsin, keyin olmosh bilan (`my sister` → `she`);
  `"After breakfast…"` faqat nonushta tilga olingandan keyin kelsin;
  aniq vaqt belgilari o'sish tartibida.
- **`order` hikoya qilinadigan unitga mos keladi.** Grammatikasi
  *qarama-qarshilik* bo'lgan unitda (Present Simple vs Continuous) ketma-ketlik
  sun'iy chiqadi. A1-12 da aynan shunday bo'lgan:
  > "First, I always eat breakfast every morning. Then, I am eating breakfast
  > right now. After that, I usually drink coffee during the weekend."

  Bunday unitda ketma-ketlikni **kun davomidagi voqea** ustiga qur, ikki zamonni
  tabiiy aralashtir (odat → bugungi istisno → hozirgi harakat).
- Yozgach o'zingni sina: **ikkita jumlani o'rin almashtirsang matn buziladimi?**
  Buzilmasa — qayta yoz.
- Inglizcha matnda `o'clock` yozma (`o clock` yoki `10:00`) — validator
  o'zbekcha apostrof deb belgilamaydi, lekin chalkashlikdan qochgan ma'qul.

### Imtihonlar

- `exam` — 8 ta: 1-5 o'zbekcha jumla → 4 ta inglizcha variant (unit
  grammatikasi); 6-8 unit lug'atidan so'z ma'nosi (inglizcha so'z → 4 ta
  o'zbekcha variant). 6-8 dagi noto'g'ri variantlar ham **shu unit lug'atidan**.
- `levelExam` — 10 ta: 1-6 grammatika (turli unitlar aralash, har savol boshqa
  unitdan); 7-8 xato topish (xato inglizcha jumla + 4 ta tuzatilgan variant);
  9-10 daraja lug'atidan so'z ma'nosi.

## Yakuniy darvoza — majburiy

```
node scripts/build-tasks.mjs <LEVEL> --normalize   # javob indekslari, API'siz
node scripts/validate-tasks.mjs <LEVEL>            # exit 0 SHART
node scripts/test-offline.mjs                      # HAMMASI OK SHART
node scripts/test-program.mjs                      # HAMMASI OK SHART
```

`test-offline.mjs` ning **14b** bo'limi darajani boshidan oxirigacha yuradi
(85 qadam) va har vazifaga data'dan olingan **to'g'ri javobni** beradi.
Chiqishda quyidagi qator bo'lishi kerak:

```
OK   <LEVEL>: oltin javob bilan xatosiz yurdi (85/85 qadam)
```

`— <LEVEL>: kontent to'liq emas … o'tkazildi` chiqsa — ish tugamagan.

Bu darvoza `validate-tasks.mjs` topa olmaydigan narsalarni tutadi: `tiles`
`en` ni yig'a olmasligi, `answer` indeksi siljib qolgani, tur moslashtirishning
buzilishi, `order` pozitsiya hisobidagi xato.
