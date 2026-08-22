// Offline vazifa kontentini AI bilan tekshiradi va faqat SHUBHALI larini ro'yxat qiladi.
// validate-tasks.mjs shaklni tekshiradi (nechta band, plitkalar `en` ga mosmi...),
// bu skript esa MAZMUNNI: ko'rsatilgan javob haqiqatan to'g'rimi, ikkita variant
// bir vaqtda to'g'ri emasmi, `order` jumlalarini boshqa tartibda ham joylash
// mumkinmi, chalg'ituvchi plitkalar ikkinchi to'g'ri javob yasamaydimi.
//
// Ishlatish:
//   node scripts/check-tasks.mjs                 # barcha darajalar
//   node scripts/check-tasks.mjs A1              # faqat bitta daraja
//   node scripts/check-tasks.mjs A1 --uid=<uuid> # alohida limit hisobi
//   node scripts/check-tasks.mjs A1 --dry-run    # API'ga chiqmaydi, matnni chop etadi
//
// Jonli API'ga chiqadi va token sarflaydi (vazifa boshiga 1 chaqiruv).
// Natija: .task-check/report.md — faqat shubhali vazifalar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3dhdnFieGpmbGd0eGVwZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjAxMzEsImV4cCI6MjA5ODEzNjEzMX0.8RA7w_L6C3fy_ytaJl6ipETz2WZuamFhSGcIQGMOXXo';
let UID = '00000000-0000-4000-8000-000000000abc';   // --uid= bilan almashtiriladi
const OUT_DIR = path.join(ROOT, '.task-check');

