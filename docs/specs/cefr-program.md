# Spec: CEFR dastur tizimi (A1→C2 qattiq qo'l repetitor)

## Maqsad

EnglishBot'ni erkin chat botdan **dasturli repetitorga** aylantirish: kodda qat'iy yozilgan CEFR syllabusi bo'yicha har kuni bitta vazifa beradi, AI tekshiradi, o'tmaguncha keyingisini bermaydi.

## Nega kerak

Hozirgi holatda:

- **Daraja XP bilan ko'tariladi** — `currentLevel()` `user.xp` dan hisoblanadi, XP esa har AI javobiga +10 beriladi. Ya'ni 20 marta "hello" yozgan odam A2 bo'ladi. Daraja ma'nosiz.
- **Vazifa obyekti yo'q** — `daily` shunchaki chat rejimi. "Berildi → topshirildi → tekshirildi → o'tdi" holati saqlanmaydi, shuning uchun "bajarmaguncha yangi vazifa bermaslik" texnik jihatdan imkonsiz.
- **AI xotirasi yo'q** — `user.vocabulary` saqlanadi, lekin `buildSystem()` ga umuman uzatilmaydi. AI kecha o'rgatgan so'zini bugun bilmaydi.
- **Ketma-ketlik yo'q** — AI bir kun Present Perfect, ertasiga Passive Voice berishi mumkin. Bo'shliqlar va takrorlar paydo bo'ladi.

## Qamrov ICHIDA

### 1. CURRICULUM konstantasi (A1 + A2)

`index.html` ichida qat'iy yozilgan syllabus:

```js
const CURRICULUM = {
  A1: [ /* 12 unit */ ],
  A2: [ /* 12 unit */ ],
};
```

Har unit strukturasi:

```js
{
  id:      'A1-01',
  title:   "Salomlashish va tanishuv",
  can:     "O'zim haqimda oddiy gaplar ayta olaman",   // can-do statement
  grammar: "to be (am/is/are), shaxs olmoshlari",
  words:   ['hello','name','my','your', ...],           // 20-30 ta
  tasks:   ['translate','build','write','listen','translate','build'],  // 6 ta
}
```

- 1 unit = **6 vazifa + 1 unit imtihoni = 7 kun** (kuniga 1 vazifa tempida)
- 12 unit × 7 kun ≈ **2.8 oy / daraja**

### 2. Vazifa turlari (4 ta)

| Kalit | Nomi | Tavsif | Tekshiruv |
|---|---|---|---|
| `translate` | Tarjima | 5 ta o'zbekcha jumla → inglizchaga | Har jumla to'g'ri/xato, 5 balldan |
| `build` | Gap tuzish | Unit lug'atidan 5 so'z → 5 gap | Har gap grammatik to'g'rilik + so'z ishlatilgani |
| `write` | Qisqa yozma | Unit mavzusida 50-120 so'z | 5 mezon: mavzuga moslik, grammatika, leksika, tuzilish, so'z soni |
| `listen` | Tinglash | AI matn beradi → TTS o'qiydi → 5 savol | Har javob to'g'ri/xato |

Barcha turlarda AI **javobni ko'rsatmaydi**, faqat tekshiradi.

### 3. Vazifa holati (state machine)

```
        yangi vazifa
             ↓
    ┌───► [open] ──javob──► [submitted] ──AI tekshiradi──┐
    │                                                     │
    │                              ┌──── score ≥ 80% ────┤
    │                              ↓                      ↓
    │                          [passed]              [failed]
    │                              │                      │
    │                              │                attempts++
    └──────────────────────────────┼──────────────────────┘
                                   ↓
                          taskIndex++ (keyingi vazifa)
```

**3 urinish qoidasi:**

- 1-2 urinish FAIL → AI faqat **ishora** beradi (`💡 Ishora: ...`), vazifa matni o'zgarmaydi
- 3-urinish FAIL → AI mavzuni **to'liq tushuntiradi** + yengillashtirilgan variant beradi (5 o'rniga 3 jumla), lekin vazifa baribir bajarilishi shart
- Har FAIL dagi `🧩 Mavzu:` marker → `eb_errors` (zaif joylar)

### 4. Bloklash

