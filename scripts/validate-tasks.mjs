// data/tasks-*.json fayllarining SHAKLINI tekshiradi (docs/specs/offline-tasks.md).
// API'ga chiqmaydi, token sarflamaydi — sof struktura validatori.
//
// Ishlatish:
//   node scripts/validate-tasks.mjs        # topilgan hamma tasks-*.json
//   node scripts/validate-tasks.mjs A1     # faqat bitta daraja
//
// build-tasks.mjs bu fayldan validateTask() ni import qiladi — shuning uchun
// CLI qismi faqat fayl to'g'ridan-to'g'ri ishga tushirilganda bajariladi.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CYRILLIC = /[Ѐ-ӿ]/;                 // o'zbekcha matn faqat lotin yozuvida
// o' / g' — o'zbekcha harf. Inglizcha maydonda uchrasa, tillar aralashib ketgan.
// Lekin inglizchaning o'zida ham apostrof bor ("dog's", "o'clock", "don't") —
// avval o'sha shakllar olib tashlanadi, keyin qolganida o'/g' qidiriladi.
// O'zbekcha "o'sha", "do'st" da apostrofdan keyingi "s" so'z oxiri emas, shuning
// uchun ular istisnoga tushmaydi va baribir tutiladi.
const EN_APOSTROPHE = /\bo['’]clock\b|[A-Za-z]['’](s|t|d|m|re|ve|ll)\b/gi;
const UZ_APOSTROPHE_RE = /[ogOG]['’ʻʼ]/;
const hasUzApostrophe = v => UZ_APOSTROPHE_RE.test(String(v).replace(EN_APOSTROPHE, ' '));
const TILES_MAX = 12;                     // plitkalar telefon ekraniga sig'sin
const ITEMS_PER_TASK = 5;                 // PASS_THRESHOLD = 0.8 → 4/5 o'tadi
const OPTIONS_PER_MCQ = 4;
const EXAM_TOTAL = 8;
const LEVEL_EXAM_TOTAL = 10;
const DISTRACTORS_MIN = 2;
const DISTRACTORS_MAX = 4;
const ORDER_SENTENCES = 5;
const SAME_ANSWER_WARN = 4;               // 5 banddan 4 tasi bir xil indeks — model 0 ni yaxshi ko'radi
const UNIT_WORDS_MIN = 5;                 // unitdan kamida shuncha so'z ishlatilsin
const DICTATE_MAX_WORDS = 8;              // quloqdan yig'ish qiyin
// read matni uzunligi darajaga qarab, listen esa hamma darajada bir xil.
const READ_WORDS = { A1: [60, 90], A2: [60, 90], B1: [100, 140], B2: [100, 140], C1: [150, 200], C2: [150, 200] };
const LISTEN_WORDS = [60, 100];

const TILE_TYPES = ['translate', 'build', 'dictate'];
const MCQ_TYPES = ['read', 'listen'];
const OFFLINE_TYPE = { speak: 'dictate', write: 'order' };

// Onlayn tur → offline tur. Shablon taxmin qilinmaydi, curriculum'dagi
// haqiqiy `tasks` massividan chiqadi (NO_WRITE_YET / NO_SPEAK_YET istisnolari).
export function offlineTypeOf(onlineType) {
  return OFFLINE_TYPE[onlineType] || onlineType;
}

// ── Kichik yordamchilar ──────────────────────────────────────────
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = v => (typeof v === 'string' ? v : '');
const nonEmpty = v => typeof v === 'string' && v.trim() !== '';

// Plitka taqqoslash uchun: chetdagi tinish belgilari tashlanadi, so'z ichidagi
// apostrof ("don't", "it's") SAQLANADI — u so'zning bir qismi.
function tokens(s) {
  return str(s)
    .split(/\s+/)
    .map(w => w.replace(/^[.,!?;:"“”()«»]+|[.,!?;:"“”()«»]+$/g, '').toLowerCase())
    .filter(Boolean);
}

// Ko'p to'plam (multiset): takrorlanuvchi so'z soni ham hisobga olinadi —
// "the cat and the dog" da `the` ikki marta bo'lishi shart.
function bagOf(list) {
  const m = new Map();
  for (const t of list) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function bagEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, n] of a) if (b.get(k) !== n) return false;
  return true;
}

function bagText(m) {
  return [...m.entries()].map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).sort().join(' ');
}

