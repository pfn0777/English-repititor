// Offline (internetsiz) mashq kontentini AI bilan BIR MARTA generatsiya qiladi va
// data/tasks-<level>.json ga yozadi. Shartnoma: docs/specs/offline-tasks.md.
// data/curriculum-*.json ga TEGMAYDI — u build-lessons/build-curriculum ning hududi.
//
// Ishlatish:
//   node scripts/build-tasks.mjs                 # yo'q bo'lgan hamma narsa
//   node scripts/build-tasks.mjs A1              # faqat bitta daraja
//   node scripts/build-tasks.mjs A1 --force      # mavjudini ham qayta yozadi
//   node scripts/build-tasks.mjs A1 --uid=<uuid> # alohida limit hisobi
//   node scripts/build-tasks.mjs A1 --dry-run    # chaqiruvsiz: reja va chaqiruv soni
//
// Jonli API'ga chiqadi va token sarflaydi (VAZIFA boshiga 1 chaqiruv — unit boshiga
// emas: MAX_OUTPUT_TOKENS = 4000 va Gemini'da thinking tokenlari ham shu byudjetdan
// yeyiladi, bitta unitning 6 vazifasi bitta javobga sig'may jimgina kesiladi).
// Generatsiyadan keyin SHART:
//   node scripts/validate-tasks.mjs   → shakl (tekin)
//   node scripts/check-tasks.mjs      → mazmun (token sarflaydi)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3dhdnFieGpmbGd0eGVwZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjAxMzEsImV4cCI6MjA5ODEzNjEzMX0.8RA7w_L6C3fy_ytaJl6ipETz2WZuamFhSGcIQGMOXXo';
let UID = '00000000-0000-4000-8000-000000000abc';   // --uid= bilan almashtiriladi

const ITEMS_PER_TASK = 5;     // barcha turlarda 5 band — PASS_THRESHOLD = 0.8 (4/5) shunga tayanadi
const EXAM_ITEMS = 8;
const LEVEL_EXAM_ITEMS = 10;

// Onlayn tur → offline tur. Shablon TAXMIN QILINMAYDI: har unitning haqiqiy
// `tasks` massivi o'qiladi (A1-01/02/03 da write/speak istisnolari bor).
const OFFLINE_TYPE = { speak: 'dictate', write: 'order' };
const toOffline = t => OFFLINE_TYPE[t] || t;

// `read` matni uzunligi darajaga bog'liq; `listen` esa har doim 60-100 so'z
// (quloq bilan qabul qilish qiyinroq).
const READ_WORDS = { A1: '60-90', A2: '60-90', B1: '100-140', B2: '100-140', C1: '150-200', C2: '150-200' };

// ─── PROMPT BLOKLARI ──────────────────────────────────────────────

const HEAD = `Sen o'zbek o'quvchilarga ingliz tili o'rgatuvchi tajribali repetitorsan.
Vazifang — OFFLINE (internetsiz, AIsiz tekshiriladigan) mashq kontentini tuzish.
Kontent bir marta yoziladi va abadiy shu holida ishlatiladi — keyin tuzatilmaydi.`;

const COMMON = `UMUMIY QOIDALAR:
- Ingliz tilidagi har bir jumla grammatik jihatdan benuqson bo'lsin.
- Har bir jumla HAYOTIY bo'lsin. Grammatikasi to'g'ri, lekin odam aytmaydigan gap
  ("I live in an office") — xato hisoblanadi.
- Butun o'zbekcha matn LOTIN yozuvida. Kirill harfi (а, е, о, с) mutlaqo mumkin emas.
  Apostrofli harflarni to'g'ri yoz: o', g' (masalan "o'qituvchi", "g'alaba").
- Unit lug'ati ETALON. So'z tarjimasi kerak bo'lganda tarjimani O'ZING O'YLAB TOPMA —
  yuqoridagi "Unit lug'ati" ro'yxatidagi o'zbekcha tarjimani AYNAN ko'chir.
- HAR BIR band o'rgatilayotgan GRAMMATIK SHAKLNI ko'rsatishi SHART — unit so'zini
  ishlatish yetarli emas. Kauzativ mavzusida "She wants to renovate her apartment"
  YARAMAYDI (bu kauzativ emas); "She wants to have her apartment renovated" — mana bu.
  Majhul nisbat mavzusida aktiv nisbatdagi band bo'lmasin.
- UZ va EN AYNAN bir xil ma'noni bersin: SHAXS (men/u/biz), SON (birlik/ko'plik) va
  ZAMON uchtasi ham mos kelsin. Amalda topilgan xatolar: "Bu shahar katta" →
  "These cities are big" (birlik → ko'plik), "She is drinking tea" → "U hozir choy
  ichyapman" (3-shaxs → 1-shaxs). Har juftlikni yozgach shu uch nuqtani solishtir.
- Til, millat, mamlakat va shahar nomlari ingliz tilida DOIM bosh harf bilan:
  English, Uzbek, Bukhara. "english" — xato.
- Artikl: unli TOVUSH bilan boshlanadigan so'z oldidan "an" (an apple, an hour),
  undosh bilan boshlanadiganda "a" (a new apple — "new" undosh bilan boshlanadi).`;