- Vazifa `passed` bo'lmaguncha **"Keyingi vazifa" tugmasi bloklanadi**
- Chat, testlar, lug'at, takrorlash — **ochiq qoladi** (to'liq blok qilinmaydi)
- Kuniga **maksimum 3 vazifa**. 3 tadan keyin: "Bugungi norma bajarildi — ertaga davom etamiz 💪"

### 5. Daraja ko'tarilishi

- Daraja XP dan **ajratiladi**. `user.program.level` — yagona haqiqat manbai
- `currentLevel()` funksiyasi XP hisobidan olib tashlanadi, XP faqat motivatsiya/yutuqlar uchun qoladi
- Darajaning barcha 12 uniti `passed` bo'lgach → **daraja imtihoni**:
  - 10 ta tarjima + 1 ta yozma (120 so'z) + 5 ta tinglash savoli
  - 80%+ → keyingi daraja ochiladi, `unitIndex = 0`
  - FAIL → AI qaysi unitlar zaif ekanini aytadi, o'sha unitlardan 2 ta takror vazifa beriladi, keyin qayta imtihon

### 6. Unit imtihoni

Unit ichidagi 6 vazifa tugagach — 7-qadam sifatida unit imtihoni: 5 tarjima + 3 lug'at savoli. 80%+ → unit `passed`.

### 7. 3 kunlik kalibratsiya

Dastlabki 3 ta vazifa natijasiga qarab, **bir marta**:

- 3/3 PASS va o'rtacha ball 100% → daraja **bir pog'ona yuqoriga**, sabab tushuntiriladi
- 3/3 FAIL → daraja **bir pog'ona pastga** (A1 dan pastga tushmaydi)
- Aralash → o'zgarmaydi

Kalibratsiya bir marta ishlaydi, keyin `calibration.checked = true`.

### 8. AI xotirasi (`language-tutor` skillidan)

`buildSystem()` ga qo'shiladi:

- **Joriy unit**: id, title, grammar, can-do, unit so'zlari
- **Vocabulary**: oxirgi 30 so'z (`user.vocabulary`, `VOCAB_IN_PROMPT` konstantasi) — "bu so'zlarni bilib bo'ldi, qayta ishlat va tekshir". Butun lug'at emas: `chat/index.ts` da `MAX_PAYLOAD_CHARS = 20000`
- **Zaif joylar**: `getErrors()` (allaqachon bor, saqlanadi)
- **Vazifa konteksti**: joriy vazifa turi, urinishlar soni, yengillashtirilganmi

### 9. Progress saqlash (Supabase)

- `users` jadvaliga `progress jsonb not null default '{}'::jsonb` ustuni
- Yangi Edge Function: `progress` — `{ userId, action:'get'|'save', progress }`
- localStorage (`eb_user.program`) — cache. Ilova ochilganda serverdan tortadi, har o'zgarishda serverga yozadi (fire-and-forget, xato bo'lsa localStorage baribir ishlaydi)
- Konflikt: server `updatedAt` yangiroq bo'lsa — server yutadi

### 10. IELTS

- IELTS rejimi **B1 darajadan** ochiladi
- A1-A2 da `user.goal === 'ielts'` bo'lsa ham band ko'rsatilmaydi; o'rniga: "IELTS uchun kamida B1 kerak — hozir A1 dasturidasiz, B1 ga yetganda ochiladi"
- B1+ da hozirgi IELTS rejimlari (IELTS_GUIDE) o'zgarishsiz ishlaydi, dastur ustiga qo'shimcha sifatida

## Qamrov TASHQARISIDA (bularni qilma!)

- **B1, B2, C1, C2 unitlari** — birinchi bosqichda faqat A1+A2 (24 unit). Qolgani keyingi bosqich; A2 tugagan foydalanuvchi "B1 tayyorlanmoqda" ekranini ko'radi
- **Majburiy placement test** — o'rniga 3 kunlik avtomatik kalibratsiya
- **Ovozli talaffuz baholash** — mavjud mikrofon/TTS o'z holida qoladi, dastur vazifalarida ishlatilmaydi (`listen` turi faqat TTS chiqishi)
- **Madaniy kontekst rejimi** — `language-tutor` skillida bor, bizga kerak emas
- **Ko'p tillilik** — faqat ingliz tili
- **Eski erkin rejim bilan parallel tizim** — dastur yagona tizim bo'ladi, eski chat rejimlari mavjud, lekin dasturga bo'ysunadi
- **To'lov, reyting, ijtimoiy funksiyalar**
- **Unit mazmunini AI generatsiya qilishi** — CURRICULUM qat'iy, kodda

