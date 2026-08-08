// Curriculum tarjimalarini AI bilan tekshiradi va faqat SHUBHALI larini ro'yxat qiladi.
// data/curriculum-*.json dagi `uz` maydonlari o'quvchi uchun yagona etalon —
// ular qo'lda yozilgan va hech qanday manbaga solishtirilmagan. Bu skript qo'lda
// 1200 ta so'zni o'qib chiqish o'rniga e'tibor talab qiladigan 20-30 tasini topib beradi.
//
// Ishlatish:
//   node scripts/check-glosses.mjs            # barcha darajalar
//   node scripts/check-glosses.mjs B2         # faqat bitta daraja
//
// Jonli API'ga chiqadi va token sarflaydi (daraja boshiga ~5 chaqiruv).
// Natija: .gloss-check/report.md — faqat shubhali so'zlar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3dhdnFieGpmbGd0eGVwZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjAxMzEsImV4cCI6MjA5ODEzNjEzMX0.8RA7w_L6C3fy_ytaJl6ipETz2WZuamFhSGcIQGMOXXo';
// Tozalash: delete from usage where user_id='00000000-0000-4000-8000-000000000abc';
const TEST_UID = '00000000-0000-4000-8000-000000000abc';
const BATCH = 50;                    // bitta chaqiruvdagi so'zlar soni (payload 20000 belgi)
const OUT_DIR = path.join(ROOT, '.gloss-check');

const SYSTEM = `Sen ingliz-o'zbek lug'at muharrirsan. Vazifang — berilgan juftliklarni tekshirish.

Har juftlik: "word = tarjima (talaffuz)".

FAQAT quyidagi hollarda xato deb belgila:
- tarjima so'zning asosiy ma'nosini bermaydi yoki butunlay boshqa so'zni bildiradi
- tarjima o'quvchini chalg'itadi (masalan, fe'l o'rniga ot berilgan)
- talaffuz (IPA) jiddiy noto'g'ri
- o'zbekcha matnda imlo xatosi yoki kirill harfi bor

XATO DEB BELGILAMA:
- tarjima to'g'ri, lekin sen boshqa sinonimni afzal ko'rgan bo'larding
- tarjima qisqa yoki faqat bitta ma'noni bergan (bu ataylab — bu boshlang'ich lug'at)
- uslub yoki shevaga oid did masalalari

JAVOB FORMATI — qat'iy, boshqa hech narsa yozma:
Har bir shubhali so'z uchun bitta qator:
word | muammo qisqa | taklif qilingan tarjima
Hech qanday muammo topmasang, aynan shu bitta so'zni yoz: TOZA`;

function loadLevels(only) {
  const files = fs.readdirSync(path.join(ROOT, 'data'))
    .filter(f => /^curriculum-[a-z0-9]+\.json$/.test(f));
  const out = [];
  for (const f of files) {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    const lv = Object.keys(json)[0];
    if (only && lv !== only.toUpperCase()) continue;
    for (const u of json[lv]) {
      for (const w of u.words) out.push({ lv, unit: u.id, ...w });
    }
  }
  return out;
}

async function checkBatch(words) {
  const list = words.map(w => `${w.en} = ${w.uz} (${w.ipa})`).join('\n');
  const res = await fetch(`${SB_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON },
    body: JSON.stringify({
      userId: TEST_UID,
      system: SYSTEM,
      messages: [{ role: 'user', content: list }],
      mode: 'gloss_check',
      profile: { name: 'GlossCheck', level: 'C2', goal: 'general' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `${res.status} ${data.message || data.error || ''}` };
  return { text: data.text || '' };
}

const only = process.argv[2];
const words = loadLevels(only);
if (!words.length) { console.error('So\'z topilmadi'); process.exit(1); }

const byEn = new Map(words.map(w => [w.en, w]));
console.log(`${words.length} ta so'z, ${Math.ceil(words.length / BATCH)} ta chaqiruv...`);

const flagged = [];
let failed = 0;
for (let i = 0; i < words.length; i += BATCH) {
  const chunk = words.slice(i, i + BATCH);
  const r = await checkBatch(chunk);
  if (r.error) { console.error(`  [${i}] XATO: ${r.error}`); failed++; continue; }
  const lines = r.text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 1 && /^TOZA$/i.test(lines[0])) {
    console.log(`  [${i}-${i + chunk.length}] toza`);
    continue;
  }
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) continue;
    const w = byEn.get(parts[0].toLowerCase().replace(/[*`]/g, ''));
    if (!w) continue;   // model o'zi o'ylab topgan so'z — tashlab ketamiz
    flagged.push({ ...w, problem: parts[1], suggestion: parts[2] || '' });
  }
  console.log(`  [${i}-${i + chunk.length}] ${lines.length} qator`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const md = [
  `# Tarjima tekshiruvi`,
  ``,
  `Tekshirildi: **${words.length}** so'z${only ? ` (${only.toUpperCase()})` : ''}`,
  `Shubhali: **${flagged.length}**${failed ? ` · ${failed} ta chaqiruv yiqildi` : ''}`,
  ``,
  `> Bu AI taklifi, hukm emas. Har birini o'zingiz qaror qiling.`,
  ``,
  `| Unit | So'z | Hozirgi tarjima | Muammo | Taklif |`,
  `|---|---|---|---|---|`,
  ...flagged.map(f => `| ${f.unit} | \`${f.en}\` | ${f.uz} | ${f.problem} | ${f.suggestion} |`),
  ``,
].join('\n');
const out = path.join(OUT_DIR, `report${only ? '-' + only.toUpperCase() : ''}.md`);
fs.writeFileSync(out, md, 'utf8');
console.log(`\n${flagged.length} ta shubhali so'z → ${out}`);