// Tor ta'rif ataylab: "yaxshiroq yozish mumkin edi" turidagi yuzlab fikr
// haqiqiy xatoni ko'mib yuboradi. check-lessons.mjs dagi bilan bir xil mantiq.
const SYSTEM = `Sen ingliz tili mashqlarini tekshiruvchi muharrirsan. Material o'zbek
o'quvchilari uchun, offline dasturda ishlatiladi — xato chiqsa uni hech kim
runtime'da tuzatmaydi, shuning uchun tekshiruv sinchkov bo'lishi kerak.

Har vazifa bitta unitga tegishli. Unit grammatikasi va lug'ati matn boshida beriladi.

FAQAT quyidagi hollarda xato deb belgila:
- ko'rsatilgan javob NOTO'G'RI
- bitta savolda ikkita yoki undan ko'p variant to'g'ri
- inglizcha jumlada grammatik xato
- o'zbekcha tarjima noto'g'ri yoki ortiqcha ma'no qo'shadi
- read/listen savolining javobi matnda YO'Q (matndan chiqarib bo'lmaydi)
- o'zbekcha matnda imlo xatosi yoki kirill harfi bor

Bu uchtasi ALOHIDA E'TIBOR talab qiladi — avtomatik tekshiruv ularni doim o'tkazib
yuboradi, chunki jumlalar grammatik jihatdan benuqson ko'rinadi:
- JUMLA UNIT GRAMMATIKASINI KO'RSATMASA yoki unga ZID shaklda bo'lsa — xato.
  Misol: kauzativ ("have something done") unitida "She wants to renovate her
  apartment" — aynan o'rgatilayotgan shaklning aksi. Shaxssiz majhul unitida
  aktiv nisbatdagi jumla. Aralash shart gap unitida oddiy 2-tur shart gap.
  Har bir jumlani unitning "Grammatika" maydoniga solishtir. Unit so'zini
  ishlatish YETARLI EMAS — shakl ko'rinishi shart.
- JUMLA MA'NO JIHATDAN BEMA'NI bo'lsa — xato, garchi grammatikasi to'g'ri bo'lsa ham.
  Misol: "I live in an office", "He stopped to proceed on the way",
  "My sister is a table". Odam bunday gapirmaydi.
- TARJIMA ORTIQCHA MA'NO QO'SHSA — xato. Masalan nisbiy gapni sababiyat qilib
  ("poytaxt bo'lgani UCHUN") yoki oddiy zamonni davomiy qilib tarjima qilish.

"order" TURI — BU TURNING ASOSIY XATO MANBASI, ENG QATTIQ TEKSHIR.
Jumlalar TO'G'RI tartibda berilgan. Sening vazifang — YAGONA YECHIM bormi degan
savolga javob berish. Har jumlani boshqa pozitsiyaga ko'chirib ko'r: agar matn
yana ham mantiqiy o'qilsa — bu XATO, chunki o'quvchi to'g'ri javob bergani holda
"noto'g'ri" degan javobni oladi. Tartibni faqat mazmun emas, TIL SIGNALLARI
qulflashi kerak: bog'lovchilar (first, then, after that, finally), olmosh
havolalari (avval "my brother Aziz", keyin "he"), zamon ketma-ketligi, savol→javob
juftligi. Agar 5 jumlaning ikkitasini o'rin almashtirish mumkin bo'lsa — xato
sifatida qaysi ikkitasini ayt.

"tiles" va "distractors" — CHALG'ITUVCHI PLITKALAR ALOHIDA TEKSHIRILADI.
O'quvchi tiles + distractors dan gap yig'adi. Agar distractors plitkalaridan
foydalanib BOSHQA to'g'ri (grammatik va ma'no jihatdan benuqson) gap tuzish
mumkin bo'lsa — bu XATO, chunki ikkita to'g'ri javob paydo bo'ladi va dastur
faqat bittasini qabul qiladi. Masalan tiles ["She","is","a","doctor"] va
distractors ["He","was"] — "He was a doctor" ham to'g'ri gap.

O'ZBEKCHA MATN PUXTALIGI — alohida va sinchkovlik bilan tekshir. Amalda topilgan
xatolarning ko'pchiligi aynan shu turkumda va grammatika tekshiruvida ko'rinmaydi:
- o'zbek tilida MAVJUD BO'LMAGAN so'z ("oddiy o'simish zamon", "notunt", "akademil",
  "Fomula", "Egat", "Subtekt") — har bir so'zni haqiqiy so'zmi deb tekshir
- TUSHIB QOLGAN PROBEL yoki qo'shilib ketgan so'zlar ("Ungabmusiqa", "'kitob'deyishadi")
- APOSTROF xatosi: o' va g' o'rniga oddiy o/g ("qo'g'irchoqi" o'rniga "qogirchoqi")
- KIRILL harfi (а е о с) lotin harfi o'rniga — ko'zga ko'rinmaydi, qidir
- o'zbekcha gap ichida ORTIQCHA INGLIZCHA so'z yoki artikl ("Yangi telefonlar the ofisda")
- gap kichik harf bilan boshlanishi yoki nuqta yo'qligi
- tarjima ma'noni butunlay o'zgartirishi ("Agar pul desak" ← "Agar pul tejasak")

XATO DEB BELGILAMA:
- uslub, sinonim afzalligi, "yana misol qo'shsa bo'lardi"
- noto'g'ri variantlar juda oson tuyulishi
- matnning qisqaligi yoki vazifaning yengilligi
- jumlaning soddaligi (bu boshlang'ich material — ataylab shunday)
- plitkalar soni yoki tartibi (klient ularni o'zi aralashtiradi)

JAVOB FORMATI — qat'iy, boshqa hech narsa yozma:
Har bir muammo uchun bitta qator:
joy | muammo qisqa | taklif
"joy" — item 3 / savol 2 / text / tiles 4 / distractors 2 / jumla 3 kabi aniq manzil.
Hech qanday muammo topmasang, aynan shu bitta so'zni yoz: TOZA`;

// ── Data yuklash ──────────────────────────────────────────────────────────────

// Unit konteksti curriculum'dan olinadi: grammatika va lug'atsiz AI "unit
// grammatikasiga zid" xatosini umuman ko'ra olmaydi.
function loadCurriculum(lv) {
  const f = path.join(ROOT, 'data', `curriculum-${lv.toLowerCase()}.json`);
  if (!fs.existsSync(f)) return null;
  const json = JSON.parse(fs.readFileSync(f, 'utf8'));
  return json[Object.keys(json)[0]] || null;
}

