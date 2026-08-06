# Reja: CEFR dastur tizimi

Spec: [cefr-program.md](cefr-program.md)

## Ochiq savollar bo'yicha qabul qilingan qaror

Reja quyidagi tavsiyalar asosida tuzildi (boshqacha bo'lsa — aytilsin, reja yangilanadi):

1. **Migratsiya** — yangi foydalanuvchi tanlagan darajasidan, mavjud foydalanuvchi A1-01 dan boshlaydi
2. **Vaqt zonasi** — `todayStr()` Toshkent vaqtiga (UTC+5) o'tkaziladi. Bu hozirgi streak bug'ini ham tuzatadi
3. **CURRICULUM** — generator skript orqali chiqariladi, keyin qo'lda ko'rib chiqiladi

---

## O'zgaradigan / yangi fayllar

| # | Fayl | Nima qilinadi |
|---|---|---|
| 1 | `scripts/gen-curriculum.mjs` | **YANGI** — AI orqali 24 unit mazmunini `curriculum.json` ga chiqaradigan bir martalik skript |
| 2 | `data/curriculum.json` | **YANGI** — generator chiqishi, qo'lda tuzatiladi |
| 3 | Supabase migration | **YANGI** — `users` jadvaliga `progress jsonb` ustuni |
| 4 | `supabase/functions/progress/index.ts` | **YANGI** — progress get/save Edge Function |
| 5 | `index.html` §1 CONSTANTS | `CURRICULUM` konstantasi, `TASK_TYPES`, `PASS_THRESHOLD`, `MAX_DAILY_TASKS` |
| 6 | `index.html` §3 STORAGE | `syncProgress()`, `loadProgress()`, `todayStr()` → UTC+5 |
| 7 | `index.html` §4 GAMIFICATION | `currentLevel()` XP dan ajratiladi → `program.level` |
| 8 | `index.html` §4.5 PROGRAM | **YANGI bo'lim** — `issueTask`, `submitTask`, `advance`, `calibrate`, `checkLevelUp` |
| 9 | `index.html` §7 parserlar | `parseResult()` — `📊 NATIJA: N/M` |
| 10 | `index.html` §8 buildSystem | joriy unit + unit so'zlari + vocabulary + zaif joylar + vazifa konteksti |
| 11 | `index.html` §10 Dashboard | "Bugungi vazifa" kartasi, unit progress bar, IELTS gate |
| 12 | `index.html` renderTasks | `renderProgram()` bilan almashtiriladi |
| 13 | `index.html` §15 init | progress yuklash, migratsiya, kalibratsiya tekshiruvi |

---

## Qadamlar

### Bosqich 0 — Kontent (kod ishidan mustaqil, parallel ketadi)

**0.1** `scripts/gen-curriculum.mjs` yoziladi
- Kirish: daraja (`A1`/`A2`), unit soni (12)
- AI ga so'rov: CEFR A1 uchun grammatika ketma-ketligi + har unit uchun `title/can/grammar/words[25]/tasks[6]`
- Chiqish: `data/curriculum.json`
- Kalit `.env` dan yoki argument sifatida (repoga yozilmaydi)

**0.2** Generator ishga tushiriladi, `curriculum.json` chiqadi

**0.3** Natija qo'lda ko'rib chiqiladi (grammatika ketma-ketligi mantiqiymi, so'zlar takrorlanmaydimi, A1 uchun juda qiyin emasmi)

> ⚠️ Bu qadam sizning tasdig'ingizni talab qiladi. Kod qismi (1-5 bosqich) bu tugashini kutmasdan ketaveradi — vaqtinchalik 2 ta namuna unit bilan ishlaydi.

---

### Bosqich 1 — Backend

**1.1** Migration: `users` jadvaliga ustun
```sql
alter table public.users
  add column if not exists progress jsonb not null default '{}'::jsonb;
```

**1.2** `supabase/functions/progress/index.ts`
- `POST { userId, action: 'get' | 'save', progress? }`
- `get` → `select progress from users where id = userId` (yo'q bo'lsa `{}`)
- `save` → `upsert` (`updatedAt` ni server yozadi)
- CORS `chat` funksiyasidagidek
- Hech qanday kalit qaytarmaydi
- Deploy oldidan loyiha statusi tekshiriladi (`list_projects`), `INACTIVE` bo'lsa `restore_project`

**1.3** Qo'lda tekshiruv: curl bilan `get`/`save`, Network'da kalit yo'qligi

---

### Bosqich 2 — Data model va logika (kod, UI yo'q)

**2.1** `todayStr()` UTC+5 ga o'tkaziladi
```js
function todayStr(offset=0) {
  const t = Date.now() + offset*86400000 + 5*3600000;  // Toshkent
  return new Date(t).toISOString().split('T')[0];
}
```
Streak, visits, `doneToday` — hammasi shu funksiyaga tayanadi.

**2.2** `CURRICULUM` konstantasi qo'shiladi (namuna 2 unit, keyin generator chiqishi bilan almashtiriladi)

**2.3** §4.5 PROGRAM bo'limi — sof funksiyalar, UI'ga bog'liq emas:
- `initProgram()` — bo'sh `user.program` yaratadi
- `getUnit()` — joriy unit obyekti
- `getTaskType()` — joriy vazifa turi
- `canStartTask()` → `{ ok, reason }` (kunlik limit, `current.status`)
- `applyResult(score)` — PASS/FAIL, `attempts`, `taskIndex`, XP
- `advance()` — unit/daraja o'tishi
- `calibrate()` — 3 kunlik tuzatish

**2.4** `currentLevel()` → `user.program?.level || user.level`. `LEVEL_XP` faqat XP badge uchun qoladi.

**2.5** `syncProgress()` — debounce bilan serverga yozadi, xato bo'lsa jim o'tadi (localStorage baribir yozilgan)

**2.6** Sintaksis tekshiruvi: `<script>` bloki `new Function()` orqali Node'da

---

### Bosqich 3 — AI integratsiya

**3.1** `parseResult(text)` — `📊 NATIJA: (\d+)\/(\d+)` → `{correct, total}` yoki `null`

**3.2** `buildSystem()` kengaytiriladi:
- Joriy unit bloki (id, title, can, grammar, unit so'zlari)
- `user.vocabulary` oxirgi 30 so'z → "bularni bilib bo'ldi, qayta ishlat"
- Vazifa rejimi bo'lsa: vazifa turi bo'yicha aniq ko'rsatma + `attempts` + `relief` holati
- **Majburiy**: tekshiruv javobi oxirida `📊 NATIJA: N/M`

**3.3** Vazifa promptlari — 4 tur uchun `TASK_PROMPTS` obyekti (vazifa berish + tekshirish uchun alohida)

**3.4** Qo'lda tekshiruv: har 4 tur bo'yicha bittadan vazifa olib, javob berib, marker to'g'ri kelayotganini ko'rish

---

### Bosqich 4 — UI

**4.1** Dashboard: eng tepada "Bugungi vazifa" kartasi
- Unit nomi + progress (`A1-03 · 3/6`)
- Holatga qarab tugma: `Boshlash` / `Davom etish` / `Bugungi norma bajarildi ✅`
- `attempts > 0` bo'lsa: "2-urinish — ishorani o'qing"

**4.2** `renderProgram()` — vazifa ekrani
- Vazifa matni (AI dan)
- Javob maydoni (`listen` turida 🔊 tugma)
- Yuborish → tekshiruv → natija kartasi (PASS yashil / FAIL qizil)
- FAIL da: xatolar `❌✅💡🔁` formatida + "Qayta urinish" tugmasi

**4.3** Bottom nav: `Vazifalar` tab → `renderProgram()`

**4.4** Unit/daraja imtihoni ekrani (`renderProgram()` ning maxsus holati)

**4.5** Progress sahifasi: XP bar ostiga "Dastur" bloki — daraja, unit, tugallangan unitlar

**4.6** A2 tugagach: "B1 tayyorlanmoqda" ekrani

---

### Bosqich 5 — Migratsiya va IELTS gate

**5.1** `init()` da:
- Serverdan progress tortiladi
- `user.program` yo'q bo'lsa → `initProgram()`; mavjud foydalanuvchi (`eb_user` bor) → A1-01, bir martalik modal xabar
- Yangi foydalanuvchi → onboardingda tanlagan darajasidan

**5.2** IELTS gate: `level` A1/A2 va `goal === 'ielts'` → IELTS rejimlari yopiladi + tushuntirish

**5.3** Kalibratsiya `init()` da tekshiriladi, kerak bo'lsa modal bilan tushuntiriladi

---

### Bosqich 6 — Test (MAJBURIY, backend'ga tegadi)

Spec'dagi test bo'limi bo'yicha qo'lda:

- [ ] PASS chegarasi: 4/5 ✅, 3/5 ❌, 5/5 ✅, 0/5 ❌
- [ ] Marker yo'q → status `submitted`, `attempts` oshmaydi, XP yo'q
- [ ] Kunlik limit 3 ta, ertasi kuni tiklanadi (`doneToday.date`)
- [ ] Vaqt zonasi: 23:00 Toshkentda bajarilgan vazifa 00:30 da yangi kun deb hisoblanadi
- [ ] Offline → localStorage, internet qaytgach serverga yoziladi
- [ ] localStorage tozalash → server progressni tiklaydi
- [ ] Ikki qurilma sinxron
- [ ] Network'da kalit yo'q, `progress` javobida faqat progress obyekti
- [ ] Eski foydalanuvchi A1-01 ga tushadi va xabarni ko'radi
- [ ] A1 + goal=ielts → IELTS rejimlari yopiq

---

## Xavf

| Xavf | Joy | Nima qilinadi |
|---|---|---|
| **Kalit sizishi** | `progress` Edge Function | Faqat `progress` maydonini qaytaradi, `app_secrets` ga tegmaydi. Deploy'dan keyin Network'da tekshiriladi |
| **Boshqa userning progressi** | `progress` funksiyasi | Anonim uuid — `userId` ni bilgan odam o'qiy oladi. Qabul qilingan cheklov (maxfiy ma'lumot yo'q), spec'da yozilgan |
| **AI soxta PASS** | `parseResult` | Klient `correct/total` ni o'zi hisoblaydi, AI ning "PASS" so'ziga ishonmaydi. Lekin AI `5/5` deb noto'g'ri yozsa — o'tadi. Qabul qilingan |
| **Progress yo'qolishi** | `syncProgress` | localStorage har doim birinchi yoziladi, server ikkinchi. Server xatosi foydalanuvchini bloklamaydi |
| **Vaqt zonasi o'zgarishi** | `todayStr()` | Streak va visits shu funksiyaga tayanadi — o'zgarish eski `eb_visits` bilan bir kunlik farq berishi mumkin (bir martalik, zararsiz) |
| **Loyiha pauza** | Supabase | Deploy oldidan `list_projects` bilan status tekshiriladi |

---

## Tartib va bog'liqliklar

```
Bosqich 0 (kontent) ─────────────┐
                                 ├──► Bosqich 4 (UI) ──► Bosqich 5 ──► Bosqich 6
Bosqich 1 (backend) ─┐           │
                     ├─► Bosqich 3 (AI) ─┘
Bosqich 2 (model) ───┘
```

Bosqich 0 va 1 parallel boshlanadi. Bosqich 2 hech narsaga bog'liq emas — darhol boshlanishi mumkin.