// So'z shakli: lug'atdagi "study" gapda "studies" bo'lib kelishi normal.
// Uch xil hodisa qamraladi, va uchalasi ham amalda uchradi:
//   qo'shimcha (study → studies), undosh ikkilanishi (sit → sitting),
//   noto'g'ri fe'l (go → went). Ularsiz validator to'g'ri kontentni rad etadi.
const IRREGULAR = {
  be:['am','is','are','was','were','been','being'], go:['went','gone'], do:['does','did','done'],
  have:['has','had'], say:['said'], get:['got','gotten'], make:['made'], know:['knew','known'],
  think:['thought'], take:['took','taken'], see:['saw','seen'], come:['came'], want:['wanted'],
  give:['gave','given'], find:['found'], tell:['told'], become:['became'], leave:['left'],
  feel:['felt'], put:['put'], bring:['brought'], begin:['began','begun'], keep:['kept'],
  hold:['held'], write:['wrote','written'], stand:['stood'], hear:['heard'], let:['let'],
  mean:['meant'], set:['set'], meet:['met'], run:['ran'], pay:['paid'], sit:['sat'],
  speak:['spoke','spoken'], lie:['lay','lain'], lead:['led'], read:['read'], grow:['grew','grown'],
  lose:['lost'], fall:['fell','fallen'], send:['sent'], build:['built'], understand:['understood'],
  draw:['drew','drawn'], break:['broke','broken'], spend:['spent'], cut:['cut'], rise:['rose','risen'],
  drive:['drove','driven'], buy:['bought'], wear:['wore','worn'], choose:['chose','chosen'],
  eat:['ate','eaten'], teach:['taught'], catch:['caught'], drink:['drank','drunk'],
  sleep:['slept'], win:['won'], forget:['forgot','forgotten'], swim:['swam','swum'],
  fly:['flew','flown'], sing:['sang','sung'], wake:['woke','woken'], ride:['rode','ridden'],
};
const VOWEL = /[aeiou]/;
function formsMatch(word, tok) {
  if (tok === word) return true;
  const w = word;
  const cands = [w + 's', w + 'es', w + 'd', w + 'ed', w + 'ing'];
  if (w.endsWith('e')) cands.push(w.slice(0, -1) + 'ing', w.slice(0, -1) + 'ed');
  if (w.endsWith('y')) cands.push(w.slice(0, -1) + 'ies', w.slice(0, -1) + 'ied');
  // Sifatning qiyosiy/orttirma shakli: heavy -> heavier, high -> highest.
  // Busiz validator to'g'ri kontentni rad etadi va yozuvchi qiyoslash unitida
  // faqat "more/the most" oladigan so'zlarni tanlashga majbur bo'ladi.
  cands.push(w + 'er', w + 'est');
  if (w.endsWith('e')) cands.push(w + 'r', w + 'st');
  if (w.endsWith('y')) cands.push(w.slice(0, -1) + 'ier', w.slice(0, -1) + 'iest');
  // CVC oxiri: sit → sitting, stop → stopped, plan → planned
  const last = w.slice(-1), prev = w.slice(-2, -1), pre2 = w.slice(-3, -2);
  if (w.length >= 3 && !VOWEL.test(last) && VOWEL.test(prev) && !VOWEL.test(pre2) && !'wxy'.includes(last)) {
    cands.push(w + last + 'ing', w + last + 'ed', w + last + 'er', w + last + 'est');
  }
  if (IRREGULAR[w] && IRREGULAR[w].includes(tok)) return true;
  return cands.includes(tok);
}

function hasWord(en, word) {
  const w = String(word).trim().toLowerCase();
  if (!w) return false;
  if (w.includes(' ')) return str(en).toLowerCase().includes(w);   // "put up with" kabi iboralar
  return tokens(en).some(t => formsMatch(w, t));
}

// ── Javob indeksini normallashtirish ────────────────────────────────────────
// Model to'g'ri javobni deyarli doim 0-indeksga qo'yadi: A1 da 5 ta vazifada
// 4-5 band bir xil indeksda chiqdi. Bunda o'quvchi doim birinchi variantni
// bosib 5/5 oladi va baho hech narsani o'lchamaydi. Promptda so'rash yetmadi —
// shuning uchun indeks generatsiyadan KEYIN mexanik ravishda taqsimlanadi.
// Aralashtirish DETERMINISTIK: urug' savol matnidan olinadi, ya'ni bir xil
// data har safar bir xil natija beradi va diff shovqin qilmaydi.
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Bandning to'g'ri javobini kerakli indeksga ko'chiradi (variantlar o'rin almashadi).
function moveAnswer(mcq, target) {
  const from = mcq.answer;
  if (from === target) return mcq;
  const opts = mcq.options.slice();
  [opts[from], opts[target]] = [opts[target], opts[from]];
  return { ...mcq, options: opts, answer: target };
}

