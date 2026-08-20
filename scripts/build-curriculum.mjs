// data/curriculum-*.json fayllarini tekshirib, index.html ichidagi CURRICULUM blokini qayta yozadi.
// Ishga tushirish:  node scripts/build-curriculum.mjs
// Yangi daraja qo'shish: data/curriculum-b1.json yozib, LEVELS ro'yxatiga 'B1' qo'sh.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TASK_TYPES = ['translate', 'build', 'write', 'listen', 'speak', 'read'];
// Retseptiv = kirish (matn/audio), erkin produktiv = chiqish (ochiq javob).
// Har unitda ikkalasidan kamida bittadan bo'lishi shart: translate+build ning
// o'zi diskret mashq, u bilan o'quvchi ma'noga yo'naltirilgan kirish ham,
// erkin chiqish ham olmaydi.
const RECEPTIVE  = ['read', 'listen'];
const PRODUCTIVE = ['write', 'speak'];
const WORDS_PER_UNIT = 25;
const TASKS_PER_UNIT = 6;
const UNITS_PER_LEVEL = 12;
// Bosqichli dars (docs/specs/staged-lesson.md). `lesson` IXTIYORIY — yo'q unitda
// eski xatti-harakat qoladi (explain + so'zlar ro'yxati, mini-tekshiruvsiz).
const LESSON_EXAMPLES_MIN = 3;
const LESSON_EXAMPLES_MAX = 4;
const LESSON_QUIZ_TOTAL   = 3;
const LESSON_QUIZ_OPTIONS = 3;
const NO_WRITE_YET = ['A1-01', 'A1-02', 'A1-03'];   // bu unitlarda yozma vazifa hali erta
const NO_SPEAK_YET = ['A1-01'];                     // birinchi unit — avval so'zlar tanilsin
const CYRILLIC = /[Ѐ-ӿ]/;                 // o'zbekcha matn faqat lotin yozuvida

const errors = [];
const warnings = [];

