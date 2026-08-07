# Yo'l xaritasi va qadamma-qadam yo'naltirish

## Muammo

Dastur mexanizmi (`CURRICULUM` → unit → `taskIndex` → unit imtihoni → daraja imtihoni)
allaqachon majburiy ketma-ketlikni ta'minlaydi, lekin u **foydalanuvchiga ko'rinmaydi**.
Birinchi vazifani bajargan foydalanuvchi "endi nima qilaman?" degan holatda qoladi:
natija ekranida faqat "Boshlash →" tugmasi turadi, kontekst yo'q.

## Yechim

Uchta ko'rinish qatlami. **Qulf mantig'i (`freeModeGate`, `canStartTask`, kunlik kvota,
urinishlar) o'zgarmaydi** — faqat ustiga yo'naltirish qo'shiladi.

### 1. `getRoadmap()` — yagona ma'lumot manbai

Sof funksiya, `index.html` 4.5-bo'limida (dastur mexanizmi). UI'ga bog'liq emas.

Qaytaradi: `{ phase, steps, curIdx, prev, current, next, level, unitTitle, unitNo,
unitsTotal, unitsDone, nextUnitTitle }`

- `steps` — `TASKS_PER_UNIT` ta vazifa + unit imtihoni = 7 qadam.
  Har biri `{ i, type, emoji, title, state }`, `state ∈ done | current | locked`.
- `phase ∈ unit | unit_exam | level_exam | remedial` — daraja imtihoni fazasida
  unit qadamlari `done` bo'ladi, `curIdx = -1`, `current`/`next` alohida hisoblanadi.
- `null` qaytadi: dastur yo'q yoki daraja syllabusi hali yozilmagan
  (`getUnit()` null). Chaqiruvchi UI bo'sh string chiqaradi — crash yo'q.

### 2. `roadmapStrip(rm)` — qadamlar chizig'i

`programHeader()` ichida, progress bardan keyin. `✓ ✓ ③ ④ ⑤ ⑥ 🏁` ko'rinishida:
bajarilgan yashil, joriy indigo va halqali, qolgani kulrang. Ostida izoh:
`3-qadam: Tinglash`.

### 3. `nextStepCard(rm)` — "bundan keyin bu" bloki

Vazifa boshlash ekranida, kartadan yuqorida:

```
Bajarilgan   Gap tuzish ✓
Hozir        Tinglash ←
Keyin        Tarjima 🔒
```

Vazifa muvaffaqiyatli tugagach `renderProgram()` shu shoxga qaytadi va
`programFeedback` mavjudligiga qarab tugma matni **"Keyingi vazifa →"** bo'ladi
(aks holda "Boshlash →").

### 4. `renderPathIntro()` — birinchi kirish ekrani

Onboarding tugagach bir marta ko'rsatiladi (`renderOnboarding` → `renderPathIntro`
→ `renderProgram`). `A1 → … → C2` zanjiri, 3 ta qoida (mavzu = N vazifa, mavzu
imtihoni, daraja imtihoni) va uchta eslatma: tartib majburiy, kuniga N vazifa,
kalibratsiya.

Bayroq: `user.introSeen`.
- Yangi foydalanuvchi: onboardingda `false` yoziladi, tugma bosilganda `true`.
- Ekranni ko'rmasdan chiqib ketsa: `init()` da `user.introSeen === false` bo'lsa
  qayta ko'rsatiladi.
- **Eski foydalanuvchida maydon umuman yo'q (`undefined`)** — qat'iy `=== false`
  tekshiruvi ularni bu shoxga tushirmaydi.

## Qamrov tashqarisi

- Duolingo uslubidagi doimiy yo'l-ekran bosh sahifa qilinmadi.
- Erkin rejimlar qulfi qattiqlashtirilmadi (`DAILY_QUOTA = 1` o'zgarishsiz).
- Avtomatik keyingi vazifaga o'tish (auto-advance) qilinmadi — tugma bosiladi.
- `CURRICULUM` mazmuniga tegilmadi.

## Tekshiruv

`getRoadmap()` sof funksiya — `scripts/`dan tashqarida, 9 ta holat qo'lda tekshirildi:
boshlang'ich holat, unit o'rtasi, unit imtihoni, oxirgi unit, daraja imtihoni,
takror vazifalar, C2 chegarasi, dastursiz/syllabussiz null, barcha unitlarda
`tasks.length === TASKS_PER_UNIT`.

Brauzerda tekshirilgan: kirish ekrani, xarita chizig'i (3/6 holat), to'rt fazada
`nextStepCard` matni, pass'dan keyin tugma matni. Konsolda yangi xato yo'q.