// Bir vazifadagi savollar bo'ylab to'g'ri javob indeksini teng taqsimlaydi.
// Boshlang'ich siljish savol matnidan chiqadi — hamma vazifa bir xil
// 0,1,2,3,0... naqshiga tushib qolmasin.
export function spreadAnswers(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const start = seedOf(String(items[0] && items[0].q || '')) % OPTIONS_PER_MCQ;
  return items.map((m, i) => (
    m && Array.isArray(m.options) && m.options.length === OPTIONS_PER_MCQ
      && Number.isInteger(m.answer) && m.answer >= 0 && m.answer < OPTIONS_PER_MCQ
      ? moveAnswer(m, (start + i) % OPTIONS_PER_MCQ)
      : m
  ));
}

// Har qanday matnli maydon uchun umumiy tekshiruv.
function textChecks(v, where, out, { english = false } = {}) {
  if (!nonEmpty(v)) { out.push(`${where} bo'sh yoki matn emas`); return false; }
  if (CYRILLIC.test(v)) { out.push(`${where} ichida kirill harfi bor`); return false; }
  if (english && hasUzApostrophe(v)) {
    out.push(`${where} — inglizcha maydonda o'zbekcha apostrofli harf (o'/g') bor: "${v}"`);
    return false;
  }
  return true;
}

// ── <mcq> ────────────────────────────────────────────────────────
// Bitta variantli savolni tekshiradi. `where` — xato matnida ko'rinadigan joy nomi.
export function validateMcq(mcq, where) {
  const out = [];
  if (!isObj(mcq)) { out.push(`${where}: obyekt emas`); return out; }

  textChecks(mcq.q, `${where}.q`, out);

  const o = mcq.options;
  if (!Array.isArray(o) || o.length !== OPTIONS_PER_MCQ) {
    out.push(`${where}.options soni ${Array.isArray(o) ? o.length : 0}, kutilgan ${OPTIONS_PER_MCQ}`);
  } else {
    o.forEach((s, j) => textChecks(s, `${where}.options[${j}]`, out));
    if (new Set(o.map(s => str(s).trim().toLowerCase())).size !== o.length) {
      out.push(`${where}: variantlar takror`);
    }
  }

  if (!Number.isInteger(mcq.answer) || mcq.answer < 0 || mcq.answer >= OPTIONS_PER_MCQ) {
    out.push(`${where}.answer ${mcq.answer} — 0..${OPTIONS_PER_MCQ - 1} butun son bo'lishi kerak`);
  }
  return out;
}

// ── Plitkali band (translate / build / dictate) ──────────────────
function validateTileItem(it, where, out) {
  if (!isObj(it)) { out.push(`${where}: obyekt emas`); return; }

  const enOk = textChecks(it.en, `${where}.en`, out, { english: true });
  textChecks(it.uz, `${where}.uz`, out);

  const tiles = it.tiles;
  if (!Array.isArray(tiles) || !tiles.length) {
    out.push(`${where}.tiles massiv emas yoki bo'sh`);
  } else {
    tiles.forEach((t, j) => textChecks(t, `${where}.tiles[${j}]`, out, { english: true }));
    if (enOk) {
      const a = bagOf(tiles.flatMap(tokens));
      const b = bagOf(tokens(it.en));
      if (!bagEqual(a, b)) {
        out.push(`${where}.tiles "en" bilan mos emas — plitkalar: [${bagText(a)}], en: [${bagText(b)}]`);
      }
    }
  }

  const d = it.distractors;
  if (!Array.isArray(d) || d.length < DISTRACTORS_MIN || d.length > DISTRACTORS_MAX) {
    out.push(`${where}.distractors soni ${Array.isArray(d) ? d.length : 0}, kutilgan ${DISTRACTORS_MIN}-${DISTRACTORS_MAX}`);
  } else {
    d.forEach((t, j) => textChecks(t, `${where}.distractors[${j}]`, out, { english: true }));
    if (Array.isArray(tiles)) {
      const tset = new Set(tiles.map(t => str(t).trim().toLowerCase()));
      const clash = d.filter(t => tset.has(str(t).trim().toLowerCase()));
      if (clash.length) out.push(`${where}.distractors tiles bilan kesishadi: ${clash.join(', ')}`);
    }
  }

  const nTiles = Array.isArray(tiles) ? tiles.length : 0;
  const nDis = Array.isArray(d) ? d.length : 0;
  if (nTiles + nDis > TILES_MAX) {
    out.push(`${where}: plitka soni ${nTiles + nDis}, ${TILES_MAX} dan oshmasin`);
  }

  if (it.alt !== undefined && !Array.isArray(it.alt)) out.push(`${where}.alt massiv emas`);
  else if (Array.isArray(it.alt)) it.alt.forEach((s, j) => textChecks(s, `${where}.alt[${j}]`, out, { english: true }));
}