const MCQ_RULES = `VARIANTLAR (options) QOIDASI:
- Aynan 4 ta variant. Hammasi bir-biridan farq qilsin.
- FAQAT BITTA variant to'g'ri bo'lishi SHART. Ikkita to'g'ri variant — eng ko'p
  uchraydigan generatsiya xatosi; har savolni yozgach qolgan 3 tasi nega noto'g'ri
  ekanini alohida tekshir.
- Noto'g'ri variantlar TIPIK XATO bo'lsin ("I is", "He have", "a" o'rniga "the"),
  tasodifiy so'z emas.
- "answer" — to'g'ri variant indeksi, 0 dan 3 gacha. INDEKSNI ALMASHTIRIB TUR:
  model odatda hamma javobni 0-indeksga qo'yadi, bu yaramaydi. Bandlar orasida
  kamida 3 xil indeks ishlatilsin va 0 dan boshqasi ham ko'p bo'lsin.`;

const TILE_RULES = `PLITKALAR (tiles / distractors) QOIDASI:
- "tiles" — aynan "en" ning so'zlari, o'sha ko'p to'plam, o'sha yozilishi
  (bosh harf ham). Tinish belgisi plitkaga QO'SHILMAYDI: nuqta, vergul, so'roq
  belgisi tashqarida qoladi, klient uni o'zi qo'yadi. Qisqartma ("I'm", "don't")
  bitta plitka bo'ladi.
- "distractors" — 2 yoki 3 ta ortiqcha plitka (4 ta emas). "tiles" da bo'lmasin, lekin
  ISHONARLI bo'lsin: shu unitning tipik grammatik xatosini ifodalasin
  ("is" o'rniga "are", "a" o'rniga "the"). Ular bilan boshqa TO'G'RI gap tuzib
  bo'lmasligi shart.
- tiles va distractors soni JAMI 12 tadan oshmasin — plitkalar telefon ekraniga sig'sin.
  ARIFMETIKA: gap eng ko'pi 8 so'z + eng ko'pi 3 chalg'ituvchi = 11. Shuning uchun
  gapni 8 so'zdan uzun yozma. Uzun so'zli darajada (C1/C2) ham SO'Z SONI muhim,
  so'zning uzunligi emas — 8 ta uzun so'z ham 8 ta plitka.
- "alt" — massiv. Qabul qilinadigan boshqa to'g'ri variant bo'lsa yoz, bo'lmasa [].

YOZIB BO'LGACH HAR BANDNI SHU IKKI SAVOL BILAN TEKSHIR — ikkalasi ham amalda
eng ko'p takrorlangan xato:
1. "en" dagi so'zlarni birma-bir sanab chiq. Bitta so'z IKKI MARTA kelsa,
   "tiles" da ham IKKITA plitka bo'lishi shart ("The cat and the dog" →
   tiles: The, cat, and, the, dog — beshta, to'rtta emas).
2. "distractors" ro'yxatidagi har bir so'zni "tiles" ro'yxati bilan solishtir.
   Bitta so'z ikkala ro'yxatda ham bo'lsa — distraktorni BOSHQASIGA almashtir.
   Chalg'ituvchi allaqachon javobda bor so'z bo'lsa, u chalg'itmaydi.`;