// ── Bosqichli dars validatsiyasi ─────────────────────────────────
// Yarim yozilgan `lesson` yo'qidan battar: klient uni to'liq deb qabul qilib
// bo'sh ekran yoki javobsiz savol ko'rsatadi. Shuning uchun "bor bo'lsa — to'liq".
function validateLesson(u, errors, warnings) {
  const L = u.lesson;
  if (!L || typeof L !== 'object' || Array.isArray(L)) {
    errors.push(`${u.id}: lesson obyekt emas`);
    return;
  }
  const txt = (v, where) => {
    if (typeof v !== 'string' || !v.trim()) { errors.push(`${u.id}: ${where} bo'sh yoki matn emas`); return false; }
    if (CYRILLIC.test(v)) { errors.push(`${u.id}: ${where} ichida kirill harfi bor`); return false; }
    return true;
  };

  txt(L.rule, 'lesson.rule');

  const ex = L.examples;
  if (!Array.isArray(ex) || ex.length < LESSON_EXAMPLES_MIN || ex.length > LESSON_EXAMPLES_MAX) {
    errors.push(`${u.id}: lesson.examples soni ${Array.isArray(ex) ? ex.length : 0}, kutilgan ${LESSON_EXAMPLES_MIN}-${LESSON_EXAMPLES_MAX}`);
  } else {
    ex.forEach((e, k) => {
      if (!e || typeof e !== 'object') { errors.push(`${u.id}: lesson.examples[${k}] obyekt emas`); return; }
      txt(e.en, `lesson.examples[${k}].en`);
      txt(e.uz, `lesson.examples[${k}].uz`);
      // note ixtiyoriy, lekin bo'lsa kirillsiz
      if (e.note && CYRILLIC.test(e.note)) errors.push(`${u.id}: lesson.examples[${k}].note ichida kirill harfi bor`);
    });
    // Misollar unit lug'atidan uzilib qolmasin — bu ogohlantirish, xato emas.
    // Lug'atda ko'p so'zli birliklar ham bor ("put up with"), shuning uchun
    // bitta so'z bo'yicha qidirish yetmaydi — ibora sifatida ham tekshiriladi.
    const bag = (u.words || []).map(w => String(w && w.en || '').toLowerCase()).filter(Boolean);
    const single = new Set(bag.filter(w => !w.includes(' ')));
    const multi = bag.filter(w => w.includes(' '));
    const uses = ex.some(e => {
      const s = String(e && e.en || '').toLowerCase();
      if (multi.some(w => s.includes(w))) return true;
      return s.split(/[^a-z']+/).some(t => t && single.has(t));
    });
    if (bag.length && !uses) warnings.push(`${u.id}: lesson.examples unit so'zlaridan hech birini ishlatmayapti`);
  }

  const pr = L.practice;
  if (!Array.isArray(pr) || pr.length !== LESSON_QUIZ_TOTAL) {
    errors.push(`${u.id}: lesson.practice soni ${Array.isArray(pr) ? pr.length : 0}, kutilgan ${LESSON_QUIZ_TOTAL}`);
    return;
  }
  pr.forEach((p, k) => {
    if (!p || typeof p !== 'object') { errors.push(`${u.id}: lesson.practice[${k}] obyekt emas`); return; }
    txt(p.q, `lesson.practice[${k}].q`);
    const o = p.options;
    if (!Array.isArray(o) || o.length !== LESSON_QUIZ_OPTIONS) {
      errors.push(`${u.id}: lesson.practice[${k}].options soni ${Array.isArray(o) ? o.length : 0}, kutilgan ${LESSON_QUIZ_OPTIONS}`);
      return;
    }
    o.forEach((s, j) => txt(s, `lesson.practice[${k}].options[${j}]`));
    if (new Set(o.map(s => String(s).trim().toLowerCase())).size !== o.length) {
      errors.push(`${u.id}: lesson.practice[${k}] variantlari takror`);
    }
    if (!Number.isInteger(p.answer) || p.answer < 0 || p.answer >= LESSON_QUIZ_OPTIONS) {
      errors.push(`${u.id}: lesson.practice[${k}].answer ${p.answer} — 0..${LESSON_QUIZ_OPTIONS - 1} bo'lishi kerak`);
    }
  });
}
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

    for (const k of ['title', 'can', 'grammar', 'explain']) {
      if (typeof u[k] !== 'string' || !u[k].trim()) errors.push(`${u.id}: "${k}" bo'sh yoki matn emas`);
      else if (CYRILLIC.test(u[k])) errors.push(`${u.id}: "${k}" ichida kirill harfi bor — o'zbek lotin yozuvi kerak`);
    }

    if (!Array.isArray(u.words) || u.words.length !== WORDS_PER_UNIT) {
      errors.push(`${u.id}: so'z soni ${(u.words || []).length}, kutilgan ${WORDS_PER_UNIT}`);
    } else {
      // So'z = { en, uz, ipa }. Tarjima etalon bo'lishi shart — AI o'ylab topmasin.
      for (const w of u.words) {
        if (!w || typeof w !== 'object' || Array.isArray(w)) {
          errors.push(`${u.id}: so'z obyekt emas — { en, uz, ipa } kutilgan, kelgani: ${JSON.stringify(w)}`);
          continue;
        }
        let bad = false;
        for (const k of ['en', 'uz', 'ipa']) {
          if (typeof w[k] !== 'string' || !w[k].trim()) {
            errors.push(`${u.id}: "${w.en ?? '?'}" so'zida "${k}" bo'sh yoki matn emas`);
            bad = true;
          }
        }
        if (bad) continue;
        // Kirill harfi lotin harfiga juda o'xshaydi (а, е, о, с...) — ko'z bilan topib bo'lmaydi.
        if (CYRILLIC.test(w.uz)) {
          errors.push(`${u.id}: "${w.en}" tarjimasida kirill harfi bor — o'zbek lotin yozuvi kerak`);
          continue;
        }
        if (w.en !== w.en.toLowerCase()) {
          errors.push(`${u.id}: "${w.en}" — en kichik harfda bo'lsin`);
          continue;
        }
        if (seenWords.has(w.en)) errors.push(`${u.id}: "${w.en}" takror — ${seenWords.get(w.en)} da bor`);
        else seenWords.set(w.en, u.id);
      }
    }

    if (u.lesson !== undefined) validateLesson(u, errors, warnings);

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
      if (NO_SPEAK_YET.includes(u.id) && u.tasks.includes('speak')) {
        errors.push(`${u.id}: bu unitda speak hali erta`);
      }
      if (!NO_SPEAK_YET.includes(u.id) && !u.tasks.includes('speak')) {
        errors.push(`${u.id}: gapirish (speak) vazifasi yo'q`);
      }
      if (!u.tasks.some(t => RECEPTIVE.includes(t))) {
        errors.push(`${u.id}: retseptiv vazifa yo'q (${RECEPTIVE.join('/')})`);
      }
      // A1-01 da speak ham, write ham taqiqlangan — undan erkin chiqish talab qilinmaydi.
      const noProductiveAllowed = NO_SPEAK_YET.includes(u.id) && NO_WRITE_YET.includes(u.id);
      if (!noProductiveAllowed && !u.tasks.some(t => PRODUCTIVE.includes(t))) {
        errors.push(`${u.id}: erkin produktiv vazifa yo'q (${PRODUCTIVE.join('/')})`);
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
// explain ichida qator ko'chirish bor — \n ni ham qochirish shart, aks holda JS sintaksis xatosi.
const q = s => "'" + String(s)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n') + "'";
const wordJs = w => `        { en:${q(w.en)}, uz:${q(w.uz)}, ipa:${q(w.ipa)} },`;
const exJs   = e => `          { en:${q(e.en)}, uz:${q(e.uz)}, note:${q(e.note || '')} },`;
const prJs   = p => `          { q:${q(p.q)}, options:[${p.options.map(q).join(',')}], answer:${p.answer} },`;
// `lesson` yo'q unit — normal holat: klient explain + so'zlarga qaytadi.
const lessonJs = L => !L ? '' :
    `      lesson:{ rule:${q(L.rule)},\n`
  + `        examples:[\n${L.examples.map(exJs).join('\n')}\n        ],\n`
  + `        practice:[\n${L.practice.map(prJs).join('\n')}\n        ] },\n`;
const unitJs = u => `    { id:${q(u.id)}, title:${q(u.title)},\n`
  + `      can:${q(u.can)},\n`
  + `      grammar:${q(u.grammar)},\n`
  + `      explain:${q(u.explain)},\n`
  + lessonJs(u.lesson)
  + `      words:[\n${u.words.map(wordJs).join('\n')}\n      ],\n`
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