function loadJobs(only) {
  const files = fs.readdirSync(path.join(ROOT, 'data'))
    .filter(f => /^tasks-[a-z0-9]+\.json$/.test(f))
    .sort();
  const jobs = [];
  for (const f of files) {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    const lv = json.level || f.replace(/^tasks-|\.json$/g, '').toUpperCase();
    if (only && lv !== only.toUpperCase()) continue;
    const curr = loadCurriculum(lv) || [];
    const byId = new Map(curr.map(u => [u.id, u]));

    for (const unit of json.units || []) {
      const cu = byId.get(unit.id) || {};
      (unit.tasks || []).forEach((task, i) => {
        jobs.push({ lv, unit: unit.id, label: `${i + 1}. ${task.type}`, kind: task.type, task, cu });
      });
      if (unit.exam) jobs.push({ lv, unit: unit.id, label: 'exam', kind: 'exam', task: unit.exam, cu });
    }
    if (json.levelExam) {
      jobs.push({ lv, unit: lv, label: 'levelExam', kind: 'levelExam', task: json.levelExam, cu: null, curr });
    }
  }
  return jobs;
}

// ── Vazifani matnga aylantirish ───────────────────────────────────────────────

function unitContext(job) {
  // levelExam butun darajani qamraydi — konteksti barcha unitlarning grammatikasi.
  if (job.kind === 'levelExam') {
    return [
      `Daraja: ${job.lv} — daraja imtihoni (barcha unitlar aralash)`,
      `Darajadagi grammatik mavzular:`,
      ...(job.curr || []).map(u => `  ${u.id}: ${u.grammar}`),
    ].join('\n');
  }
  const u = job.cu || {};
  const words = (u.words || []).map(w => `${w.en} = ${w.uz}`).join(', ');
  return [
    `Unit: ${u.id || job.unit}${u.title ? ` — ${u.title}` : ''}`,
    `Grammatika: ${u.grammar || '(noma\'lum)'}`,
    words ? `Unit lug'ati: ${words}` : '',
  ].filter(Boolean).join('\n');
}

function mcqLines(items, word = 'Savol') {
  return items.map((q, i) => [
    `${word} ${i + 1}: ${q.q}`,
    `   variantlar: ${(q.options || []).join(' / ')}`,
    `   ko'rsatilgan javob: ${(q.options || [])[q.answer]}`,
  ].join('\n'));
}

function tileLines(items, withWord) {
  return items.map((it, i) => [
    `item ${i + 1}:`,
    withWord && it.word ? `   berilgan so'z: ${it.word} (${it.uz})` : null,
    `   o'zbekcha: ${it.uz}`,
    `   inglizcha (to'g'ri javob): ${it.en}`,
    `   plitkalar: ${(it.tiles || []).join(' / ')}`,
    `   chalg'ituvchilar: ${(it.distractors || []).join(' / ') || '(yo\'q)'}`,
    (it.alt || []).length ? `   qabul qilinadigan boshqa javoblar: ${it.alt.join(' | ')}` : null,
  ].filter(Boolean).join('\n'));
}