// Har tur uchun: talab qilinadigan JSON shakli + turga xos qoidalar.
// Mazmuni index.html dagi TASK_GUIDE promptlaridan olingan, offline shaklga o'girilgan.
function guide(type, lv) {
  switch (type) {
    case 'read': return {
      shape: `{ "text": "...", "items": [ { "q": "...", "options": ["...","...","...","..."], "answer": 0 } ] }`,
      rules: `TUR: read — o'quvchi matnni KO'RADI va o'qiydi.
- "text": inglizcha matn, ${READ_WORDS[lv] || '100-140'} so'z. Unit mavzusiga, unit
  grammatikasiga va unit lug'atiga tayansin, bog'langan bitta hikoya bo'lsin.
- SO'Z SONI QAT'IY TALAB. Yozib bo'lgach so'zlarni SANA va oraliqqa tushmasa uzaytir.
- HAR SAVOLNING JAVOBI MATNDA BO'LISHI SHART va FAQAT BITTA variant to'g'ri
  bo'lsin. Yozib bo'lgach har savolni matnga qaytib solishtir: to'g'ri deb
  belgilangan variant matnda AYNAN tasdiqlanganmi? Boshqa variantlardan biri ham
  matnga mos kelib qolmayaptimi? Amalda topilgan xatolar: matnda "the apple is
  small" deyilgan, javob esa "The apple is old"; matnda ham olma, ham qalam
  stolda, savol esa "stolda kitob bilan yana nima bor" deb bitta javob so'ragan.
- Kontekstdagi so'z ma'nosi savolida to'g'ri javob so'zning MATNDAGI ma'nosi
  bo'lsin. "box" — quti, "stol" emas: bu xato aynan shu tarzda uchradi.
- "items": aynan ${ITEMS_PER_TASK} ta savol, shu tartibda:
  1) matnning umumiy mazmuni
  2) matndagi aniq fakt
  3) matndagi boshqa aniq fakt
  4) matndagi bitta so'zning SHU KONTEKSTDAGI ma'nosi (savolda qaysi so'z ekanini
     ayt; lug'aviy ta'rif emas, aynan matndagi ma'no so'raladi)
  5) matndan kelib chiqadigan mantiqiy xulosa
- Har savolning javobi matndan chiqishi SHART. Savol matni inglizcha.`,
    };
    case 'listen': return {
      shape: `{ "text": "...", "items": [ { "q": "...", "options": ["...","...","...","..."], "answer": 0 } ] }`,
      rules: `TUR: listen — o'quvchi matnni KO'RMAYDI, uni TTS ovoz chiqarib o'qiydi.
- "text": inglizcha matn, 60-100 so'z (darajadan qat'i nazar — quloq bilan qabul
  qilish qiyinroq). Jumlalar qisqa va aniq, murakkab ergash gaplarsiz.
- SO'Z SONI QAT'IY TALAB, taxminiy emas. Matnni yozib bo'lgach so'zlarni SANA.
  60 tadan kam bo'lsa — yetarli emas: undan 5 ta mustaqil savol chiqmaydi va
  savollar bir-birini takrorlaydi. Tafsilot qo'shib 60-100 oralig'iga chiqar
  (kim, qayerda, qachon, nima qildi, nima uchun). Amalda eng ko'p uchragan
  kamchilik aynan shu — matn 25-40 so'z bo'lib qolgan.
- "items": aynan ${ITEMS_PER_TASK} ta savol. Hammasi matnda ANIQ AYTILGAN faktlarga
  tegishli bo'lsin — xulosa yoki taxmin talab qilmasin, chunki matn ko'rinmaydi.
- Javob uchun zarur fakt matnda aniq va bir marta aytilsin. Savol matni inglizcha.`,
    };
    case 'translate': return {
      shape: `{ "items": [ { "uz": "...", "en": "...", "tiles": ["..."], "distractors": ["..."], "alt": [] } ] }`,
      rules: `TUR: translate — o'zbekcha jumla beriladi, o'quvchi inglizchasini plitkalardan yig'adi.
- Aynan ${ITEMS_PER_TASK} ta band, ODDIYDAN MURAKKABGA tartibda.
- Har jumla 4-8 so'z (plitka chegarasi sababli — yuqoriga qara). Har biri unit grammatikasini ko'rsatsin.
- "uz" — tabiiy o'zbekcha jumla; "en" — uning yagona tabiiy tarjimasi.
- Ko'p ma'noli o'zbekcha jumla yozma: yig'ilishi kerak bo'lgan javob bitta bo'lsin.`,
    };
    case 'build': return {
      shape: `{ "items": [ { "word": "...", "uz": "...", "en": "...", "tiles": ["..."], "distractors": ["..."], "alt": [] } ] }`,
      rules: `TUR: build — berilgan so'z bilan gap yig'iladi.
- Aynan ${ITEMS_PER_TASK} ta band, har birida BOSHQA so'z.
- "word" YUQORIDAGI "Unit lug'ati" ro'yxatidan AYNAN ko'chiriladi. Ro'yxatda yo'q
  so'zni ishlatish MUTLAQO mumkin emas — mavzuga qanchalik mos ko'rinsa ham.
  Yozishdan oldin tanlagan 5 so'zingni ro'yxatdan topib tasdiqlab ol.
- "word" — o'sha so'z, unit lug'atidagi yozilishida. U "en" ichida ALBATTA ishlatilsin.
- "uz" — o'sha so'zning unit lug'atidagi tarjimasi, AYNAN ko'chirilgan: o'zgartirma,
  qisqartirma, sinonim qo'yma, qavs ichidagi izohni ham tashlab ketma.
- "en" — 4-8 so'zli gap (plitka chegarasi sababli), unit grammatikasini ko'rsatadi.`,
    };
    case 'dictate': return {
      shape: `{ "items": [ { "en": "...", "uz": "...", "tiles": ["..."], "distractors": ["..."], "alt": [] } ] }`,
      rules: `TUR: dictate — TTS jumlani AYTADI, o'quvchi uni quloqdan plitkalardan yig'adi.
- Aynan ${ITEMS_PER_TASK} ta band. Jumlalar QISQA: 4-8 so'z (quloqdan yig'ish qiyin).
- Omofon chalkashligidan QOCH: their/there, two/too/to, your/you're, its/it's,
  buy/by, know/no, hear/here kabi juftlar ishlatilmasin.
- Raqam, atoqli ot va noodatiy talaffuzli so'zlarni minimal ishlat.
- "uz" — jumlaning o'zbekcha tarjimasi, faqat javobdan keyin ko'rsatiladi.
- Har jumla unit grammatikasini ko'rsatsin.`,
    };
    case 'order': return {
      shape: `{ "topic": "...", "topicUz": "...", "sentences": ["...","...","...","...","..."] }`,
      rules: `TUR: order — 5 ta jumla aralashtiriladi, o'quvchi ularni mantiqiy tartibda joylashtiradi.
- "topic" — qisqa inglizcha sarlavha; "topicUz" — uning o'zbekchasi (lotin yozuvi).
- "sentences" — aynan 5 ta jumla, TO'G'RI tartibda yozilgan (klient o'zi aralashtiradi).
- ENG MUHIM QOIDA: tartib YAGONA yechimli bo'lsin. Ikkinchi mantiqiy tartib bo'lishi
  MUMKIN EMAS — bu turning asosiy xato manbasi va shu sababli rad etiladi.
  Buni ta'minlash uchun:
  * bog'lovchi so'zlar bilan ochiq belgila: First, Then, After that, Next, Finally;
  * sabab-natija zanjiri qur: har keyingi jumla oldingisiga ANIQ tayansin
    (ot birinchi marta to'liq aytilsin, keyin olmosh bilan; "the" faqat oldin
    "a" bilan kiritilgan otga qo'yilsin);
  * vaqt ketma-ketligini buzib bo'lmaydigan qil (uyg'ondi → nonushta qildi → chiqdi).
- Yozib bo'lgach o'zingni tekshir: 2-jumlani 4-o'ringa qo'ysa matn buziladimi?
  Buzilmasa — qayta yoz.
- Jumlalar bitta mavzuda, unit grammatikasini ko'rsatsin, har biri 5-12 so'z.`,
    };
    case 'exam': return {
      shape: `{ "items": [ { "q": "...", "options": ["...","...","...","..."], "answer": 0 } ] }`,
      rules: `TUR: unit imtihoni — aynan ${EXAM_ITEMS} ta savol, butun unit bo'yicha.
  1-5) o'zbekcha jumla beriladi ("q" o'zbekcha), 4 ta inglizcha variantdan to'g'ri
       tarjimasi tanlanadi. Unit grammatikasini sinasin, oddiydan murakkabga.
  6-8) unit lug'atidan so'z ma'nosi: "q" da inglizcha so'z so'raladi
       ("Nima ma'noni anglatadi: student?"), variantlar o'zbekcha. To'g'ri variant —
       unit lug'atidagi tarjima, AYNAN ko'chirilgan.
- 6-8 dagi noto'g'ri variantlar ham SHU unit lug'atidan olinsin (chalkashtirsin),
  har savolda boshqa so'z so'ralsin.`,
    };
    case 'levelExam': return {
      shape: `{ "items": [ { "q": "...", "options": ["...","...","...","..."], "answer": 0 } ] }`,
      rules: `TUR: daraja imtihoni — aynan ${LEVEL_EXAM_ITEMS} ta savol, butun daraja bo'yicha. Qat'iy bo'l.
  1-6) grammatika: o'zbekcha jumla ("q" o'zbekcha) → 4 ta inglizcha variant.
       Turli unitlar grammatikasi ARALASH bo'lsin, har savol boshqa unitdan.
  7-8) xato topish: "q" da XATO inglizcha jumla beriladi
       ("Xato qayerda: She go to school every day."), variantlar — 4 ta
       to'g'rilangan jumla, faqat bittasi butunlay to'g'ri.
  9-10) daraja lug'atidan so'z ma'nosi: inglizcha so'z → 4 ta o'zbekcha variant,
       to'g'risi daraja lug'atidagi tarjima, AYNAN ko'chirilgan.`,
    };
    default: throw new Error(`noma'lum tur: ${type}`);
  }
}

