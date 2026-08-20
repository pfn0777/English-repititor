# Joylashtirish testi (placement)

## Muammo

Onboardingda foydalanuvchi darajani **o'zi tanlaydi** (`ob-level` select, standart A1).
Bu ikki tomonlama xato beradi va ikkalasi ham foydalanuvchini yo'qotadi:

- **O'zini kam baholagan B1** A1 dan boshlaydi. 12 unit × 7 qadam = 84 qadam, kuniga
  3-5 tadan — u bilgan narsani takrorlab bir oy o'tkazadi va ilovani tashlab ketadi.
- **O'zini yuqori baholagan A2** B2 ga tushadi, hech narsani o'tolmaydi, `relief` va
  `canSkip` sikliga tiqiladi.

Mavjud `calibrate()` bu muammoni yopmaydi: u **bir marta**, dastlabki
`CALIBRATION_TASKS` (3) vazifadan keyin va faqat **±1 daraja** siljitadi. Ya'ni A1 dan
boshlagan B1 eng yaxshi holatda A2 ga chiqadi — hamon o'z darajasidan past.

## Yechim

Onboardingga **lokal** 15 savollik joylashtirish testi. AI chaqiruvi yo'q:

- **0 token** — Gemini/Claude chaqirilmaydi, `usage` qatori yozilmaydi;
- **offline ishlaydi** — manba `CURRICULUM`, u `index.html` ichida;
- **deterministik** — `rng` tashqaridan beriladi, shuning uchun testda takrorlanadi.

Test **majburiy emas**. Daraja select'i joyida qoladi; test uni to'ldiradi, almashtirmaydi
("Darajangizni bilmaysizmi? 2 daqiqalik test"). Majburiy qilish onboardingga to'siq
qo'yadi va ro'yxatdan o'tishni pasaytiradi.

## Nimani o'lchaydi (va nimani o'lchamaydi)

Savollar **lug'at bilimi** bo'yicha: inglizcha so'z → 4 ta o'zbekcha variantdan bittasi.

Bu ataylab tor: `CURRICULUM` da har unitning `grammar` maydoni bor, lekin **grammatika
savollari yo'q** — ularni yozish 6 daraja × yangi data degani. Lug'at hajmi CEFR daraja
bilan kuchli korrelyatsiyada, shuning uchun joylashtirish uchun yetarli signal beradi.

**Chegara ochiq aytiladi:** bu test grammatikani o'lchamaydi. Shuning uchun `calibrate()`
**o'chirilmaydi** — u dastlabki 3 vazifada haqiqiy ishlash bo'yicha yana bir marta
tuzatadi. Ikkisi bir-birini almashtirmaydi: placement — kirish nuqtasi, calibration —
birinchi haqiqiy ishlashdan keyingi tuzatish.

## Tuzilishi

15 savol: **A1, A2, B1, B2, C1** darajalaridan **3 tadan**.

C2 yo'q — hech kim C2 dan boshlamaydi va C2 so'zlari A1 foydalanuvchini keraksiz
qo'rqitadi. Barcha 5 daraja o'tilsa natija C2 bo'ladi (quyidagi qoidaga qarang).

Har savol:
- **target** — shu darajaning istalgan unitidan so'z (`{ en, uz, ipa }`);
- **4 variant** — to'g'ri `uz` + 3 ta chalg'ituvchi;
- chalg'ituvchilar **boshqa darajalardan** olinadi. Bir unit ichidan olinsa ma'nolar
  yaqin bo'lib qoladi (`aka`/`uka`, `opa`/`singil`) va savol lug'atni emas, nozik
  farqni tekshiradigan bo'lib qoladi;
- variantlar `uz` matni bo'yicha takrorlanmasligi shart.

Har savolda **"Bilmayman"** tugmasi bor va u **noto'g'ri** deb sanaladi. Tasodifiy
tanlash 25% to'g'ri beradi — bu joylashtirishni yuqoriga surib yuboradi; "bilmayman"
tugmasi taxmin qilishga muqobil yo'l beradi.

## Baholash qoidasi

```
A1 → A2 → B1 → B2 → C1 tartibida yuriladi.
Har darajada 3 savol. Shu darajada >= 2 to'g'ri bo'lsa — "o'zlashtirilgan", keyingisiga.
Birinchi o'zlashtirilmagan daraja — natija.
Hammasi o'zlashtirilgan bo'lsa — SO'RALGAN eng yuqori darajadan keyingisi (odatda C2).
Hech narsa so'ralmagan bo'lsa — A1.
```

Ya'ni natija — foydalanuvchi **hali bilmaydigan birinchi daraja**, u bilgan eng yuqori
daraja emas. Bu ataylab: dastur o'rgatish uchun, tasdiqlash uchun emas.

Oxirgi ikki qator muhim: "hammasi o'tdi → C2" deb yozish faqat to'liq zinapoya
so'ralganda to'g'ri bo'ladi. Agar biror darajaning syllabusi yo'q bo'lib, u savolsiz
qolsa, "eng yuqori daraja" qoidasi foydalanuvchini asossiz C2 ga otib yuborardi;
bo'sh javob ro'yxati ham xuddi shunday. Ikkalasi ham testda qopqoqlangan.

Qoida "zanjir" shaklida — yuqori darajani bilib, pastini bilmaslik holatida (tasodifiy
javob yoki e'tiborsizlik) foydalanuvchi pastdan boshlaydi. Bu xavfsiz tomonga xato.

## Natijaning qo'llanishi

- Natija `CURRICULUM` da syllabusi bor darajaga tushiriladi (`ob-btn` dagi mavjud
  `ready` mantig'i bilan bir xil);
- foydalanuvchiga natija ekrani ko'rsatiladi: daraja, nechta to'g'ri, va **o'zgartirish
  imkoni** — test tavsiya, hukm emas;
- `initProgram(level)` shu daraja bilan chaqiriladi.

## Funksiyalar (sof, `test-program.mjs` sinaydi)

| Funksiya | Vazifasi |
|---|---|
| `placementPool()` | `CURRICULUM` dan daraja → so'zlar ro'yxati |
| `buildPlacement(rng)` | 15 ta savol yasaydi; `rng` — `() => [0,1)` |
| `scorePlacement(answers)` | javoblardan darajani hisoblaydi |
| `playableLevel(level)` | natijani syllabusi bor darajaga tushiradi |
| `pickN(list, n, rng)` | takrorlanmaydigan n ta element |

`PLACEMENT_LEVELS`, `PLACEMENT_PER_LEVEL` (3), `PLACEMENT_PASS` (2) — konstantalar.

`Math.random` faqat UI chaqiruvida ishlatiladi; sof funksiyalar `rng` ni argument
sifatida oladi, aks holda testni takrorlab bo'lmaydi.
