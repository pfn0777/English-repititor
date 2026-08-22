# Offline klient (2-bosqich)

> 1-bosqich — kontent quvuri — [offline-tasks.md](offline-tasks.md) da.
> Bu spec kontentni **ekranga chiqaradigan va lokal baholaydigan** qismni belgilaydi.
> O'yin rejimlari 3-bosqichda, APK 4-bosqichda.

## Muammo

`data/tasks-*.json` da tayyor kontent bor, lekin uni ko'rsatadigan hech narsa yo'q.
Hozirgi `index.html` har vazifani AI'dan so'raydi va AI'ga tekshirtiradi. Offline
rejimda ikkalasi ham lokal bo'lishi kerak.

## Asosiy topilma — mexanizm allaqachon lokal

`applyResult(score)` (`index.html` §4.5) **sof funksiya**: `{correct, total}` oladi,
`PASS_THRESHOLD` bilan solishtiradi, urinishlarni sanaydi, `relief`/`canSkip` ni
qo'yadi, `advance()` ni chaqiradi, XP va streak beradi. U AI haqida hech narsa
bilmaydi.

Ya'ni offline rejim **dastur mexanizmiga umuman tegmaydi**. O'zgaradigan joy — atigi
to'rtta funksiya (§7.5), ularning har birida `callAI` chaqiruvi lokal manba bilan
almashtiriladi:

| Funksiya | Onlayn | Offline |
|---|---|---|
| `startTask()` | AI vazifa matnini yozadi | `OFFLINE_TASKS` dan tayyor obyekt olinadi |
| `submitTask()` | AI baholaydi, `📊 NATIJA: N/M` qaytaradi | `gradeOffline()` lokal hisoblaydi |
| `retryTask()` | AI yengillashtirilgan variant yozadi | o'sha vazifa qayta ochiladi |
| `revealAndSkip()` | AI to'g'ri javoblarni tushuntiradi | to'g'ri javoblar data'dan ko'rsatiladi |

`getUnit()`, `getTaskType()`, `advance()`, `levelUp()`, `calibrate()`,
`updateStreakOnTask()`, `seedUnitWords()`, `needsLesson()` — **hech biriga tegilmaydi**.

## Bayroq va joylashuv

**Bitta kod bazasi, bayroq bilan** — `SUBSCRIPTION_ENABLED` naqshi (§1c) aynan
takrorlanadi:

```js
const OFFLINE_BUILD = false;   // APK bilkasida true
```

> **Diqqat — bu foydalanuvchining avvalgi javobiga zid.** Intervyuda "alohida
> repo/branch" tanlangan edi. Bayroq tavsiya qilinishining sababi: `CLAUDE.md`
> da yozilgan drift muammosi (klient va Edge Functions alohida deploy bo'lgani
> uchun "lokalda ishlaydi, prodda yo'q" holati bir necha marta bo'lgan) ikki repo
> bilan kuchayadi, va `test-program.mjs` ikkala holatni ham bitta yugurishda
> tekshira oladi. Bundan tashqari qaror **qaytariladigan**: bitta repodan ikkitasini
> ajratish oson, ikkitasini birlashtirish qiyin. Yakuniy qaror foydalanuvchiniki.

`OFFLINE_BUILD === true` bo'lganda:

- vazifa/tekshiruv AI'ga chiqmaydi;
- erkin rejimlar, AI Ustoz, Testlar, erkin chat menyudan **yo'qoladi** (ekran
  qulflangan holda ko'rsatilmaydi — bo'lmagan narsa taklif qilinmaydi);
- Telegram, obuna, `billing`, `progress` sync o'chadi;
- `sw.js` `data/tasks-*.json` ni ham keshlaydi.

`OFFLINE_BUILD === false` bo'lganda hozirgi xatti-harakat **bir zarra ham
o'zgarmaydi** — bu shart, `test-program.mjs` ning barcha mavjud bo'limlari
o'zgarishsiz o'tishi kerak.

## Data yuklash

`data/tasks-<lv>.json` — 6 fayl, jami ~600 KB. Hammasini boshlanishida yuklash
shart emas: faqat joriy daraja yuklanadi.

```js
async function loadOfflineLevel(lv) { /* fetch(`data/tasks-${lv.toLowerCase()}.json`) */ }
```