function systemFor(type, lv) {
  const g = guide(type, lv);
  const mcq = ['read', 'listen', 'exam', 'levelExam'].includes(type) ? `\n\n${MCQ_RULES}` : '';
  const tiles = ['translate', 'build', 'dictate'].includes(type) ? `\n\n${TILE_RULES}` : '';
  return `${HEAD}

QAT'IY JAVOB FORMATI — faqat JSON, boshqa hech narsa yozma (izoh ham, \`\`\` ham yo'q):
${g.shape}

${g.rules}${mcq}${tiles}

${COMMON}`;
}

// ─── KONTEKST ─────────────────────────────────────────────────────

// `build` uchun so'zlarni MODEL emas, skript tanlaydi. Sabab amalda topildi:
// lug'ati asosan yordamchi so'zlardan iborat unitda (A1-06 — do/does, why, please)
// model doim tashqaridan so'z olib keladi va shakl gate uni rad etadi — ketma-ket
// olti urinish yiqildi. So'z oldindan berilsa, bu xato sinfi butunlay yo'qoladi.
// Teng oraliqda olinadi — lug'atning boshi ham, oxiri ham qamrab ketsin.
function pickWords(u, n) {
  const w = u.words || [];
  const step = Math.max(1, Math.floor(w.length / n));
  const out = [];
  for (let i = 0; out.length < n && i < w.length; i += step) out.push(w[i]);
  for (let i = 0; out.length < n && i < w.length; i++) if (!out.includes(w[i])) out.push(w[i]);
  return out;
}