## Texnik

| Nima | Qayerda |
|---|---|
| CURRICULUM konstantasi | `index.html` — 1-bo'lim (CONSTANTS) dan keyin yangi bo'lim |
| Dastur logikasi (`getCurrentUnit`, `issueTask`, `submitTask`, `checkLevelUp`, `calibrate`) | `index.html` — yangi 4.5-bo'lim |
| `buildSystem()` kengaytmasi | `index.html:336` |
| Natija parseri `parseResult()` | `index.html` — 7-bo'lim (parseBand yonida) |
| `currentLevel()` o'zgarishi | `index.html:141` — XP emas, `user.program.level` |
| Dashboard "Bugungi vazifa" kartasi | `index.html:677` `renderDashboard()` |
| Yangi ko'rinish `renderTask()` | `index.html` — Tasks view o'rniga |
| Progress sinxronizatsiya `syncProgress()` | `index.html` — 3-bo'lim (STORAGE) |
| DB migration | `users` jadvaliga `progress jsonb` ustuni |
| Yangi Edge Function | `supabase/functions/progress/index.ts` |

### Ma'lumot modeli

```js
user.program = {
  level: 'A1',
  unitIndex: 0,              // shu daraja ichidagi unit indeksi
  taskIndex: 0,              // unit ichidagi vazifa indeksi (0-5), 6 = unit imtihoni
  current: {                 // joriy vazifa, null bo'lishi mumkin
    unitId:   'A1-01',
    taskIndex: 0,
    type:     'translate',
    prompt:   '...',         // AI generatsiya qilgan vazifa matni
    issuedAt: '2026-08-06T09:00:00.000Z',
    status:   'open',        // open | submitted | passed | failed
    attempts: 0,
    relief:   false,         // 3-urinishdan keyin yengillashtirilganmi
    lastScore: null,         // { correct: 4, total: 5 }
  },
  passedUnits: [],           // ['A1-01', 'A1-02']
  doneToday:   { date: '2026-08-06', count: 0 },
  calibration: { results: [], checked: false },
  levelExam:   { pending: false, attempts: 0 },
  updatedAt:   '2026-08-06T09:00:00.000Z',
};
```

### AI natija markeri

AI tekshiruv javobining **birinchi qatorida majburiy**:

```
📊 NATIJA: 4/5

❌ Xato: ...
✅ To'g'ri: ...
```

> Nega boshida, oxirida emas: `chat/index.ts` da `maxOutputTokens: 1000`. `write` turidagi vazifani tekshirish (5 mezon + tuzatishlar) shu chegaradan oshadi va javob kesiladi. Marker oxirida bo'lsa kesilib yo'qoladi va vazifa **hech qachon PASS bo'lmaydi**. Boshida bo'lsa kesilishga chidamli.

`parseResult()` buni o'qiydi va **PASS/FAIL ni klientda o'zi hisoblaydi** (`correct/total >= 0.8`). AI ning o'z `PASS`/`FAIL` so'zi e'tiborga olinmaydi — AI ba'zan yumshoqlik qiladi.

Marker topilmasa → `status` `submitted` da qoladi, foydalanuvchiga "Tekshiruv tugallanmadi, javobingizni qayta yuboring" deyiladi (XP berilmaydi, urinish hisoblanmaydi).

## Qoidalar (EARS)

- **QACHON** foydalanuvchi dashboard'ni ochsa
  **VA** `program.current` null bo'lsa
  **VA** `doneToday.count < 3` bo'lsa
  **TIZIM** "Bugungi vazifani boshlash" tugmasini faol ko'rsatishi SHART

- **QACHON** foydalanuvchi vazifani boshlasa
  **TIZIM** joriy unit va vazifa turiga qarab AI dan vazifa so'rashi SHART
  **VA** `current.status = 'open'`, `issuedAt` ni yozishi SHART