Natija `OFFLINE_TASKS[lv]` da keshlanadi. Daraja ko'tarilganda keyingisi yuklanadi.
Yuklash yiqilsa — `renderProgram()` "kontent yuklanmadi" ekranini ko'rsatadi va
dars/lug'at bo'limlarini taklif qiladi (hozirgi `isOffline()` yo'li kabi).

Vazifani topish pozitsiyadan: `OFFLINE_TASKS[lv].units[unitIndex].tasks[taskIndex]`;
`taskIndex >= TASKS_PER_UNIT` bo'lsa `.exam`; `levelExam.pending` bo'lsa
`OFFLINE_TASKS[lv].levelExam`.

**Sxema `id` bo'yicha tekshiriladi**, indeks bo'yicha emas: yuklangandan keyin
`units[i].id === CURRICULUM[lv][i].id` bo'lmasa, data eskirgan — xato ekrani
ko'rsatiladi. Jimgina noto'g'ri vazifa berishdan ko'ra ochiq xato yaxshi.

## Baholash — `gradeOffline(task, answer)`

Sof funksiya, `{ correct, total, detail[] }` qaytaradi. `total` har doim 5
(imtihonda 8, daraja imtihonida 10) — `applyResult` shu nisbatga qaraydi.

`detail[]` — har band uchun `{ ok, given, expected }`, natija ekranida ko'rsatiladi.

### Variantli turlar (`read`, `listen`, `exam`, `levelExam`)

`answer` — tanlangan indekslar massivi. `ok = (given === item.answer)`.
Javob berilmagan band — noto'g'ri.

### Plitkali turlar (`translate`, `build`, `dictate`)

`answer` — yig'ilgan satrlar massivi. Solishtirish **normallashtirilgan**:

```
norm(s) = s.toLowerCase()
           .replace(/[.,!?;:]/g, '')     // tinish belgisi hisobga olinmaydi
           .replace(/\s+/g, ' ')          // ortiqcha probel
           .trim()
```

`ok = norm(given) === norm(item.en) || item.alt.some(a => norm(given) === norm(a))`

Apostrof **saqlanadi** (`don't` ≠ `dont`) — bu haqiqiy imlo farqi.

### `order`

`answer` — jumlalarning foydalanuvchi qo'ygan tartibi (indekslar massivi).
Har **pozitsiya** alohida band: `ok = (answer[i] === i)`. 5 pozitsiya = 5 band.

Bu ataylab pozitsiya-ba-pozitsiya: butun tartib to'g'ri yoki xato deb baholansa,
bitta jumlani almashtirgan o'quvchi 0/5 oladi va `PASS_THRESHOLD` hech qachon
ishlamaydi.

## UI — `taskBox()` ning offline shoxlari

Har tur uchun alohida render. Umumiy talablar:

- **Zudlik bilan javob** — bu butun offline rejimning sababi. Javob berilgandan
  keyin natija **darhol** (AI kutish yo'q): to'g'ri band yashil, xato qizil,
  to'g'ri javob ko'rsatiladi.
- Klaviatura ochilmaydi — hamma kiritish bosish orqali (plitka, variant, tartib).
  Bu telefonda oqimni buzmaslik uchun.
- Har bosishda qisqa haptic/vizual javob (CSS transition, `navigator.vibrate` bor
  bo'lsa 10ms). Ovoz **ixtiyoriy** va o'chirib qo'yilishi mumkin bo'lsin.

| Tur | Render |
|---|---|
| `read` | Matn tepada, ostida 5 savol, har biri 4 tugma |
| `listen` | Matn **ko'rsatilmaydi**; 🔊 tugma TTS bilan o'qiydi (qayta eshitish mumkin), ostida 5 savol |
| `translate` | O'zbekcha jumla, ostida aralashtirilgan plitkalar, tanlangani yuqoridagi qatorga tushadi, bosib qaytariladi |
| `build` | Berilgan so'z + tarjimasi tepada, qolgani `translate` kabi |
| `dictate` | O'zbekcha yo'q; 🔊 tugma jumlani aytadi, plitkalar `translate` kabi. Javobdan keyin `uz` ko'rsatiladi |
| `order` | 5 jumla aralash, bosib tartib raqami beriladi yoki sudrab joylashtiriladi |

Plitkalar `shuffle(tiles + distractors)` bilan aralashtiriladi. **Aralashtirish
har ochilishda qayta bo'ladi** (deterministik emas) — o'quvchi tartibni yodlab
olmasin.

TTS: `speechSynthesis` bilan, `lang: 'en-US'`. Ovoz topilmasa `listen`/`dictate`
vazifalari **o'tkazib yuborilmaydi**, balki matn ko'rsatiladi va vazifa `read`
kabi ishlaydi — aks holda o'quvchi tiqilib qoladi.

## `retryTask` va chiqish yo'li

Offline rejimda AI yengillashtirilgan variant yoza olmaydi. Shuning uchun:

- `relief` (3 urinish) — vazifa o'zgarmaydi, lekin unit **darsi** (`unitLessonBox`)
  qayta ochiladi: qoida, misollar, mini-tekshiruv. Bu lokal va allaqachon mavjud.
- `canSkip` (5 urinish) — `revealAndSkip()` to'g'ri javoblarni data'dan ko'rsatadi
  (`item.en`, yoki variantli turda `options[answer]`), so'ng vazifa XP'siz
  o'tkaziladi va unit `weakUnits` ga yoziladi. Hozirgi mantiq o'zgarmaydi.

## Test talablari

`scripts/test-program.mjs` ga yangi bo'lim (29):

1. `gradeOffline` har olti tur uchun: to'liq to'g'ri → 5/5; bitta xato → 4/5;
   javobsiz → 0/5.
2. Normallashtirish: `"I am a student"` vs `"i am a student."` → to'g'ri;
   `"dont"` vs `"don't"` → **xato**.
3. `alt` massividagi variant qabul qilinadi.
4. `order`: bitta juftlik o'rin almashsa 3/5 (ikki pozitsiya xato).
5. `OFFLINE_BUILD = false` da mavjud 28 bo'lim **o'zgarishsiz** o'tadi.
6. Har daraja uchun `tasks-*.json` `CURRICULUM` bilan `id` bo'yicha mos —
   bu data va kod birga eskirmasligini qo'riqlaydi.

## Bu specga kirmaydi

- O'yin rejimlari (vaqtga qarshi, memory, anagram, quloq) — 3-bosqich;
- APK build va RuStore — 4-bosqich;
- Progressni qurilmalar orasida ko'chirish (offline bilkada `progress` sync yo'q).