// ── <task> ───────────────────────────────────────────────────────
// Bitta vazifani tekshiradi. Xato matnlari massivini qaytaradi; bo'sh massiv = toza.
// ctx = { level, unitId, expectedType, words: [{en,uz,ipa}, ...] }
export function validateTask(task, ctx) {
  const out = [];
  const c = ctx || {};
  const unitId = c.unitId || '?';
  const type = c.expectedType;
  const where0 = `${unitId} ${type || '?'}`;

  if (!isObj(task)) { out.push(`${where0}: vazifa obyekt emas`); return out; }
  if (task.type !== type) {
    out.push(`${where0}: type "${task.type}" != kutilgan "${type}"`);
    return out;   // turi noto'g'ri bo'lsa qolgan tekshiruvlar ma'nosiz
  }

  if (MCQ_TYPES.includes(type)) {
    textChecks(task.text, `${where0}.text`, out, { english: true });
    const items = task.items;
    if (!Array.isArray(items) || items.length !== ITEMS_PER_TASK) {
      out.push(`${where0}.items soni ${Array.isArray(items) ? items.length : 0}, kutilgan ${ITEMS_PER_TASK}`);
    } else {
      items.forEach((m, k) => out.push(...validateMcq(m, `${where0}.items[${k}]`)));
    }
    return out;
  }

  if (TILE_TYPES.includes(type)) {
    const items = task.items;
    if (!Array.isArray(items) || items.length !== ITEMS_PER_TASK) {
      out.push(`${where0}.items soni ${Array.isArray(items) ? items.length : 0}, kutilgan ${ITEMS_PER_TASK}`);
      return out;
    }
    items.forEach((it, k) => validateTileItem(it, `${where0}.items[${k}]`, out));

    if (type === 'build') {
      // Lug'at etalon: `uz` o'ylab topilmaydi, curriculum'dan AYNAN ko'chiriladi.
      const vocab = new Map((c.words || [])
        .filter(w => w && typeof w.en === 'string')
        .map(w => [w.en.trim().toLowerCase(), str(w.uz).trim()]));
      const seen = new Set();
      items.forEach((it, k) => {
        if (!isObj(it)) return;
        const where = `${where0}.items[${k}]`;
        const w = str(it.word).trim().toLowerCase();
        if (!w) { out.push(`${where}.word bo'sh yoki matn emas`); return; }
        if (seen.has(w)) out.push(`${where}.word "${w}" takror — 5 ta so'z har xil bo'lsin`);
        else seen.add(w);
        if (!vocab.has(w)) out.push(`${where}.word "${w}" unit lug'atida yo'q`);
        else if (str(it.uz).trim() !== vocab.get(w)) {
          out.push(`${where}.uz "${str(it.uz).trim()}" != curriculum tarjimasi "${vocab.get(w)}"`);
        }
        if (!hasWord(it.en, w)) out.push(`${where}: "${w}" so'zi "en" ichida yo'q`);
      });
    }
    return out;
  }

  if (type === 'order') {
    textChecks(task.topic, `${where0}.topic`, out, { english: true });
    textChecks(task.topicUz, `${where0}.topicUz`, out);
    const s = task.sentences;
    if (!Array.isArray(s) || s.length !== ORDER_SENTENCES) {
      out.push(`${where0}.sentences soni ${Array.isArray(s) ? s.length : 0}, kutilgan ${ORDER_SENTENCES}`);
    } else {
      s.forEach((x, k) => textChecks(x, `${where0}.sentences[${k}]`, out, { english: true }));
      if (new Set(s.map(x => str(x).trim().toLowerCase())).size !== s.length) {
        out.push(`${where0}.sentences takror`);
      }
    }
    return out;
  }

  out.push(`${where0}: noma'lum vazifa turi "${type}"`);
  return out;
}

