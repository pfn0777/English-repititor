// Bosqichli dars kontentini AI bilan tekshiradi va faqat SHUBHALI larini ro'yxat qiladi.
// build-curriculum.mjs shaklni tekshiradi (nechta misol, javob indeksi oralig'ida...),
// bu skript esa MAZMUNNI: qoida to'g'rimi, javob haqiqatan to'g'rimi, ikkita variant
// bir vaqtda to'g'ri emasmi.
//
// Ishlatish:
//   node scripts/check-lessons.mjs            # barcha darajalar
//   node scripts/check-lessons.mjs A1         # faqat bitta daraja
//
// Jonli API'ga chiqadi va token sarflaydi (unit boshiga 1 chaqiruv).
// Natija: .lesson-check/report.md — faqat shubhali unitlar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3dhdnFieGpmbGd0eGVwZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjAxMzEsImV4cCI6MjA5ODEzNjEzMX0.8RA7w_L6C3fy_ytaJl6ipETz2WZuamFhSGcIQGMOXXo';
let UID = '00000000-0000-4000-8000-000000000abc';   // --uid= bilan almashtiriladi
const OUT_DIR = path.join(ROOT, '.lesson-check');

// Tor ta'rif ataylab: "yaxshiroq yozish mumkin edi" turidagi 72 ta fikr
// haqiqiy xatoni ko'mib yuboradi. check-glosses.mjs dagi bilan bir xil mantiq.
const SYSTEM = `Sen ingliz tili darsliklarini tekshiruvchi muharrirsan. Material o'zbek
o'quvchilari uchun, boshlang'ich darajadan yuqoriga qarab.

FAQAT quyidagi hollarda xato deb belgila:
- qoida (rule) grammatik jihatdan noto'g'ri yoki o'quvchini chalg'itadi
- misol jumlasi ingliz tilida grammatik xato
- misolning o'zbekcha tarjimasi noto'g'ri
- test savolining ko'rsatilgan javobi NOTO'G'RI
- bitta savolda ikkita yoki undan ko'p variant to'g'ri
- savol unit mavzusiga umuman aloqasiz
- o'zbekcha matnda imlo xatosi yoki kirill harfi bor

Bu uchtasi ALOHIDA E'TIBOR talab qiladi — avtomatik tekshiruv ularni doim o'tkazib
yuboradi, chunki jumlalar grammatik jihatdan benuqson ko'rinadi:
- MISOL UNIT GRAMMATIKASINI KO'RSATMASA yoki unga ZID shaklda bo'lsa — xato.
  Misol: kauzativ ("have something done") darsida "She wants to renovate her
  apartment" — aynan o'rgatilayotgan shaklning aksi. Shaxssiz majhul darsida
  aktiv nisbatdagi misol. Aralash shart gap darsida oddiy 2-tur shart gap.
  Har bir misolni unitning "Grammatika" maydoniga solishtir.
- JUMLA MA'NO JIHATDAN BEMA'NI bo'lsa — xato, garchi grammatikasi to'g'ri bo'lsa ham.
  Misol: "I live in an office", "He stopped to proceed on the way",
  "I stopped resigning the meeting". Odam bunday gapirmaydi.
- TARJIMA ORTIQCHA MA'NO QO'SHSA — xato. Masalan nisbiy gapni sababiyat qilib
  ("poytaxt bo'lgani UCHUN") yoki oddiy zamonni davomiy qilib tarjima qilish.

O'ZBEKCHA MATN PUXTALIGI — alohida va sinchkovlik bilan tekshir. Amalda topilgan
xatolarning ko'pchiligi aynan shu turkumda va grammatika tekshiruvida ko'rinmaydi:
- o'zbek tilida MAVJUD BO'LMAGAN so'z ("oddiy o'simish zamon", "notunt", "akademil",
  "Fomula", "Egat", "Subtekt") — har bir so'zni haqiqiy so'zmi deb tekshir
- TUSHIB QOLGAN PROBEL yoki qo'shilib ketgan so'zlar ("Ungabmusiqa", "'beautifuler'deyishadi")
- APOSTROF xatosi: o' va g' o'rniga oddiy o/g ("qo'g'irchoqi", "oshiqchig'i")
- o'zbekcha gap ichida ORTIQCHA INGLIZCHA so'z yoki artikl ("Yangi telefonlar the ofisda")
- gap kichik harf bilan boshlanishi yoki nuqta yo'qligi
- tarjima ma'noni butunlay o'zgartirishi ("Agar pul desak" ← "Agar pul tejasak")

XATO DEB BELGILAMA:
- uslub, sinonim afzalligi, "yana misol qo'shsa bo'lardi"
- qoida qisqa yoki soddalashtirilgan (bu ataylab)
- noto'g'ri variantlar juda oson tuyulishi
- OXIRGI (3-) savol grammatikaga emas, unit lug'atiga oid bo'lishi — bu ATAYLAB
  shunday, dars so'zlarni ham tekshiradi. Buni "mavzuga aloqasiz" deb belgilama.

JAVOB FORMATI — qat'iy, boshqa hech narsa yozma:
Har bir muammo uchun bitta qator:
joy | muammo qisqa | taklif
"joy" — rule / example N / practice N
Hech qanday muammo topmasang, aynan shu bitta so'zni yoz: TOZA`;

