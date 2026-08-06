# Spec: Erkin mashqlar qulfi (Bugungi vazifa bajarilmaguncha yopiq)

## Maqsad

Dashboarddagi **"Mashq turini tanlang"** bloki (6 ta karta) va AI Ustoz chatini
**bugungi dastur normasi bajarilmaguncha** yopish. Foydalanuvchi ertalab ilovani
ochganda faqat bitta yo'l ko'rsin: `Vazifalar` → bugungi vazifani bajar. Norma
yopilgandan keyin 6 ta erkin rejim ochiladi va kunning qolgan qismida cheklovsiz
ishlaydi.

## Nega kerak

`docs/specs/cefr-program.md` dasturli repetitor tizimini qo'shdi, lekin erkin
rejimlar undan mustaqil qoldi. Hozir foydalanuvchi dasturga umuman kirmasdan
"Suhbat amaliyoti" yoki "Hikoya o'qi" bilan cheksiz o'ynashi mumkin —
dastur ixtiyoriy bo'lib qoldi, ya'ni "qattiq qo'l repetitor" g'oyasi ishlamayapti.
Erkin rejim jazo emas, **mukofot** bo'lishi kerak.

## Nomuvofiqlik ogohlantirishi (o'qing, keyin qaror qiling)

`MAX_DAILY_TASKS = 3` hozir **yuqori chegara** — `canStartTask()` 3 tadan keyin
`daily_limit` qaytaradi va yangi vazifa bermaydi. Ya'ni "normani bajarish" =
"kunlik limitni tugatish". Ikkalasi bir xil raqamga bog'langani uchun qulf
"3 vazifa qil → qolgan kun erkin" degan ma'noni beradi. Bu maqsadga mos, lekin
ikkita alohida konstanta bo'lgani to'g'riroq:

- `MAX_DAILY_TASKS = 3` — kuniga beriladigan maksimal vazifa (o'zgarmaydi)
- `DAILY_QUOTA = 3` — erkin rejimlarni ochish uchun kerakli vazifa soni

Hozircha `DAILY_QUOTA = MAX_DAILY_TASKS`, lekin keyinchalik "1 ta bajarsang
ochiladi" qilish kerak bo'lsa, `canStartTask()` ga tegmasdan o'zgartiriladi.

## Qamrov ICHIDA

### 1. Yagona gate funksiyasi

`canStartTask()` yonida, State bo'limida — sof funksiya, UI'ga bog'liq emas:

```js
const DAILY_QUOTA = MAX_DAILY_TASKS;   // erkin rejim ochilishi uchun kerak

// Erkin rejimlar (6 ta karta + AI Ustoz + Testlar) ochiqmi?
function freeModeGate() {
  const p = user.program;
  if (!p) return { ok:true, reason:'no_program' };        // dastursiz eski user — qulflamaymiz
  rollDaily();
  if (!getTaskType()) return { ok:true, reason:'level_not_ready' };  // dastur tayyor emas — qulf mantiqsiz
  if (p.doneToday.count >= DAILY_QUOTA) return { ok:true, reason:'quota_done' };
  return { ok:false, reason:'quota_pending', done:p.doneToday.count, need:DAILY_QUOTA };
}
```

**Muhim escape hatch'lar** (bularsiz foydalanuvchi hech nima qila olmaydigan
holatga tushadi):

| Holat | Natija | Sabab |
|---|---|---|
| `user.program` yo'q (eski user) | **Ochiq** | Dastursiz odam qulfda o'tirmasin |
| `getTaskType()` → `null` (masalan C1 dasturi hali yozilmagan) | **Ochiq** | Vazifa yo'q → normani hech qachon bajara olmaydi → abadiy qulf |
| `p.current` ochiq yoki `failed` | **Yopiq** | Aynan shu holatda foydalanuvchi vazifaga qaytishi kerak |
| `doneToday.count >= 3` | **Ochiq** | Norma bajarildi |