function taskBody(job) {
  const t = job.task;
  switch (job.kind) {
    case 'read':
      return [`TUR: read — matn o'quvchiga KO'RINADI, u o'qib savollarga javob beradi.`,
        ``, `MATN:`, t.text, ``, ...mcqLines(t.items || [])].join('\n');
    case 'listen':
      return [`TUR: listen — matn KO'RINMAYDI, TTS uni ovoz bilan o'qiydi.`,
        ``, `MATN (faqat eshitiladi):`, t.text, ``, ...mcqLines(t.items || [])].join('\n');
    case 'translate':
      return [`TUR: translate — o'zbekcha jumla beriladi, o'quvchi inglizchasini plitkalardan yig'adi.`,
        ...tileLines(t.items || [], false)].join('\n\n');
    case 'build':
      return [`TUR: build — berilgan so'z bilan gap yig'iladi (so'z gap ichida bo'lishi shart).`,
        ...tileLines(t.items || [], true)].join('\n\n');
    case 'dictate':
      return [`TUR: dictate — TTS inglizcha jumlani aytadi, o'quvchi uni plitkalardan yig'adi.\n` +
        `O'zbekcha faqat javobdan keyin ko'rsatiladi.`,
        ...tileLines(t.items || [], false)].join('\n\n');
    case 'order':
      return [`TUR: order — 5 jumla ARALASHTIRILIB beriladi, o'quvchi mantiqiy tartibga soladi.`,
        `Quyida jumlalar TO'G'RI tartibda, ya'ni yagona qabul qilinadigan javob shu.`,
        ``, `Mavzu: ${t.topic || ''}${t.topicUz ? ` (${t.topicUz})` : ''}`,
        ``, ...(t.sentences || []).map((s, i) => `${i + 1}. ${s}`)].join('\n');
    case 'exam':
      return [`TUR: unit imtihoni — 8 ta variantli savol (1-5 grammatika/tarjima, 6-8 so'z ma'nosi).`,
        ``, ...mcqLines(t, 'savol')].join('\n');
    case 'levelExam':
      return [`TUR: daraja imtihoni — 10 ta variantli savol (1-6 grammatika, 7-8 xato topish, 9-10 so'z ma'nosi).`,
        ``, ...mcqLines(t, 'savol')].join('\n');
    default:
      return `TUR: ${job.kind} (noma'lum tur)\n\n${JSON.stringify(t, null, 2)}`;
  }
}

function taskText(job) {
  return `${unitContext(job)}\n\n${taskBody(job)}`;
}

// ── Chaqiruv ──────────────────────────────────────────────────────────────────

// Gemini RPM limiti — kunlik kvota emas. Backoffsiz 429 vazifani jimgina
// "tekshirilgan" qatoriga qo'shib yuboradi va xato hisobotga tushmay qoladi.
const RETRY_DELAYS_MS = [8000, 20000, 45000];
// Kunlik kvota tugaganda har vazifa 8+20+45 = 73 soniya kutib baribir yiqiladi.
// Amalda bu 36 ta qolgan vazifada ~44 daqiqa sof isrof bo'ldi. Ketma-ket
// bir necha vazifa faqat rate-limit bilan yiqilsa — bu RPM emas, KUNLIK kvota,
// va kutish yordam bermaydi. Butun yugurishni to'xtatamiz.
const QUOTA_ABORT_AFTER = 5;
let consecutiveRateLimited = 0;
class QuotaExhausted extends Error {}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkTask(job) {
  for (let i = 0; ; i++) {
    const r = await checkOnce(job);
    if (!r.rateLimited) { consecutiveRateLimited = 0; return r; }
    if (i >= RETRY_DELAYS_MS.length) {
      if (++consecutiveRateLimited >= QUOTA_ABORT_AFTER) throw new QuotaExhausted();
      return r;
    }
    process.stdout.write(`429, ${RETRY_DELAYS_MS[i] / 1000}s kutamiz... `);
    await sleep(RETRY_DELAYS_MS[i]);
  }
}

async function checkOnce(job) {
  // Tarmoq uzilishi butun yugurishni to'xtatmasin: 85 chaqiruvdan bittasi
  // yiqilsa, qolgani davom etadi va u "tekshirilmagan" ro'yxatiga tushadi.
  let res;
  try {
    res = await fetch(`${SB_URL}/functions/v1/chat`, {
      method: 'POST',
      // Timeoutsiz chaqiruv jimgina osilib qoladi — amalda 12 daqiqa
      // na yozuv, na xato berib turdi. 60s dan uzoq javob baribir keraksiz.
      signal: AbortSignal.timeout(60_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON },
      body: JSON.stringify({
        userId: UID,
        system: SYSTEM,
        messages: [{ role: 'user', content: taskText(job) }],
        mode: 'task_check',
        profile: { name: 'TaskCheck', level: 'C2', goal: 'general' },
      }),
    });
  } catch (e) {
    return { error: `tarmoq: ${e.message}`, rateLimited: false };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `${res.status} ${data.message || data.error || ''}`;
    return { error: msg, rateLimited: res.status === 429 || /rate|limit/i.test(msg) };
  }
  return { text: data.text || '' };
}

