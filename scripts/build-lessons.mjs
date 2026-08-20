// Har unit uchun bosqichli dars datasini (`lesson`) AI bilan generatsiya qiladi
// va data/curriculum-*.json ga QAYTARIB YOZADI. index.html ga tegmaydi —
// u build-curriculum.mjs ning ishi.
//
// Ishlatish:
//   node scripts/build-lessons.mjs             # `lesson` yo'q barcha unitlar
//   node scripts/build-lessons.mjs A1          # faqat bitta daraja
//   node scripts/build-lessons.mjs A1 --force  # mavjudini ham qayta yozadi
//
// Jonli API'ga chiqadi va token sarflaydi (unit boshiga 1 chaqiruv).
// Generatsiyadan keyin SHART:
//   node scripts/check-lessons.mjs      → sifat hisoboti
//   node scripts/build-curriculum.mjs   → index.html ga yozish

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3dhdnFieGpmbGd0eGVwZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjAxMzEsImV4cCI6MjA5ODEzNjEzMX0.8RA7w_L6C3fy_ytaJl6ipETz2WZuamFhSGcIQGMOXXo';
let UID = '00000000-0000-4000-8000-000000000abc';   // --uid= bilan almashtiriladi
const QUIZ_TOTAL = 3;
const QUIZ_OPTIONS = 3;

const SYSTEM = `Sen o'zbek o'quvchilarga ingliz tili o'rgatuvchi tajribali repetitorsan.
Vazifang — berilgan unit uchun QISQA dars materiali tuzish.

QAT'IY JAVOB FORMATI — faqat JSON, boshqa hech narsa yozma (izoh ham, \`\`\` ham yo'q):
{
  "rule": "...",
  "examples": [ { "en": "...", "uz": "...", "note": "..." }, ... ],
  "practice": [ { "q": "...", "options": ["...","...","..."], "answer": 0 }, ... ]
}

QOIDALAR:
- "rule": o'zbek tilida (lotin yozuvi), 400-900 belgi. Formula + qachon ishlatilishi.
  O'zbek tilidan farqni ko'rsat — o'quvchi aynan shu joyda adashadi.
  Qator ko'chirish uchun \\n ishlat. Grammatik atamalarni minimal ishlat.
- "examples": aynan 4 ta. Har biri { en, uz, note }. Jumlalar unit so'zlaridan tuzilsin.
  "note" — qisqa (60 belgigacha) eslatma, nima uchun aynan shunday. Bo'sh bo'lishi mumkin.
  HAR BIR misol o'rgatilayotgan GRAMMATIK SHAKLNI ko'rsatishi SHART — unit so'zini
  ishlatish yetarli emas. Kauzativ darsida "She wants to renovate her apartment"
  YARAMAYDI (bu kauzativ emas); "She wants to have her apartment renovated" — mana bu.
  Majhul nisbat darsida aktiv nisbatdagi misol bo'lmasin.
  Tarjima aynan shu ma'noni bersin — ortiqcha sababiyat yoki zamon qo'shma.
- Har bir jumla HAYOTIY bo'lsin. Grammatikasi to'g'ri, lekin odam aytmaydigan gap
  ("I live in an office", "He stopped to proceed on the way") — xato hisoblanadi.
- "practice": aynan ${QUIZ_TOTAL} ta savol, har birida aynan ${QUIZ_OPTIONS} ta variant.
  "answer" — to'g'ri variant indeksi (0, 1 yoki 2).
  1-2 savol grammatikaga, oxirgisi unit so'zlariga.
  Noto'g'ri variantlar TIPIK XATO bo'lsin (masalan "I is"), tasodifiy so'z emas.
  Faqat bitta variant to'g'ri bo'lishi SHART.
- Butun o'zbekcha matn LOTIN yozuvida. Kirill harfi (а, е, о, с) mutlaqo mumkin emas.
- Ingliz tilidagi jumlalar grammatik jihatdan benuqson bo'lsin.`;

function loadFiles(only) {
  return fs.readdirSync(path.join(ROOT, 'data'))
    .filter(f => /^curriculum-[a-z0-9]+\.json$/.test(f))
    .map(f => {
      const file = path.join(ROOT, 'data', f);
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      const lv = Object.keys(json)[0];
      return { file, json, lv };
    })
    .filter(x => !only || x.lv === only.toUpperCase());
}

function unitPrompt(u, lv) {
  return [
    `Daraja: ${lv}`,
    `Unit: ${u.id} — ${u.title}`,
    `Maqsad: ${u.can}`,
    `Grammatika: ${u.grammar}`,
    `Mavjud qisqa izoh: ${u.explain}`,
    `Unit so'zlari: ${u.words.map(w => `${w.en} = ${w.uz}`).join(', ')}`,
  ].join('\n');
}

