# Spec: Offline APK kontentini tugatish (B2, C1, C2)

## Maqsad
`data/tasks-b2.json`, `data/tasks-c1.json`, `data/tasks-c2.json` fayllarini
A1/A2/B1 kabi to'liq holga keltirish — har biri `validate-tasks.mjs`dan xatosiz
o'tadi va `test-offline.mjs` 14b bo'limida "oltin javob bilan xatosiz yurdi
(85/85 qadam)" natijasini beradi.

## Nega kerak
Offline APK (`uz.englishbot.offline`) hozir faqat A1, A2, B1 darajalarni
o'ynatadi. B2/C1/C2 uchun fayllar bor, lekin qisman: ba'zi unitlar butunlay
yo'q, ba'zilarida bo'sh vazifa bloklari bor, `levelExam`lar hech birida yo'q.
Bitiruvchisiz level ilovada "kontent yuklanmadi/to'liq emas" ekranini
ko'rsatadi — foydalanuvchi A1dan boshlab yuqori darajalarga chiqa olmaydi.

## Qamrov ICHIDA
- **C1**: `u06.json`–`u12.json` qoralamalarini `merge_unit.py` orqali
  `data/tasks-c1.json`ga qo'shish (agar hali qo'shilmagan bo'lsa); C1-12
  unitini yozib bitkazish (hozir bo'sh); C1 uchun `levelExam` (10 savol)
  yozish; javob indekslarini `build-tasks.mjs C1 --normalize` bilan
  aralashtirish (hozir deyarli hamma joyda `answer=0`).
- **B2**: unit 01,02,03,04,06,07,09 dagi bo'sh `translate`/`build`/`dictate`
  bloklarini to'ldirish; unit 09–12ni noldan yozish; B2 `levelExam` yozish;
  normalize.
- **C2**: unit 06–12ni noldan yozish (unit 06 tasklari bor, exam yo'q — uni
  ham tugatish); C2 `levelExam` yozish; normalize.
- Har daraja uchun runbook'dagi yakuniy darvoza: `build-tasks.mjs --normalize`
  → `validate-tasks.mjs` (exit 0) → `test-offline.mjs` (HAMMASI OK, shu
  jumladan 14b'da o'sha daraja "85/85 qadam" bilan) → `test-program.mjs`
  (HAMMASI OK).
- Ish tartibi: C1 → B2 → C2, ketma-ket, oraliqda to'xtamasdan; oxirida bitta
  yakuniy hisobot.
- Ishlatib bo'lingan vaqtinchalik fayllarni (`u06.json`…`u12.json`,
  `merge_unit.py`, `b1dump.txt`, `c1dump.txt`) tozalash.

## Qamrov TASHQARISIDA
- Yangi daraja qo'shish yoki `CURRICULUM` (online kontent)ni o'zgartirish —
  bu spec faqat offline `data/tasks-*.json`ga tegishli.
- `scripts/build-tasks.mjs`ning AI-generatsiya rejimini ishlatish — runbook
  bo'yicha bu endi taqiqlangan, hammasi qo'lda yoziladi.
- `check-glosses.mjs` orqali online lug'atlarni qayta tekshirish — so'zlar
  allaqachon `CURRICULUM`da tasdiqlangan, faqat offline vazifalar yetishmaydi.
- Android build/APK chiqarish — kontent tugagach alohida qadam, bu spec
  qamrovida emas.

## Texnik
- Manba: `data/curriculum-c1.json`, `curriculum-b2.json`, `curriculum-c2.json`
  (so'zlar, grammatika, `explain` — o'zgartirilmaydi).
- Natija: `data/tasks-c1.json`, `tasks-b2.json`, `tasks-c2.json`.
- Yordamchi skript: `merge_unit.py` (C1 uchun qoralamalarni asosiy faylga
  qo'shadi) — ishlatilgach o'chiriladi.
- Qoidalar: `docs/specs/authoring-runbook.md` (tiles/distractors arifmetikasi,
  javob indekslarini aralashtirish, `order`ning yagona yechim shartlari,
  imtihon tuzilishi 8/10 savol va h.k.) — so'zma-so'z shu hujjatga amal
  qilinadi.
- DB/migration yo'q — bu faqat statik JSON fayllar.

## Qoidalar (runbook'dan qisqacha, EARS uslubida)
- QACHON yangi unit yoziladi
  TIZIM avval `curriculum-<lv>.json`dagi `words[25]`/`grammar`/`tasks[6]`ni
  o'qishi SHART
  VA offline turni `{ speak: 'dictate', write: 'order' }[onlineType] ||
  onlineType` formulasi bilan chiqarishi SHART.
- QACHON `translate`/`build`/`dictate` yoziladi
  TIZIM `tiles`ni `en`ning aynan so'z ko'p to'plami qilishi SHART
  VA `distractors`ni 2-3 ta, `tiles`da yo'q, jami ≤12 tugma bo'ladigan
  qilib tanlashi SHART
  VA chalg'ituvchilar bilan boshqa to'g'ri gap tuzib bo'lmasligini
  tekshirishi SHART.
- QACHON `read`/`listen`/`exam`/`levelExam` savoli yoziladi
  TIZIM 4 ta noyob variant va faqat bitta to'g'ri javob berishi SHART
  VA `answer` indekslarini savollar bo'ylab aralashtirishi SHART (keyin
  `--normalize` bilan mexanik tekshirilib tasdiqlanadi).
- QACHON `order` yoziladi
  TIZIM 5 jumlani faqat bitta to'g'ri ketma-ketlik chiqadigan qilib bog'lashi
  SHART (olmosh/vaqt zanjiri orqali, shunchaki bog'lovchi bilan emas).
- AGAR unit yozib bo'lingach `validate-tasks.mjs <LV>` xato bersa
  TIZIM keyingi unitga o'tmasdan o'sha unitni tuzatishi SHART.
- AGAR daraja uchun `test-offline.mjs` 14b "kontent to'liq emas" desa
  TIZIM o'sha darajani tugallangan deb hisoblaMASLIGI SHART.

## Acceptance criteria
- [ ] `node scripts/validate-tasks.mjs B2` — exit 0, xatosiz
- [ ] `node scripts/validate-tasks.mjs C1` — exit 0, xatosiz
- [ ] `node scripts/validate-tasks.mjs C2` — exit 0, xatosiz
- [ ] `node scripts/test-offline.mjs` chiqishida B2, C1, C2 uchun
      "oltin javob bilan xatosiz yurdi (85/85 qadam)" qatori bor
- [ ] `node scripts/test-program.mjs` — HAMMASI OK
- [ ] `merge_unit.py`, `u06–u12.json`, `b1dump.txt`, `c1dump.txt` o'chirilgan
- [ ] Cyrillic/apostrof/word-count kabi runbook qoidalariga zid narsa yo'q