// ── Ogohlantirishlar (exit kodga ta'sir qilmaydi) ────────────────
function taskWarnings(task, ctx, warnings) {
  if (!isObj(task)) return;
  const unitId = ctx.unitId;
  const where0 = `${unitId} ${task.type}`;

  if (Array.isArray(task.items) && MCQ_TYPES.includes(task.type)) {
    const idx = task.items.filter(isObj).map(m => m.answer).filter(Number.isInteger);
    const freq = bagOf(idx);
    for (const [k, n] of freq) {
      if (n >= SAME_ANSWER_WARN) warnings.push(`${where0}: ${n} ta savolda answer = ${k} — indekslarni aralashtir`);
    }
  }

  if (MCQ_TYPES.includes(task.type)) {
    const n = tokens(task.text).length;
    const [lo, hi] = task.type === 'listen' ? LISTEN_WORDS : (READ_WORDS[ctx.level] || LISTEN_WORDS);
    if (n && (n < lo || n > hi)) warnings.push(`${where0}: matn ${n} so'z, kutilgan ${lo}-${hi}`);
  }

  if (task.type === 'dictate' && Array.isArray(task.items)) {
    task.items.forEach((it, k) => {
      if (!isObj(it)) return;
      const n = tokens(it.en).length;
      if (n > DICTATE_MAX_WORDS) warnings.push(`${where0}.items[${k}]: ${n} so'z — ${DICTATE_MAX_WORDS} dan uzun`);
    });
  }
}

// Unitning barcha inglizcha matnida lug'atdan nechta so'z ishlatilganini sanaydi.
function unitWordUse(unitTasks, words) {
  const text = [];
  for (const t of unitTasks) {
    if (!isObj(t)) continue;
    if (nonEmpty(t.text)) text.push(t.text);
    if (Array.isArray(t.sentences)) text.push(...t.sentences.filter(nonEmpty));
    if (Array.isArray(t.items)) {
      for (const it of t.items) {
        if (!isObj(it)) continue;
        if (nonEmpty(it.en)) text.push(it.en);
        if (Array.isArray(it.options)) text.push(...it.options.filter(nonEmpty));
      }
    }
  }
  const blob = text.join(' ');
  const toks = new Set(tokens(blob));
  let n = 0;
  for (const w of words || []) {
    const en = str(w && w.en).trim().toLowerCase();
    if (!en) continue;
    if (en.includes(' ') ? blob.toLowerCase().includes(en) : [...toks].some(t => formsMatch(en, t))) n++;
  }
  return n;
}

