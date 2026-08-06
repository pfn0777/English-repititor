// data/curriculum-*.json fayllarini tekshirib, index.html ichidagi CURRICULUM blokini qayta yozadi.
// Ishga tushirish:  node scripts/build-curriculum.mjs
// Yangi daraja qo'shish: data/curriculum-b1.json yozib, LEVELS ro'yxatiga 'B1' qo'sh.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['A1', 'A2'];
const TASK_TYPES = ['translate', 'build', 'write', 'listen'];
const WORDS_PER_UNIT = 25;
const TASKS_PER_UNIT = 6;
const UNITS_PER_LEVEL = 12;
const NO_WRITE_YET = ['A1-01', 'A1-02', 'A1-03'];   // bu unitlarda yozma vazifa hali erta

const errors = [];
const warnings = [];
const seenWords = new Map();   // so'z -> birinchi uchragan unit id
const curriculum = {};

for (const lv of LEVELS) {
  const file = path.join(ROOT, 'data', `curriculum-${lv.toLowerCase()}.json`);
  if (!fs.existsSync(file)) { errors.push(`${lv}: fayl yo'q — ${file}`); continue; }

  let units;
  try { units = JSON.parse(fs.readFileSync(file, 'utf8'))[lv]; }
  catch (e) { errors.push(`${lv}: JSON parse xatosi — ${e.message}`); continue; }

  if (!Array.isArray(units) || units.length !== UNITS_PER_LEVEL) {
    errors.push(`${lv}: unit soni ${Array.isArray(units) ? units.length : 0}, kutilgan ${UNITS_PER_LEVEL}`);
    continue;
  }

  units.forEach((u, i) => {
    const expectedId = `${lv}-${String(i + 1).padStart(2, '0')}`;
    if (u.id !== expectedId) errors.push(`${lv}[${i}]: id "${u.id}" != "${expectedId}"`);

    for (const k of ['title', 'can', 'grammar']) {
      if (typeof u[k] !== 'string' || !u[k].trim()) errors.push(`${u.id}: "${k}" bo'sh yoki matn emas`);
    }

    if (!Array.isArray(u.words) || u.words.length !== WORDS_PER_UNIT) {
      errors.push(`${u.id}: so'z soni ${(u.words || []).length}, kutilgan ${WORDS_PER_UNIT}`);
    } else {
      for (const w of u.words) {
        if (typeof w !== 'string' || !w.trim() || w !== w.toLowerCase()) {
          errors.push(`${u.id}: noto'g'ri so'z "${w}" (kichik harf, bo'sh emas)`);
          continue;
        }
        if (seenWords.has(w)) errors.push(`${u.id}: "${w}" takror — ${seenWords.get(w)} da bor`);
        else seenWords.set(w, u.id);
      }
    }

    if (!Array.isArray(u.tasks) || u.tasks.length !== TASKS_PER_UNIT) {
      errors.push(`${u.id}: vazifa soni ${(u.tasks || []).length}, kutilgan ${TASKS_PER_UNIT}`);
    } else {
      for (const t of u.tasks) {
        if (!TASK_TYPES.includes(t)) errors.push(`${u.id}: noma'lum vazifa turi "${t}"`);
      }
      if (!u.tasks.includes('translate') || !u.tasks.includes('build')) {
        errors.push(`${u.id}: translate va build majburiy`);
      }
      if (NO_WRITE_YET.includes(u.id) && u.tasks.includes('write')) {
        errors.push(`${u.id}: bu unitda write hali erta`);
      }
      for (let k = 1; k < u.tasks.length; k++) {
        if (u.tasks[k] === u.tasks[k - 1]) warnings.push(`${u.id}: ketma-ket bir xil tur "${u.tasks[k]}"`);
      }
    }
  });

  curriculum[lv] = units;
}

if (errors.length) {
  console.error('VALIDATSIYA YIQILDI:\n' + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
warnings.forEach(w => console.warn('  ogohlantirish: ' + w));

// ── JS blokini yasash ────────────────────────────────────────────
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const unitJs = u => `    { id:${q(u.id)}, title:${q(u.title)},\n`
  + `      can:${q(u.can)},\n`
  + `      grammar:${q(u.grammar)},\n`
  + `      words:[${u.words.map(q).join(',')}],\n`
  + `      tasks:[${u.tasks.map(q).join(',')}] },`;

const body = LEVELS.map(lv => `  ${lv}: [\n${curriculum[lv].map(unitJs).join('\n')}\n  ],`).join('\n');
const block = `// <curriculum:begin>\nconst CURRICULUM = {\n${body}\n};\n// <curriculum:end>`;

// ── index.html ga yozish ─────────────────────────────────────────
const htmlPath = path.join(ROOT, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const re = /\/\/ <curriculum:begin>[\s\S]*?\/\/ <curriculum:end>/;
if (!re.test(html)) {
  console.error("XATO: index.html da '// <curriculum:begin>' … '// <curriculum:end>' markerlari topilmadi");
  process.exit(1);
}
fs.writeFileSync(htmlPath, html.replace(re, block), 'utf8');

const total = LEVELS.reduce((n, lv) => n + curriculum[lv].length, 0);
console.log(`OK — ${LEVELS.join(', ')}: ${total} unit, ${seenWords.size} noyob so'z index.html ga yozildi`);