// Gemini'ning RPM limiti bir nechta skript parallel ishlaganda tez uriladi.
// Bu kunlik kvota EMAS — bir necha soniya kutib qayta so'rasa o'tadi. Backoffsiz
// esa 429 "unit yiqildi" bo'lib ko'rinadi va dars jimgina yozilmay qoladi.
const RETRY_DELAYS_MS = [8000, 20000, 45000];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function askOne(u, lv) {
  for (let i = 0; ; i++) {
    const r = await askOnce(u, lv);
    if (!r.rateLimited || i >= RETRY_DELAYS_MS.length) return r;
    process.stdout.write(`429, ${RETRY_DELAYS_MS[i] / 1000}s kutamiz... `);
    await sleep(RETRY_DELAYS_MS[i]);
  }
}

async function askOnce(u, lv) {
  const res = await fetch(`${SB_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON },
    body: JSON.stringify({
      userId: UID,
      system: SYSTEM,
      messages: [{ role: 'user', content: unitPrompt(u, lv) }],
      mode: 'lesson_build',
      profile: { name: 'LessonBuild', level: 'C2', goal: 'general' },
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
  try { return { lesson: JSON.parse(txt.slice(a, b + 1)) }; }
  catch (e) { return { error: 'JSON parse: ' + e.message }; }
}

// Yarim data yo'qidan battar — klient uni to'liq deb qabul qiladi.
// Shuning uchun shakli noto'g'ri natijani saqlamaymiz.
function shapeError(L) {
  if (!L || typeof L !== 'object') return 'obyekt emas';
  if (typeof L.rule !== 'string' || L.rule.trim().length < 100) return 'rule qisqa yoki yo\'q';
  if (!Array.isArray(L.examples) || L.examples.length < 3 || L.examples.length > 4) return 'examples 3-4 ta emas';
  for (const e of L.examples) {
    if (!e || !e.en || !e.uz) return 'examples ichida en/uz yo\'q';
  }
  if (!Array.isArray(L.practice) || L.practice.length !== QUIZ_TOTAL) return `practice ${QUIZ_TOTAL} ta emas`;
  for (const q of L.practice) {
    if (!q || typeof q.q !== 'string' || !q.q.trim()) return 'practice.q yo\'q';
    if (!Array.isArray(q.options) || q.options.length !== QUIZ_OPTIONS) return `options ${QUIZ_OPTIONS} ta emas`;
    if (new Set(q.options.map(s => String(s).trim().toLowerCase())).size !== QUIZ_OPTIONS) return 'options takror';
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= QUIZ_OPTIONS) return 'answer oralig\'idan tashqarida';
  }
  if (/[Ѐ-ӿ]/.test(JSON.stringify(L))) return 'kirill harfi bor';
  return null;
}

// JSON.stringify har so'zni 5 qatorga yoyadi va butun faylni o'zgargan qilib
// ko'rsatadi — 1800 satrlik diff ichida bitta yangi dars ko'rinmay qoladi.
// Shuning uchun kichik obyektlar va satr massivlari bir qatorga yig'iladi.
function compact(json) {
  return JSON.stringify(json, null, 2)
    // { "en": ..., "uz": ..., "ipa": ... } va { "en": ..., "uz": ..., "note": ... }
    .replace(/\{\s*\n\s*("(?:en|q)"[\s\S]{0,400}?)\n\s*\}/g,
      (m, inner) => '{ ' + inner.split('\n').map(s => s.trim()).join(' ') + ' }')
    // ["a", "b", "c"] — variantlar
    .replace(/\[\s*\n\s*("(?:[^"\\]|\\.)*"(?:,\s*\n\s*"(?:[^"\\]|\\.)*")*)\s*\n\s*\]/g,
      (m, inner) => '[' + inner.split('\n').map(s => s.trim()).join(' ') + ']')
    + '\n';
}

const args  = process.argv.slice(2);
const force = args.includes('--force');
const only  = args.find(a => !a.startsWith('--'));

const files = loadFiles(only);
if (!files.length) { console.error('Fayl topilmadi'); process.exit(1); }

let made = 0, skipped = 0, failed = 0;
for (const { file, json, lv } of files) {
  let dirty = false;
  for (const u of json[lv]) {
    if (u.lesson && !force) { skipped++; continue; }
    process.stdout.write(`  ${u.id} ... `);
    const r = await askOne(u, lv);
    if (r.error) { console.log('XATO: ' + r.error); failed++; continue; }
    const bad = shapeError(r.lesson);
    if (bad) { console.log('SHAKL XATO: ' + bad); failed++; continue; }
    // note maydonini normallashtiramiz — validator uni ixtiyoriy deb biladi.
    r.lesson.examples = r.lesson.examples.map(e => ({ en: e.en, uz: e.uz, note: e.note || '' }));
    u.lesson = r.lesson;
    dirty = true; made++;
    console.log('OK');
  }
  if (dirty) fs.writeFileSync(file, compact(json), 'utf8');
}

console.log(`\n${made} ta dars yozildi · ${skipped} ta o'tkazildi (mavjud) · ${failed} ta yiqildi`);
console.log('Keyingi: node scripts/check-lessons.mjs && node scripts/build-curriculum.mjs');
process.exit(failed ? 1 : 0);