// ── Butun daraja ─────────────────────────────────────────────────
// tasksJson — data/tasks-<lv>.json mazmuni, curriculumJson — data/curriculum-<lv>.json mazmuni.
export function validateLevel(tasksJson, curriculumJson) {
  const errors = [];
  const warnings = [];

  if (!isObj(tasksJson)) { errors.push('tasks fayli obyekt emas'); return { errors, warnings }; }
  const lv = str(tasksJson.level).trim();
  if (!lv) { errors.push('"level" maydoni bo\'sh yoki matn emas'); return { errors, warnings }; }

  const curUnits = isObj(curriculumJson) ? curriculumJson[lv] : null;
  if (!Array.isArray(curUnits)) {
    errors.push(`${lv}: curriculum faylida "${lv}" darajasi topilmadi`);
    return { errors, warnings };
  }

  const units = tasksJson.units;
  if (!Array.isArray(units) || units.length !== curUnits.length) {
    errors.push(`${lv}: unit soni ${Array.isArray(units) ? units.length : 0}, kutilgan ${curUnits.length}`);
    return { errors, warnings };
  }

  units.forEach((u, i) => {
    const cu = curUnits[i];
    const unitId = str(cu && cu.id) || `${lv}[${i}]`;
    if (!isObj(u)) { errors.push(`${unitId}: unit obyekt emas`); return; }
    if (u.id !== cu.id) errors.push(`${lv}[${i}]: id "${u.id}" != curriculum "${cu.id}"`);

    const curTasks = Array.isArray(cu.tasks) ? cu.tasks : [];
    const tasks = u.tasks;
    if (!Array.isArray(tasks) || tasks.length !== curTasks.length) {
      errors.push(`${unitId}: vazifa soni ${Array.isArray(tasks) ? tasks.length : 0}, kutilgan ${curTasks.length}`);
    } else {
      const ctxBase = { level: lv, unitId, words: cu.words || [] };
      tasks.forEach((t, k) => {
        const ctx = { ...ctxBase, expectedType: offlineTypeOf(curTasks[k]) };
        errors.push(...validateTask(t, ctx));
        taskWarnings(t, ctx, warnings);
      });
      const used = unitWordUse(tasks, cu.words);
      if (used < UNIT_WORDS_MIN) warnings.push(`${unitId}: unit lug'atidan atigi ${used} so'z ishlatilgan (kamida ${UNIT_WORDS_MIN})`);
    }

    const exam = u.exam;
    if (!Array.isArray(exam) || exam.length !== EXAM_TOTAL) {
      errors.push(`${unitId}: exam soni ${Array.isArray(exam) ? exam.length : 0}, kutilgan ${EXAM_TOTAL}`);
    } else {
      exam.forEach((m, k) => errors.push(...validateMcq(m, `${unitId} exam[${k}]`)));
      const freq = bagOf(exam.filter(isObj).map(m => m.answer).filter(Number.isInteger));
      for (const [k, n] of freq) {
        if (n >= SAME_ANSWER_WARN) warnings.push(`${unitId} exam: ${n} ta savolda answer = ${k} — indekslarni aralashtir`);
      }
    }
  });

  const le = tasksJson.levelExam;
  if (!Array.isArray(le) || le.length !== LEVEL_EXAM_TOTAL) {
    errors.push(`${lv}: levelExam soni ${Array.isArray(le) ? le.length : 0}, kutilgan ${LEVEL_EXAM_TOTAL}`);
  } else {
    le.forEach((m, k) => errors.push(...validateMcq(m, `${lv} levelExam[${k}]`)));
    const freq = bagOf(le.filter(isObj).map(m => m.answer).filter(Number.isInteger));
    for (const [k, n] of freq) {
      if (n >= SAME_ANSWER_WARN) warnings.push(`${lv} levelExam: ${n} ta savolda answer = ${k} — indekslarni aralashtir`);
    }
  }

  return { errors, warnings };
}

// ── CLI ──────────────────────────────────────────────────────────
// build-tasks.mjs import qilganda bu blok ishlamaydi.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = (process.argv[2] || '').trim().toUpperCase();
  const dir = path.join(ROOT, 'data');
  const files = fs.readdirSync(dir)
    .filter(f => /^tasks-[a-z0-9]+\.json$/.test(f))
    .filter(f => !only || f === `tasks-${only.toLowerCase()}.json`)
    .sort();

  if (!files.length) {
    // Fayl yo'qligi xato emas — kontent hali generatsiya qilinmagan bo'lishi mumkin.
    console.log(only ? `${only}: data/tasks-${only.toLowerCase()}.json hali yo'q — generatsiya qilinmagan`
                     : 'data/tasks-*.json topilmadi — hali generatsiya qilinmagan');
    process.exit(0);
  }

  let bad = 0;
  for (const f of files) {
    const lv = f.replace(/^tasks-|\.json$/g, '').toUpperCase();
    const curFile = path.join(dir, `curriculum-${lv.toLowerCase()}.json`);
    if (!fs.existsSync(curFile)) { console.error(`${lv}: curriculum fayli yo'q — ${curFile}`); bad++; continue; }

    let tasksJson, curJson;
    try { tasksJson = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { console.error(`${f}: JSON parse xatosi — ${e.message}`); bad++; continue; }
    try { curJson = JSON.parse(fs.readFileSync(curFile, 'utf8')); }
    catch (e) { console.error(`curriculum-${lv.toLowerCase()}.json: JSON parse xatosi — ${e.message}`); bad++; continue; }

    // Rule 1: `level` maydoni fayl nomiga mos bo'lsin.
    if (str(tasksJson.level).trim().toUpperCase() !== lv) {
      console.error(`${f}: "level" = "${tasksJson.level}", fayl nomiga ko'ra "${lv}" kutilgan`);
      bad++;
      continue;
    }

    const { errors, warnings } = validateLevel(tasksJson, curJson);
    warnings.forEach(w => console.warn('  ogohlantirish: ' + w));
    if (errors.length) {
      console.error(`${lv} — VALIDATSIYA YIQILDI (${errors.length} xato):\n` + errors.map(e => '  - ' + e).join('\n'));
      bad++;
    } else {
      const units = tasksJson.units.length;
      console.log(`OK — ${lv}: ${units} unit, ${warnings.length} ogohlantirish`);
    }
  }
  process.exit(bad ? 1 : 0);
}