`rollDaily()` chaqirilishi majburiy — aks holda kechagi `count:3` bugun ham
qulfni ochib turadi.

### 2. Dashboard: 6 ta karta qulflangan ko'rinishi

`renderDashboard()` ichida. Kartalar o'chirilmaydi, **qulflangan holatda
ko'rsatiladi** — foydalanuvchi nima yutayotganini ko'rsin (motivatsiya):

- Bo'lim sarlavhasi: `Mashq turini tanlang` → qulf paytida
  `Mashq turini tanlang 🔒` + ostida kichik matn:
  `Bugungi {done}/{need} vazifa bajarilgach ochiladi`
- Har bir karta: `opacity-50`, `cursor-not-allowed`, o'ng yuqori burchakda `🔒`
- `Tavsiya` badge'i qulf paytida ko'rsatilmaydi (chalg'itadi)
- Kartaga bosilganda: `renderChat()` emas, balki qisqa toast
  `Avval bugungi vazifani bajaring` + `renderProgram()` ga o'tkazish
- `data-mode` handler'i gate'ni **o'zi** tekshiradi (faqat CSS'ga tayanmaydi)

Qulf ochiq bo'lsa — hozirgi ko'rinish aynan saqlanadi, hech narsa o'zgarmaydi.

### 3. Bottom nav: `AI Ustoz` va `Testlar`

`navTo()` erkin rejimga olib boradigan ikkita tab bor: `ai` → `conversation`,
`tests` → `quiz`. Ular qulflanmasa, kartalar qulfi ma'nosiz (bir bosishda
aylanib o'tiladi).

```js
if (tab === 'ai' || tab === 'tests') {
  const g = freeModeGate();
  if (!g.ok) { toast('Avval bugungi vazifani bajaring'); return renderProgram(); }
  ...
}
```

`home`, `tasks`, `progress` hech qachon qulflanmaydi.

Nav ikonkalari qulf paytida `opacity-60` + kichik `🔒` bilan belgilanadi —
bosilganda nima bo'lishini oldindan aytadi.

### 4. AI javob darajasidagi himoya (asosiy talab)

Foydalanuvchi baribir chatga tushsa (eski URL, ochiq qolgan ekran, DevTools),
**AI so'rovi yuborilmasin**. Bu `callAI()` ichidagi eng birinchi tekshiruv —
tarmoqqa chiqishdan oldin:

```js
async function callAI(userMsg, opts = {}) {
  if (!opts.program) {                       // dastur so'rovlari hech qachon qulflanmaydi
    const g = freeModeGate();
    if (!g.ok) return LOCKED_REPLY(g);
  }
  ...
}
```

`LOCKED_REPLY` — AI'dan kelgan javob emas, lokal matn (token sarflanmaydi,
Edge Function chaqirilmaydi):

```
🔒 Avval bugungi vazifani bajaraylik.

Bugun {done}/{need} vazifa bajarildi. Qolgan {n} tasini yopsangiz —
suhbat, hikoya, grammatika va boshqa mashqlar ochiladi.

👉 Pastdagi ✍️ Vazifalar bo'limiga o'ting.
```

Chat oynasida bu xabar oddiy AI xabari sifatida ko'rinadi, ostida
`✍️ Vazifaga o'tish` tugmasi bilan (`renderProgram()`).

Muhim: `opts.program === true` bo'lgan barcha chaqiruvlar (vazifa berish,
tekshirish, unit/daraja imtihoni) **hech qachon** qulflanmaydi — aks holda
dastur o'zini-o'zi bloklaydi (deadlock).

### 5. `renderChat()` kirish nazorati

Chat ekrani ochilishida ham gate tekshiriladi: qulf bo'lsa chat umuman
render qilinmaydi, `renderProgram()` ga qaytariladi. `callAI` himoyasi ikkinchi
qatlam bo'lib qoladi (defense in depth), asosiysi — ekranga kirib bo'lmasligi.

