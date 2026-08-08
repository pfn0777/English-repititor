# Gapirish vazifasi va offline rejim

## Muammo

**1. Dasturda gapirish yo'q edi.** Mikrofon kodi allaqachon ishlaydi (`toggleRec`,
`sendAudio`, Gemini multimodal), lekin u faqat **qulflangan** chatda. A1 uchun eng kerakli
ko'nikma — og'zaki nutq — majburiy dastur yo'lida umuman uchramasdi.

**2. Internetsiz ilova butunlay o'ladi.** Service worker yo'q, Tailwind CDN'dan.
Holbuki mavzu darsi va lug'at takrorlash (SRS) **to'liq lokal** — ular internetsiz ham
ishlashi mumkin edi.

**3. Baho AI markerining aniq formatiga bog'liq.** `📊 NATIJA: N/M` da emoji tushib qolsa
yoki model `**qalin**` yozsa — "qayta yuboring" chiqadi va o'quvchi bir xil javobni
qaytadan yozadi.

## Yechim

### 1. `speak` vazifa turi

`TASK_TYPES.speak` + `TASK_GUIDE.speak` (`total: 5`, `audio: true`).
AI 5 ta qisqa (4–8 so'zli) o'zbekcha jumla beradi, o'quvchi ularni inglizchaga o'girib
**ovoz chiqarib aytadi**.

- `TASK_GUIDE[type].audio` bo'lsa `taskBox()` textarea o'rniga mikrofon tugmasini chizadi.
- Yozgich umumlashtirildi: `toggleRec(target)`, `target ∈ 'chat' | 'program'`.
  `REC_IDS` har target uchun element id'larini beradi; `onRecStop` blobni tegishli
  yo'lga jo'natadi (`sendAudio` yoki `doSubmitSpeak`).
- `submitTask(answer, audio)` — audio berilsa matn o'rniga ovoz yuboriladi.
- Curriculum: `A1-01` dan tashqari **barcha unitlarda** majburiy (`NO_SPEAK_YET`).
  Birinchi unitda hali so'zlar tanilmagan.

**Backend.** `chat/index.ts` ovozli xabarga system prompt oxiriga qo'shimcha yozadi.
Umumiy variant "avval transkripsiya qil" deydi — bu dastur uchun **yaramaydi**, chunki
`📊 NATIJA` birinchi qatorda turishi shart. Shuning uchun `mode.startsWith('program_')`
bo'lsa alohida qo'shimcha ishlatiladi: format o'zgarmaydi, transkripsiya markerdan
**keyin** yoziladi.

### 2. Hallucination himoyasi — majburiy

Sinov paytida nutqsiz tovush (sinus signal) yuborildi. Model **kutilgan javoblardan
mukammal transkripsiya to'qib chiqardi va 5/5 qo'ydi**. Ya'ni hech narsa aytmagan
o'quvchi ham o'tib ketardi.

Yechim:

- `speak` check prompti audioda tushunarli nutq bo'lmasa **aynan ikki qator** talab qiladi:
  `📊 NATIJA: 0/5` va `[AUDIO_YOQ] ...`. "Eshitmagan matningni o'ylab topma va vazifa
  matnidagi kutilgan javoblarni ko'chirma" — eng qattiq qoida sifatida yozilgan.
- Backend qo'shimchasida ham xuddi shu talab takrorlanadi.
- `isNoAudio(text)` shu belgini ushlaydi → `submitTask` `{ ok:false, reason:'no_audio' }`
  qaytaradi, `status` `'open'` ga qaytadi. **Urinish sanalmaydi** — buzilgan mikrofon
  bilim xatosi emas va o'quvchini skip tomon surmasligi kerak.

Qayta sinovda: jimlik → `0/5` + `[AUDIO_YOQ]`, `attempts` 0 da qoldi.

> Agar `speak` promptlariga tegilsa — **jimlik bilan qayta sinash shart**.

### 3. Offline qobiq

`sw.js` (`VERSION` bilan versiyalangan kesh) + `manifest.json`:

- **Hujjat** — network-first, keshga fallback. Aks holda deploy'dan keyin foydalanuvchi
  eski sahifada qolib ketardi.
- **Tailwind CDN** — cache-first, fonda yangilanadi. Aks holda offline ilova butunlay
  stilsiz ochilardi.
- **`*.supabase.co`** — hech qachon keshlanmaydi (AI, progress, admin).

`isOffline()` faqat `navigator.onLine === false` ga ishonadi (teskarisi internet borligini
isbotlamaydi). Offline holatda `renderProgram()` xato o'rniga ikki tugma beradi:
**📖 Mavzu darsi** va **📚 So'zlarni takrorlash** — ikkalasi ham lokal.
`online` hodisasida ekran o'zi qayta chiziladi.

### 4. `parseResult` tolerantligi

Regex endi emojisiz, `**qalin**`, kichik harf va ikki nuqtasiz variantlarni ham tushunadi.
**Promptdagi talab o'zgarmadi** — bu faqat kosmetik siljish uchun o'quvchini qayta
yozishga majburlamaydi. Parserga moslab promptni bo'shatish mumkin emas.

## Qamrov tashqarisi

- Talaffuz bo'yicha alohida ball yoki band berilmaydi — `speak` boshqa turlar kabi N/5.
  Aksent uchun ball kamaytirilmaydi, faqat **ma'no buzilgan** talaffuz xato sanaladi.
- Offline holatda AI vazifasi navbatga qo'yilmaydi (queue yo'q).
- Ilova offline-first emas: yangi vazifa baribir internet talab qiladi.

## Tekshiruv

`scripts/test-program.mjs` 19-bo'lim: `speak` turi mavjudligi, `audio` bayrog'i faqat
`speak` da, `A1-01` da yo'qligi, qolgan barcha unitlarda borligi, check promptida
`N/5` va `[AUDIO_YOQ]` talabi, `isNoAudio()`. 10-bo'limga `parseResult` ning 5 ta
format holati qo'shildi.

Brauzerda: A1-02 4-qadam → mikrofon chizildi (textarea yo'q); sintetik WAV bilan
uchdan-uchgacha quvur (marker birinchi qatorda, `no_audio` da urinish sanalmadi);
DevTools offline rejimida sahifa keshdan yuklandi, stillar joyida, dars va takrorlash
ishladi. Konsolda yangi xato yo'q.