- **QACHON** foydalanuvchi javob yuborsa
  **TIZIM** `current.status = 'submitted'` qilishi SHART
  **VA** AI ga tekshirish uchun yuborishi SHART
  **VA** javobdan `📊 NATIJA: N/M` ni ajratib olishi SHART

- **QACHON** `N/M >= 0.8` bo'lsa
  **TIZIM** `current.status = 'passed'` qilishi SHART
  **VA** `taskIndex++`, `doneToday.count++` qilishi SHART
  **VA** +25 XP berishi SHART
  **VA** tabriklovchi xabar ko'rsatishi SHART

- **AGAR** `N/M < 0.8` bo'lsa
  **TIZIM** `current.status = 'failed'`, `attempts++` qilishi SHART
  **VA** `attempts < 3` bo'lsa faqat ishora berishi SHART
  **VA** `attempts >= 3` bo'lsa `relief = true` qilib yengillashtirilgan variant berishi SHART
  **VA** keyingi vazifaga o'tkazMASLIGI SHART
  **VA** XP berMASLIGI SHART

- **AGAR** `doneToday.count >= 3` bo'lsa
  **TIZIM** yangi vazifa berishni rad etishi SHART
  **VA** "Bugungi norma bajarildi — ertaga davom etamiz" deb ko'rsatishi SHART

- **QACHON** `taskIndex === 6` bo'lsa
  **TIZIM** unit imtihonini berishi SHART
  **VA** o'tsa `passedUnits` ga unit id qo'shib, `unitIndex++`, `taskIndex = 0` qilishi SHART

- **QACHON** `unitIndex === 12` bo'lsa (barcha unitlar tugadi)
  **TIZIM** `levelExam.pending = true` qilishi SHART
  **VA** faqat daraja imtihonini taklif qilishi SHART

- **QACHON** daraja imtihoni 80%+ bo'lsa
  **TIZIM** `level` ni keyingi darajaga o'tkazishi SHART
  **VA** `unitIndex = 0`, `taskIndex = 0` qilishi SHART
  **VA** yutuq/tabrik ekranini ko'rsatishi SHART

- **AGAR** `level === 'A2'` **VA** barcha unitlar tugagan bo'lsa
  **TIZIM** "B1 dasturi tayyorlanmoqda" ekranini ko'rsatishi SHART
  **VA** erkin chat rejimlarini taklif qilishi SHART

- **QACHON** `calibration.results.length === 3` **VA** `calibration.checked === false` bo'lsa
  **TIZIM** natijalarni baholab darajani bir pog'ona surishi SHART (yoki qoldirishi)
  **VA** sababini foydalanuvchiga tushuntirishi SHART
  **VA** `calibration.checked = true` qilishi SHART

- **QACHON** `user.goal === 'ielts'` **VA** `level` A1 yoki A2 bo'lsa
  **TIZIM** IELTS rejimlarini yopishi SHART
  **VA** "IELTS uchun kamida B1 kerak" xabarini ko'rsatishi SHART

- **QACHON** ilova ochilsa
  **TIZIM** serverdan `progress` ni tortishi SHART
  **AGAR** server `updatedAt` localStorage'nikidan yangiroq bo'lsa
  **TIZIM** server versiyasini olishi SHART

- **AGAR** progress serverga saqlanmasa (tarmoq xatosi)
  **TIZIM** localStorage'da saqlashi SHART
  **VA** foydalanuvchini bloklaMASLIGI SHART
  **VA** keyingi muvaffaqiyatli so'rovda qayta yuborishi SHART

## Acceptance criteria