function unitPrompt(u, lv, type) {
  const lines = [
    `Daraja: ${lv}`,
    `Unit: ${u.id} — ${u.title}`,
    `Maqsad: ${u.can}`,
    `Grammatika: ${u.grammar}`,
    `Qisqa izoh: ${u.explain}`,
    `Unit lug'ati (ETALON, tarjimalar aynan shu): ${u.words.map(w => `${w.en} = ${w.uz}`).join(', ')}`,
  ];
  if (type === 'build') {
    const picked = pickWords(u, ITEMS_PER_TASK);
    lines.push(
      ``,
      `MAJBURIY: "word" maydonlariga AYNAN shu ${picked.length} ta so'zni shu tartibda qo'y:`,
      ...picked.map((w, i) => `  ${i + 1}) word: "${w.en}"   → uz: "${w.uz}"`),
      `"word" ga FAQAT inglizcha so'zning o'zini yoz — tarjimasini, tenglik belgisini`,
      `yoki qavsli izohni QO'SHMA. Tarjima alohida "uz" maydoniga boradi.`,
    );
  }
  return lines.join('\n');
}

function levelPrompt(units, lv) {
  return [
    `Daraja: ${lv}`,
    `Unitlar va grammatikasi:`,
    ...units.map(u => `- ${u.id} — ${u.title} · ${u.grammar}`),
    ``,
    `Daraja lug'ati (ETALON, tarjimalar aynan shu):`,
    ...units.map(u => `${u.id}: ${u.words.map(w => `${w.en} = ${w.uz}`).join(', ')}`),
  ].join('\n');
}

// ─── CHAQIRUV ─────────────────────────────────────────────────────