### 6. Norma bajarilgandagi mukofot signali

`applyResult()` da `doneToday.count` `DAILY_QUOTA` ga yetgan paytda —
dastur ekranida bir martalik modal:

```
🎉 Bugungi norma bajarildi!

Barcha erkin mashqlar ochildi: suhbat, hikoya, grammatika, viktorina.
Endi xohlagancha mashq qiling.

[ Mashqlarni ko'rish ]  → renderDashboard()
```

Bu qulfning "jazo" emas, "ochilish" ekanini his qildiradi. Modal faqat
o'tish momentida (count `need-1` → `need`) ko'rsatiladi, keyingi renderlarda emas.

## Qamrov TASHQARISIDA

- **Server tomonda majburlash yo'q.** Qulf faqat klientda. DevTools bilan
  `user.program.doneToday.count = 3` yozib chetlab o'tish mumkin. Bu qabul
  qilinadi: bu o'quv ilovasi, foydalanuvchi o'zini aldasa — o'zi yutqazadi.
  Edge Function'da `program`/`free` rejimlarni ajratish keyingi bosqich.
- IELTS rejimlari uchun alohida qoida yo'q — `ieltsActive()` bo'lsa ham
  aynan shu qulf ishlaydi.
- Kunlik norma miqdorini foydalanuvchi o'zi tanlashi (1/3/5) — kelajakda.
- `Vazifalar` va `Progress` ekranlariga hech qanday qulf qo'yilmaydi.

## O'zgaradigan joylar

| Fayl | Joy | O'zgarish |
|---|---|---|
| `index.html` | Constants (~61) | `DAILY_QUOTA` qo'shiladi |
| `index.html` | State/program (~432) | `freeModeGate()` qo'shiladi |
| `index.html` | `callAI()` (~638) | Gate tekshiruvi + `LOCKED_REPLY` |
| `index.html` | `navTo()` (~1249) | `ai`/`tests` tablari gate ortida |
| `index.html` | `renderBottomNav()` (~1219) | Qulflangan tab ko'rinishi |
| `index.html` | `renderDashboard()` (~1549) | Kartalar qulfi + handler tekshiruvi |
| `index.html` | `renderChat()` (~1808) | Kirish nazorati |
| `index.html` | `applyResult()` (~461) | Norma yopilishida signal (modal flag) |

Backend, `admin.html`, Supabase sxemasi — **o'zgarmaydi**.

## Qabul mezonlari (qo'lda tekshiriladi)

1. Yangi user, dastur bor, `doneToday.count = 0` → 6 ta karta qulflangan,
   `AI Ustoz` va `Testlar` tablari bosilganda `Vazifalar` ekraniga o'tkazadi.
2. 1 va 2 vazifa bajarilgach → hali qulf, `1/3`, `2/3` ko'rsatiladi.
3. 3-vazifa o'tgach → mukofot modali chiqadi, barcha kartalar ochiladi,
   AI Ustoz normal ishlaydi.
4. Ertasi kun ochilganda (`todayStr()` o'zgargan) → yana qulflangan holat,
   `0/3` (kechagi `count` hisobga olinmaydi).
5. Chat qulf paytida ochilsa (masalan `renderChat()` to'g'ridan-to'g'ri
   chaqirilsa) → AI so'rovi **yuborilmaydi**, Network'da `chat` funksiyasiga
   so'rov yo'q, lokal `🔒` xabar chiqadi.
6. Dastur vazifasi (`opts.program`) qulf paytida ham normal ishlaydi —
   vazifa beriladi va tekshiriladi.
7. `user.program` yo'q qilib qo'yilsa (eski user simulyatsiyasi) → hech narsa
   qulflanmaydi, ilova avvalgidek ishlaydi.
8. `CURRICULUM` da joriy daraja bo'lmasa (`getTaskType()` → `null`) → qulf
   yo'q, "dastur tayyorlanmoqda" holatida erkin mashqlar ishlaydi.