function loadUnits(only) {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter(x => /^curriculum-[a-z0-9]+\.json$/.test(x))) {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    const lv = Object.keys(json)[0];
    if (only && lv !== only.toUpperCase()) continue;
    for (const u of json[lv]) if (u.lesson) out.push({ lv, u });
  }
  return out;
}

function unitText(u) {
  const L = u.lesson;
  return [
    `Unit: ${u.id} — ${u.title}`,
    `Grammatika: ${u.grammar}`,
    ``,
    `RULE:`,
    L.rule,
    ``,
    `EXAMPLES:`,
    ...L.examples.map((e, i) => `${i + 1}. ${e.en} — ${e.uz}${e.note ? ` (${e.note})` : ''}`),
    ``,
    `PRACTICE:`,
    ...L.practice.map((q, i) =>
      `${i + 1}. ${q.q}\n   variantlar: ${q.options.join(' / ')}\n   ko'rsatilgan javob: ${q.options[q.answer]}`),
  ].join('\n');
}

// Gemini RPM limiti — kunlik kvota emas. Backoffsiz 429 unitni jimgina
// "tekshirilgan" qatoriga qo'shib yuboradi va xato hisobotga tushmay qoladi.
const RETRY_DELAYS_MS = [8000, 20000, 45000];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkUnit(u) {
  for (let i = 0; ; i++) {
    const r = await checkOnce(u);
    if (!r.rateLimited || i >= RETRY_DELAYS_MS.length) return r;
    process.stdout.write(`429, ${RETRY_DELAYS_MS[i] / 1000}s kutamiz... `);
    await sleep(RETRY_DELAYS_MS[i]);
  }
}

async function checkOnce(u) {
  const res = await fetch(`${SB_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON },
    body: JSON.stringify({
      userId: UID,
      system: SYSTEM,
      messages: [{ role: 'user', content: unitText(u) }],
      mode: 'lesson_check',
      profile: { name: 'LessonCheck', level: 'C2', goal: 'general' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `${res.status} ${data.message || data.error || ''}`;
    return { error: msg, rateLimited: res.status === 429 || /rate|limit/i.test(msg) };
  }
  return { text: data.text || '' };
}

// Bir nechta skript parallel ishlaganda bitta uid ustidagi limit chalkashtiradi:
// rate-limit ham, per-user limit ham bir xil 429 bo'lib ko'rinadi. --uid bilan
// har bir yugurish o'z hisobiga chiqadi.
const argv = process.argv.slice(2);
const uidArg = argv.find(a => a.startsWith('--uid='));
if (uidArg) UID = uidArg.slice(6);
const only = argv.find(a => !a.startsWith('--'));
const units = loadUnits(only);
if (!units.length) { console.error("Dars topilmadi — avval build-lessons.mjs ni ishga tushiring"); process.exit(1); }

console.log(`${units.length} ta dars tekshiriladi...`);
const flagged = [];
const unchecked = [];   // chaqiruvi yiqilgan unitlar — "tekshirildi" deb hisoblanmaydi
let failed = 0;

for (const { lv, u } of units) {
  process.stdout.write(`  ${u.id} ... `);
  const r = await checkUnit(u);
  if (r.error) { console.log('XATO: ' + r.error); failed++; unchecked.push(u.id); continue; }
  const lines = r.text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 1 && /^TOZA$/i.test(lines[0])) { console.log('toza'); continue; }
  let n = 0;
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) continue;
    flagged.push({ lv, unit: u.id, where: parts[0], problem: parts[1], suggestion: parts[2] || '' });
    n++;
  }
  console.log(n ? `${n} ta shubha` : 'toza');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const md = [
  `# Dars tekshiruvi`,
  ``,
  // Yiqilgan chaqiruv "tekshirildi" emas — aks holda hisobot qamrovni oshirib
  // ko'rsatadi va tekshirilmagan unit toza deb o'ylanadi.
  `Tekshirildi: **${units.length - unchecked.length}** / ${units.length} dars${only ? ` (${only.toUpperCase()})` : ''}`,
  `Shubhali: **${flagged.length}**`,
  ...(unchecked.length ? [``, `> ⚠️ TEKSHIRILMAGAN (chaqiruv yiqildi): ${unchecked.join(', ')} — qayta ishga tushiring`] : []),
  ``,
  `> Bu AI taklifi, hukm emas. Har birini o'zingiz qaror qiling.`,
  ``,
  `| Unit | Joy | Muammo | Taklif |`,
  `|---|---|---|---|`,
  ...flagged.map(f => `| ${f.unit} | ${f.where} | ${f.problem} | ${f.suggestion} |`),
  ``,
].join('\n');
const out = path.join(OUT_DIR, `report${only ? '-' + only.toUpperCase() : ''}.md`);
fs.writeFileSync(out, md, 'utf8');
console.log(`\n${flagged.length} ta shubhali joy → ${out}`);