// Gemini'ning RPM limiti bir nechta skript parallel ishlaganda tez uriladi.
// Bu kunlik kvota EMAS — bir necha soniya kutib qayta so'rasa o'tadi. Backoffsiz
// esa 429 "vazifa yiqildi" bo'lib ko'rinadi.
const RETRY_DELAYS_MS = [8000, 20000, 45000];
// Kunlik kvota tugaganda har vazifa 8+20+45 = 73 soniya kutib baribir yiqiladi.
// Amalda bu 36 ta qolgan vazifada ~44 daqiqa sof isrof bo'ldi. Ketma-ket
// bir necha vazifa faqat rate-limit bilan yiqilsa — bu RPM emas, KUNLIK kvota,
// va kutish yordam bermaydi. Butun yugurishni to'xtatamiz.
const QUOTA_ABORT_AFTER = 5;
let consecutiveRateLimited = 0;
class QuotaExhausted extends Error {}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function askOne(system, prompt) {
  for (let i = 0; ; i++) {
    const r = await askOnce(system, prompt);
    if (!r.rateLimited) { consecutiveRateLimited = 0; return r; }
    if (i >= RETRY_DELAYS_MS.length) {
      if (++consecutiveRateLimited >= QUOTA_ABORT_AFTER) throw new QuotaExhausted();
      return r;
    }
    process.stdout.write(`429, ${RETRY_DELAYS_MS[i] / 1000}s kutamiz... `);
    await sleep(RETRY_DELAYS_MS[i]);
  }
}