// ── Yugurish ──────────────────────────────────────────────────────────────────

// Bir nechta skript parallel ishlaganda bitta uid ustidagi limit chalkashtiradi:
// rate-limit ham, per-user limit ham bir xil 429 bo'lib ko'rinadi. --uid bilan
// har bir yugurish o'z hisobiga chiqadi.
const argv = process.argv.slice(2);
const uidArg = argv.find(a => a.startsWith('--uid='));
if (uidArg) UID = uidArg.slice(6);
const dryRun = argv.includes('--dry-run');
const only = argv.find(a => !a.startsWith('--'));
const jobs = loadJobs(only);
if (!jobs.length) { console.error('Vazifa topilmadi — avval build-tasks.mjs ni ishga tushiring'); process.exit(1); }

// --dry-run: AI ga yuboriladigan matnni chop etadi, API'ga chiqmaydi va token sarflamaydi.
if (dryRun) {
  for (const job of jobs) {
    console.log(`\n${'='.repeat(70)}\n### ${job.lv} · ${job.unit} · ${job.label}\n${'='.repeat(70)}`);
    console.log(taskText(job));
  }
  console.log(`\n${jobs.length} ta vazifa (chaqiruv qilinmadi — --dry-run)`);
  process.exit(0);
}

console.log(`${jobs.length} ta vazifa tekshiriladi...`);
let quotaHit = false;
const flagged = [];
const unchecked = [];   // chaqiruvi yiqilgan vazifalar — "tekshirildi" deb hisoblanmaydi

for (const job of jobs) {
  process.stdout.write(`  ${job.unit} · ${job.label} ... `);
  let r;
  try { r = await checkTask(job); }
  catch (e) {
    if (!(e instanceof QuotaExhausted)) throw e;
    console.log("TOXTADI");
    quotaHit = true;
    break;
  }
  if (r.error) {
    console.log('XATO: ' + r.error);
    unchecked.push(`${job.unit} · ${job.label}`);
    continue;
  }
  const lines = r.text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 1 && /^TOZA$/i.test(lines[0])) { console.log('toza'); continue; }
  let n = 0;
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) continue;
    flagged.push({ lv: job.lv, unit: job.unit, task: job.label, where: parts[0], problem: parts[1], suggestion: parts[2] || '' });
    n++;
  }
  console.log(n ? `${n} ta shubha` : 'toza');
}

if (quotaHit) {
  console.log("");
  console.log("KUNLIK KVOTA TUGADI - tekshiruv tugallanmadi. Hisobot QISMAN.");
  console.log("Kvota tiklangach qaytadan ishga tushiring.");
}
fs.mkdirSync(OUT_DIR, { recursive: true });
const md = [
  `# Vazifa tekshiruvi`,
  ``,
  // Yiqilgan chaqiruv "tekshirildi" emas — aks holda hisobot qamrovni oshirib
  // ko'rsatadi va tekshirilmagan vazifa toza deb o'ylanadi.
  `Tekshirildi: **${jobs.length - unchecked.length}** / ${jobs.length} vazifa${only ? ` (${only.toUpperCase()})` : ''}`,
  `Shubhali: **${flagged.length}**`,
  ...(unchecked.length ? [``, `> ⚠️ TEKSHIRILMAGAN (chaqiruv yiqildi): ${unchecked.join(', ')} — qayta ishga tushiring`] : []),
  ``,
  `> Bu AI taklifi, hukm emas. Har birini o'zingiz qaror qiling.`,
  ``,
  `| Unit | Vazifa | Joy | Muammo | Taklif |`,
  `|---|---|---|---|---|`,
  ...flagged.map(f => `| ${f.unit} | ${f.task} | ${f.where} | ${f.problem} | ${f.suggestion} |`),
  ``,
].join('\n');
const out = path.join(OUT_DIR, `report${only ? '-' + only.toUpperCase() : ''}.md`);
fs.writeFileSync(out, md, 'utf8');
console.log(`\n${flagged.length} ta shubhali joy → ${out}`);
