# O'yin rejimlari (3-bosqich)

> 2-bosqich — offline klient — [offline-client.md](offline-client.md) da.
> Bu spec `OFFLINE_BUILD` bilkasidagi o'yin rejimlarini belgilaydi.

## Nima uchun

Offline bilkada AI ekranlari (6 erkin rejim, AI Ustoz, Testlar, erkin chat)
yo'qoladi. O'rniga bo'sh joy qolmasligi kerak — va bu bo'shliq shunchaki
to'ldirilmaydi, balki ilovaning eng kuchli tomoniga aylanadi: **zudlik bilan
javob**. Har to'g'ri javobga 200ms ichida javob — Duolingo hissi shundan tug'iladi,
va AI arxitekturasida (7-8 soniya) bu umuman mumkin emas edi.

**Qo'shimcha kontent kerak emas.** O'yinlar `user.vocabulary` va
`CURRICULUM` dagi 1 800 so'zdan (`{en, uz, ipa}`) lokal quriladi.

## Umumiy qoidalar

- O'yin **dastur mexanizmiga tegmaydi**: `advance()`, `applyResult()`,
  `program.doneToday` — hech biri o'zgarmaydi. O'yin vazifa emas, streak bermaydi.
- **XP beradi, lekin kam** — vazifadan arzonroq bo'lishi shart, aks holda
  o'quvchi dasturni tashlab o'yin o'ynaydi. Bitta o'yin sessiyasi eng ko'pi bilan
  bitta vazifa XP'sining yarmini bersin.
- **So'z hovuzi**: birinchi navbatda `user.vocabulary` (o'rgangan so'zlari), u
  20 tadan kam bo'lsa joriy va oldingi unitlarning so'zlari qo'shiladi.
  Hech qachon o'quvchi ko'rmagan darajadan so'z olinmaydi.
- Har o'yin **offline**, TTS'siz ham ishlashi kerak (quloq o'yinidan tashqari —
  u TTS bo'lmasa menyuda ko'rsatilmaydi).
- Sof mantiq (`buildRound`, `scoreRound`) UI'dan ajratilsin — `test-offline.mjs`
  ularni to'g'ridan-to'g'ri sinaydi.

## To'rt o'yin

### 1. `speed` — vaqtga qarshi (60 soniya)

So'z chiqadi, 4 ta variantdan to'g'ri tarjimasi tanlanadi. To'g'ri javob → keyingi
so'z darhol. Xato → 2 soniya jarima ko'rsatiladi va keyingisi.

- Chalg'ituvchilar **o'sha hovuzdan** olinadi (tasodifiy lug'atdan emas) — shunda
  o'yin haqiqiy farqlashni sinaydi.
- Kombo: ketma-ket 5 to'g'ri javobdan keyin ball ko'paytmasi ×2 (10 tadan keyin ×3).
  Xato kombo'ni nolga tushiradi.
- Yakunda: nechta to'g'ri, eng uzun kombo, rekord (`eb_games` da saqlanadi).

### 2. `memory` — xotira jufti

12 ta karta (6 juft): bir tomonda inglizcha so'z, ikkinchisida o'zbekchasi.
Ikkitasini ochib juftini topadi. Vaqt cheklovi yo'q — bu **sokin** o'yin,
`speed` ning aksi.

- Urinishlar soni sanaladi; 6 juft uchun ideal 6 urinish.
- Ochilgan juft ekranda qoladi va so'z `🔊` bilan aytiladi (TTS bo'lsa).

### 3. `anagram` — so'z terish

Harflari aralashtirilgan inglizcha so'z + o'zbekcha tarjimasi ko'rsatiladi.
O'quvchi harflarni bosib so'zni yig'adi.

- **Bu ko'nikma ilovada umuman yo'q edi** — imlo. Plitkali vazifalar butun
  so'zni beradi, bu esa harf darajasida ishlaydi.
- 3 harfdan qisqa so'z olinmaydi; 10 harfdan uzun ham (ekranga sig'masin).
- Yordam: 10 soniyadan keyin birinchi harf ochiladi (ball kamayadi).

### 4. `listen_game` — quloq o'yini

TTS so'zni aytadi, 4 ta **inglizcha** variantdan tanlanadi (tarjima emas —
bu talaffuzni tanish o'yini).

- Chalg'ituvchilar **tovush jihatdan yaqin** bo'lsin: bir xil harf bilan
  boshlanadigan yoki bir xil uzunlikdagi so'zlar. Tasodifiy so'z bu o'yinni
  ma'nosiz qiladi.
- `speechSynthesis` yo'q bo'lsa o'yin menyuda **ko'rsatilmaydi** — matnli
  zaxira variant bu o'yinning butun ma'nosini yo'q qiladi.

## Saqlash

`eb_games` (localStorage, `LS` helperi orqali):

```js
{ speed: { best: 0, plays: 0 }, memory: { best: null, plays: 0 },
  anagram: { best: 0, plays: 0 }, listen_game: { best: 0, plays: 0 } }
```

`best` — `speed`/`anagram`/`listen_game` da ball, `memory` da **eng kam urinish**.
Yo'q bo'lsa `init()` da standart qiymat beriladi (eski foydalanuvchi buzilmasin —
`user.ielts`/`user.program` bilan bir xil naqsh).

## UI

Yangi ekran: `renderGames()`, pastki navigatsiyada `OFFLINE_BUILD` da ko'rinadi
(onlayn bilkada **yo'q**). To'rt karta: nomi, qisqa izoh, rekord.

Har o'yin ichida: chiqish tugmasi (progress yo'qoladi, ogohlantirishsiz — o'yin
sessiyasi qimmatli data emas), yakunda natija + "Yana" tugmasi.

Vizual javob har bosishda: to'g'ri — yashil + qisqa masshtab animatsiyasi,
xato — qizil + silkinish. `navigator.vibrate(10)` bor bo'lsa.

## Test talablari

`scripts/test-offline.mjs` ga yangi bo'lim:

1. `buildRound` har o'yin uchun: to'g'ri javob hovuzda bor, chalg'ituvchilar
   takrorlanmaydi va to'g'ri javobga teng emas.
2. So'z hovuzi: `user.vocabulary` bo'sh bo'lsa ham o'yin quriladi (unit
   so'zlaridan); o'quvchi ko'rmagan darajadan so'z **olinmaydi**.
3. `anagram`: aralashtirilgan harflar asl so'zning ko'p to'plamiga teng;
   3 harfdan qisqa va 10 harfdan uzun so'z tanlanmaydi.
4. `speed` kombo: 5 to'g'ridan keyin ×2, xato kombo'ni nolga tushiradi.
5. `memory`: 12 karta, 6 juft, har juft bir marta.
6. Rekord saqlanadi va `memory` da **kichikroq** natija yaxshiroq deb yoziladi.
7. `OFFLINE_BUILD = false` da o'yin ekrani navigatsiyada yo'q va
   `test-program.mjs` ning 28 bo'limi o'zgarishsiz o'tadi.