- [ ] `CURRICULUM.A1` va `CURRICULUM.A2` — har birida 12 unit, har unitda `id/title/can/grammar/words/tasks` to'liq
- [ ] Yangi foydalanuvchi onboardingdan keyin darhol A1-01 ning 1-vazifasini ko'radi
- [ ] Vazifa bajarilmaguncha "Keyingi vazifa" tugmasi bloklangan (disabled + tushuntirish)
- [ ] 4/5 to'g'ri → PASS, 3/5 → FAIL (klient hisoblaydi, AI so'ziga ishonmaydi)
- [ ] 3 marta FAIL dan keyin AI to'liq tushuntirish + yengillashtirilgan variant beradi
- [ ] Kuniga 3 vazifadan keyin bloklanadi, ertasi kuni ochiladi
- [ ] 6 vazifa + unit imtihoni o'tgach unit `passedUnits` ga qo'shiladi, keyingi unit ochiladi
- [ ] 12 unit tugagach daraja imtihoni majburiy bo'ladi, o'tgach `level` A2 ga o'tadi
- [ ] XP hech qanday holatda darajaga ta'sir qilmaydi (`currentLevel()` `program.level` qaytaradi)
- [ ] `buildSystem()` da joriy unit, unit so'zlari, oxirgi 30 vocabulary so'z, zaif joylar mavjud
- [ ] Brauzer localStorage tozalangandan keyin ilova serverdan progressni tiklaydi
- [ ] A1 darajadagi IELTS maqsadli foydalanuvchi IELTS rejimlariga kira olmaydi va sababini ko'radi
- [ ] 3 vazifadan keyin kalibratsiya ishlaydi va sababi tushuntiriladi (bir marta)
- [ ] Mavjud foydalanuvchi (eski `eb_user`) ilovani ochganda A1-01 ga tushadi va bir martalik tushuntirish xabarini ko'radi

## Test (MAJBURIY — foydalanuvchi ma'lumoti va backend'ga tegadi)

- **PASS chegarasi:** `4/5` → passed, `3/5` → failed, `5/5` → passed, `0/5` → failed
- **Marker yo'q:** AI javobida `📊 NATIJA:` bo'lmasa — status `submitted` da qoladi, `attempts` oshMAYDI, XP berilMAYDI
- **Soxta marker:** AI `📊 NATIJA: 5/5` yozsa-yu javob aslida xato bo'lsa — klient baribir markerga tayanadi (bu qabul qilingan cheklov, spec'da ochiq belgilangan)
- **Kunlik limit:** 3 vazifa bajarilgach 4-chisi berilmaydi; `doneToday.date` kechagi bo'lsa hisob 0 ga tushadi
- **Vaqt zonasi:** `todayStr()` UTC ishlatadi — Toshkent (UTC+5) uchun kun 05:00 da almashadi. Testda tekshirilsin, kerak bo'lsa mahalliy vaqtga o'tkazilsin
- **Progress sinxronizatsiya:** offline holatda vazifa bajarilsa localStorage'da saqlanadi; internet qaytgach serverga yoziladi va yo'qolmaydi
- **Ikki qurilma:** A qurilmada 3 vazifa bajarilsa, B qurilmada ilova ochilganda o'sha holat ko'rinadi
- **Progress endpoint xavfsizligi:** `progress` funksiyasi `userId` ni tekshiradi; boshqa foydalanuvchi `userId` sini yuborsa uning progressini o'qiy oladi — **bu ochiq zaiflik**, chunki hozirgi auth modeli anonim uuid. Qabul qilinadi (progressda maxfiy ma'lumot yo'q), lekin spec'da yozib qo'yilgan
- **API kalitlari:** `progress` funksiyasi hech qanday kalit qaytarMASLIGI, faqat `progress` obyektini qaytarishi tekshirilsin

## Ochiq savollar (implementatsiyadan oldin hal qilinsin)

1. **Migratsiya ziddiyati:** "hammasi noldan A1 unit 1" tanlandi, lekin onboardingda foydalanuvchi darajasini o'zi tanlaydi. Hozirgi qaror: **yangi** foydalanuvchi tanlagan darajasidan boshlaydi, **mavjud** foydalanuvchi A1-01 ga tushadi (kalibratsiya 3 kunda uni tuzatadi). Tasdiqlansin.
2. **UTC vs mahalliy vaqt:** `todayStr()` hozir UTC. Kunlik limit va streak uchun Toshkent vaqtiga (UTC+5) o'tkazilsinmi?
3. **CURRICULUM mazmuni:** 24 unitning mazmuni (grammatika ketma-ketligi + 24×25 = ~600 so'z) generator skript orqali AI bilan chiqarilsinmi, yoki qo'lda yozilsinmi?