async function askOnce(system, prompt) {
  const res = await fetch(`${SB_URL}/functions/v1/chat`, {
    method: 'POST',
    // Timeoutsiz chaqiruv jimgina osilib qoladi — amalda 12 daqiqa
    // na yozuv, na xato berib turdi. 60s dan uzoq javob baribir keraksiz.
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON },
    body: JSON.stringify({
      userId: UID,
      system,
      messages: [{ role: 'user', content: prompt }],
      mode: 'task_build',
      profile: { name: 'TaskBuild', level: 'C2', goal: 'general' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `${res.status} ${data.message || data.error || ''}`;
    return { error: msg, rateLimited: res.status === 429 || /rate|limit/i.test(msg) };
  }

  // Model ba'zan ```json bilan o'raydi — birinchi { dan oxirgi } gacha kesamiz.
  const txt = String(data.text || '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b <= a) return { error: 'JSON topilmadi' };
  try { return { json: JSON.parse(txt.slice(a, b + 1)) }; }
  catch (e) { return { error: 'JSON parse: ' + e.message }; }
}

// ─── FAYL ─────────────────────────────────────────────────────────

function loadCurriculum(only) {
  return fs.readdirSync(path.join(ROOT, 'data'))
    .filter(f => /^curriculum-[a-z0-9]+\.json$/.test(f))
    .sort()
    .map(f => {
      const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
      const lv = Object.keys(json)[0];
      return { lv, units: json[lv], out: path.join(ROOT, 'data', `tasks-${lv.toLowerCase()}.json`) };
    })
    .filter(x => !only || x.lv === only.toUpperCase());
}

// Mavjud faylni unit `id` si bo'yicha qayta joylashtiramiz: kurrikulumga unit
// qo'shilsa ham allaqachon generatsiya qilingan ish indeks siljishidan buzilmasin.
function loadTasks(out, lv, units) {
  let old = null;
  if (fs.existsSync(out)) {
    try { old = JSON.parse(fs.readFileSync(out, 'utf8')); }
    catch (e) { console.log(`  ${path.basename(out)} buzilgan (${e.message}) — noldan boshlanadi`); }
  }
  const byId = new Map((old && Array.isArray(old.units) ? old.units : []).map(u => [u.id, u]));
  return {
    level: lv,
    units: units.map(u => {
      const prev = byId.get(u.id) || {};
      return {
        id: u.id,
        tasks: Array.isArray(prev.tasks) ? prev.tasks : [],
        exam: Array.isArray(prev.exam) ? prev.exam : [],
      };
    }),
    levelExam: old && Array.isArray(old.levelExam) ? old.levelExam : [],
  };
}

// JSON.stringify har so'zni alohida qatorga yoyadi va butun faylni o'zgargan qilib
// ko'rsatadi — katta diff ichida bitta yangi vazifa ko'rinmay qoladi. Shuning uchun
// kichik obyektlar va satr massivlari bir qatorga yig'iladi (build-lessons.mjs dan).
function compact(json) {
  return JSON.stringify(json, null, 2)
    // { "q": ... }, { "uz": ... }, { "word": ... }, { "en": ... } — bitta band
    .replace(/\{\s*\n\s*("(?:en|q|uz|word)"[\s\S]{0,600}?)\n\s*\}/g,
      (m, inner) => '{ ' + inner.split('\n').map(s => s.trim()).join(' ') + ' }')
    // ["a", "b", "c"] — variantlar, plitkalar, jumlalar
    .replace(/\[\s*\n\s*("(?:[^"\\]|\\.)*"(?:,\s*\n\s*"(?:[^"\\]|\\.)*")*)\s*\n\s*\]/g,
      (m, inner) => '[' + inner.split('\n').map(s => s.trim()).join(' ') + ']')
    + '\n';
}

// ─── REJA ─────────────────────────────────────────────────────────

// Vazifa turlari unitning HAQIQIY `tasks` massividan chiqadi — shablon taxmin
// qilinmaydi (A1-01 da speak yo'q, A1-01/02/03 da write yo'q).
function planLevel(lv, units, data, force) {
  const jobs = [];
  units.forEach((u, ui) => {
    u.tasks.forEach((t, ti) => {
      jobs.push({ kind: 'task', lv, unit: u, ui, ti, type: toOffline(t), done: !!data.units[ui].tasks[ti] && !force });
    });
    jobs.push({ kind: 'exam', lv, unit: u, ui, type: 'exam', done: data.units[ui].exam.length > 0 && !force });
  });
  jobs.push({ kind: 'levelExam', lv, type: 'levelExam', done: data.levelExam.length > 0 && !force });
  return jobs;
}

// ─── ARGUMENTLAR ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const normalize = args.includes('--normalize');
const uidArg = args.find(a => a.startsWith('--uid='));
if (uidArg) UID = uidArg.slice('--uid='.length);
const only = args.find(a => !a.startsWith('--'));

const levels = loadCurriculum(only);
if (!levels.length) { console.error('Kurrikulum fayli topilmadi'); process.exit(1); }

const plans = levels.map(({ lv, units, out }) => {
  const data = loadTasks(out, lv, units);
  return { lv, units, out, data, jobs: planLevel(lv, units, data, force) };
});

// --dry-run: chaqiruvsiz, faqat reja. Shakl validatori ham kerak emas — shuning
// uchun uning importi quyida, dinamik.
// --normalize: API'siz, mavjud faylga javob indeksi taqsimotini qayta qo'llaydi.
// Generatsiyadan oldin yozilgan data ham tuzalsin uchun alohida rejim.
if (normalize) {
  const { spreadAnswers: spread } = await import('./validate-tasks.mjs');
  let touched = 0;
  for (const { lv, out } of plans) {
    if (!fs.existsSync(out)) continue;
    const data = JSON.parse(fs.readFileSync(out, 'utf8'));
    for (const u of data.units || []) {
      (u.tasks || []).forEach((t, i) => {
        if (t && Array.isArray(t.items) && t.items[0] && 'options' in t.items[0]) {
          u.tasks[i] = { ...t, items: spread(t.items) }; touched++;
        }
      });
      if (Array.isArray(u.exam) && u.exam.length) { u.exam = spread(u.exam); touched++; }
    }
    if (Array.isArray(data.levelExam) && data.levelExam.length) { data.levelExam = spread(data.levelExam); touched++; }
    fs.writeFileSync(out, compact(data), 'utf8');
    console.log(`  ${lv}: ${touched} ta variantli vazifa normallashtirildi`);
  }
  console.log('Javob indekslari taqsimlandi — API chaqirilmadi.');
  process.exit(0);
}

if (dryRun) {
  let total = 0, todo = 0;
  for (const { lv, units, jobs } of plans) {
    console.log(`\n${lv} — ${units.length} unit`);
    for (const u of units) {
      const uj = jobs.filter(j => j.unit === u);
      const left = uj.filter(j => !j.done).length;
      console.log(`  ${u.id}  ${u.tasks.map(toOffline).join(' ')} + exam   → ${left}/${uj.length}`);
    }
    const le = jobs.find(j => j.kind === 'levelExam');
    console.log(`  daraja imtihoni → ${le.done ? "mavjud, o'tkaziladi" : 'generatsiya qilinadi'}`);
    const nTask = jobs.filter(j => j.kind === 'task').length;
    const nExam = jobs.filter(j => j.kind === 'exam').length;
    const todoLv = jobs.filter(j => !j.done).length;
    console.log(`  ${lv} jami: ${nTask} vazifa + ${nExam} unit imtihoni + 1 daraja imtihoni = ${jobs.length} chaqiruv (bajariladi: ${todoLv})`);
    total += jobs.length; todo += todoLv;
  }
  console.log(`\nJAMI: ${total} chaqiruv, shundan ${todo} tasi bajariladi${force ? ' (--force)' : ''}.`);
  console.log('Quruq yurish — API chaqirilmadi, token sarflanmadi.');
  process.exit(0);
}

// Shakl gate ikkinchi skriptdan keladi. Import dinamik: --dry-run uni talab
// qilmasin va reja validatorsiz ham ko'rsatilaversin.
const { validateTask, validateMcq, spreadAnswers } = await import('./validate-tasks.mjs');

// ─── GENERATSIYA ──────────────────────────────────────────────────

// Yarim data yo'qidan battar — klient uni to'liq deb qabul qiladi. Shuning uchun
// shakli noto'g'ri natija saqlanmaydi, `failed++` bo'ladi va qayta yurishda tiklanadi.
function examErrors(items, count, where) {
  if (!Array.isArray(items) || items.length !== count) return [`${where}: ${count} ta band emas`];
  return items.flatMap((m, i) => validateMcq(m, `${where}[${i + 1}]`));
}

let made = 0, skipped = 0, failed = 0, quotaHit = false;

for (const { lv, units, out, data, jobs } of plans) {
  console.log(`\n${lv} — ${jobs.filter(j => !j.done).length} chaqiruv`);
  for (const job of jobs) {
    if (job.done) { skipped++; continue; }

    const label = job.kind === 'levelExam' ? `${lv} daraja imtihoni`
      : job.kind === 'exam' ? `${job.unit.id} imtihon`
      : `${job.unit.id} #${job.ti + 1} ${job.type}`;
    process.stdout.write(`  ${label} ... `);

    const prompt = job.kind === 'levelExam' ? levelPrompt(units, lv) : unitPrompt(job.unit, lv, job.type);
    let r;
    try { r = await askOne(systemFor(job.type, lv), prompt); }
    catch (e) {
      if (!(e instanceof QuotaExhausted)) throw e;
      console.log("TO'XTADI");
      quotaHit = true;
      break;
    }
    if (r.error) { console.log('XATO: ' + r.error); failed++; continue; }

    let value, errs;
    if (job.kind === 'levelExam') {
      value = r.json.items;
      errs = examErrors(value, LEVEL_EXAM_ITEMS, `${lv} levelExam`);
    } else if (job.kind === 'exam') {
      value = r.json.items;
      errs = examErrors(value, EXAM_ITEMS, `${job.unit.id} exam`);
    } else {
      // `type` ni model emas, skript qo'yadi — u moslashtirish formulasidan chiqadi.
      // Model o'zi yozib yuborgan bo'lsa ham tashlab yuboriladi.
      const { type: _fromModel, ...rest } = r.json;
      value = { type: job.type, ...rest };
      errs = validateTask(value, { level: lv, unitId: job.unit.id, expectedType: job.type, words: job.unit.words });
    }

    if (errs && errs.length) { console.log('SHAKL XATO: ' + errs.join('; ')); failed++; continue; }

    // To'g'ri javob indeksini teng taqsimlaymiz — model uni deyarli doim 0 ga
    // qo'yadi va o'quvchi doim birinchi variantni bosib to'liq ball oladi.
    if (job.kind === 'levelExam' || job.kind === 'exam') value = spreadAnswers(value);
    else if (Array.isArray(value.items) && value.items[0] && 'options' in value.items[0]) {
      value = { ...value, items: spreadAnswers(value.items) };
    }

    if (job.kind === 'levelExam') data.levelExam = value;
    else if (job.kind === 'exam') data.units[job.ui].exam = value;
    else data.units[job.ui].tasks[job.ti] = value;

    // Har vazifadan keyin faylga yozamiz — uzilib qolsa ish yo'qolmasin.
    fs.writeFileSync(out, compact(data), 'utf8');
    made++;
    console.log('OK');
  }
}

if (quotaHit) {
  console.log("");
  console.log("KUNLIK KVOTA TUGADI - ketma-ket " + QUOTA_ABORT_AFTER + " vazifa rate-limit bilan yiqildi.");
  console.log("Bu RPM emas - kutish yordam bermaydi. Yozilgani saqlandi, ish yo'qolmadi.");
  console.log("Kvota tiklangach shu buyruqni qaytadan ishga tushiring - bo'sh slotlar to'ldiriladi.");
}
console.log(`\n${made} ta vazifa yozildi · ${skipped} ta o'tkazildi (mavjud) · ${failed} ta yiqildi`);
console.log('Keyingi: node scripts/validate-tasks.mjs && node scripts/check-tasks.mjs');
process.exit(failed ? 1 : 0);
