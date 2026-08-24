// Offline bilka testlari (docs/specs/offline-client.md).
// Alohida fayl: test-program.mjs onlayn xatti-harakatni qo'riqlaydi va unga
// tegilmaydi. Uslub o'sha yerdan ko'chirilgan — stubs, exported, t().
//
//   node scripts/test-offline.mjs
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.log('SCRIPT BLOKI TOPILMADI'); process.exit(1); }
const src = m[1];

try { new Function(src); console.log('1. Sintaksis: OK'); }
catch (e) { console.log('1. Sintaksis XATO:', e.message); process.exit(1); }

const store = {};
let fetchImpl = async () => ({ ok:false, status:0, json: async () => ({}) });
const vibrations = [];
const stubs = {
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  document: null,
  window: { addEventListener(){}, removeEventListener(){} },
  crypto: { randomUUID: () => '00000000-1111-2222-3333-444444444444' },
  fetch: (...a) => fetchImpl(...a),
  speechSynthesis: undefined,
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  // navigator.vibrate — plitka bosilganda haptic javob. Stubga qo'shilmasa
  // butun suite yuklanishda TypeError bilan o'ladi.
  navigator: { vibrate: (ms) => { vibrations.push(ms); return true; } },
  Telegram: undefined,
  MediaRecorder: undefined,
  FileReader: class {},
  Blob: class {},
  URL: { createObjectURL: () => '', revokeObjectURL(){} },
};

const el = () => ({
  style:{}, classList:{ add(){}, remove(){}, toggle(){}, contains:()=>false },
  appendChild(){}, remove(){}, addEventListener(){}, querySelectorAll:()=>[],
  set innerHTML(_v){}, get innerHTML(){ return ''; },
  textContent:'', value:'', dataset:{}, focus(){}, onclick:null, disabled:false,
});
stubs.document = {
  getElementById: () => el(),
  querySelectorAll: () => [],
  createElement: () => el(),
  body: { appendChild(){} },
  addEventListener(){},
};

const patched = src.replace(/^init\(\);\s*$/m, '');
const names = Object.keys(stubs);
const exported = ['initProgram','getUnit','getTaskType','applyResult','issueTask','markLessonSeen',
                  'CURRICULUM','LEVELS','PASS_THRESHOLD','TASKS_PER_UNIT','TASK_TYPES','taskLabel',
                  'OFFLINE_TASKS','OFFLINE_TYPE_MAP','OFFLINE_TASK_TYPES','offlineTypeOf',
                  'offlineSchemaError','loadOfflineLevel','offlineTaskAt','offlineRemedialTask',
                  'normOffline','offlineItems','gradeOffline','offlineShuffle','offlineTiles',
                  'offlineRevealText','offlineFeedbackText','offlineTtsReady',
                  'startTask','submitTask','retryTask','revealAndSkip','skipTask',
                  'offlineBox','offlineRunKey','offlineSteps','esc','renderAI',
                  // O'yin rejimlari (docs/specs/offline-games.md) — sof mantiq.
                  'GAMES','GAME_KEYS','GAMES_KEY','GAME_MEMORY_PAIRS','GAME_OPTIONS','GAME_MIN_POOL',
                  'GAME_COMBO_X2','GAME_COMBO_X3','GAME_XP_MAX','XP_PER_TASK',
                  'ANAGRAM_MIN_LEN','ANAGRAM_MAX_LEN','ANAGRAM_POINTS','ANAGRAM_HINT_POINTS',
                  'gameDefaults','getGames','ensureGames','betterScore','recordGame',
                  'gameWordPool','anagramEligible','gamesAvailable','soundScore','gameDistractors',
                  'scrambleWord','buildRound','comboMult','newGameState','scoreRound','gameXp',
                  'unitWords','navTabs','NAV_TABS','navTo',
                  'gameBody','gameHeadStats','renderGames','GAME_ANAGRAM_WORDS','GAME_LISTEN_ROUNDS',
                  // Testlar (docs/specs/offline-testlar.md) — sof mantiq + render.
                  'QUIZ_RESULTS_KEY','availableQuizzes','buildQuizSession','scoreQuizAnswer','quizPct',
                  'getQuizResults','recordQuizResult',
                  'renderQuizList','renderQuizSession','renderQuizResult','startQuiz','exitQuiz'];
const runner = new Function(...names, `${patched}\n; return { ${exported.join(',')}, setUser:u=>{user=u}, getUser:()=>user,
  setOffline:v=>{ OFFLINE_BUILD=v; }, getOffline:()=>OFFLINE_BUILD,
  clearOfflineCache:()=>{ for (const k of Object.keys(OFFLINE_TASKS)) delete OFFLINE_TASKS[k]; } };`);
const api = runner(...names.map(n => stubs[n]));

let fails = 0;
const t = (label, cond) => { console.log(`   ${cond ? 'OK  ' : 'FAIL'} ${label}`); if (!cond) fails++; };

// ── Yordamchilar ─────────────────────────────────────────────────
const tileItem = (en, alt) => ({ uz:'x', en, tiles:en.split(' '), distractors:['is','are'], alt: alt || [] });
const tileTask = (type, ens) => ({ type, items: ens.map(e => tileItem(e)) });
const mcqTask  = (type, n) => ({ type, text:'text', items: Array.from({length:n}, (_,i) => ({
  q:`Q${i}?`, options:['a','b','c','d'], answer: i % 4,
})) });
const mcqKey   = (task) => task.items.map(i => i.answer);
const orderTask = () => ({ type:'order', topic:'T', topicUz:'T',
  sentences:['One.','Two.','Three.','Four.','Five.'] });

// ── 2. gradeOffline: har olti tur × 5/5, 4/5, 0/5 ────────────────
console.log('2. gradeOffline — olti tur uchun 5/5, 4/5, 0/5:');

// variantli: read, listen
for (const type of ['read','listen']) {
  const task = mcqTask(type, 5);
  const key = mcqKey(task);
  const full = api.gradeOffline(task, key);
  t(`${type}: to'liq to'g'ri → 5/5`, full.correct === 5 && full.total === 5);
  const one = key.slice(); one[2] = (one[2] + 1) % 4;
  const g4 = api.gradeOffline(task, one);
  t(`${type}: bitta xato → 4/5`, g4.correct === 4 && g4.total === 5);
  t(`${type}: detail[2] xato deb belgilangan`, g4.detail[2].ok === false && g4.detail[2].expected === 'abcd'[key[2]]);
  const none = api.gradeOffline(task, []);
  t(`${type}: javobsiz → 0/5`, none.correct === 0 && none.total === 5);
}

// plitkali: translate, build, dictate
for (const type of ['translate','build','dictate']) {
  const ens = ['I am a student','She is from Bukhara','They are good students',
               'He is a teacher','We are friends'];
  const task = tileTask(type, ens);
  const full = api.gradeOffline(task, ens);
  t(`${type}: to'liq to'g'ri → 5/5`, full.correct === 5 && full.total === 5);
  const one = ens.slice(); one[1] = 'She are from Bukhara';
  const g4 = api.gradeOffline(task, one);
  t(`${type}: bitta xato → 4/5`, g4.correct === 4 && g4.total === 5);
  const none = api.gradeOffline(task, ['','','','','']);
  t(`${type}: javobsiz → 0/5`, none.correct === 0 && none.total === 5);
}

// order
{
  const task = orderTask();
  const full = api.gradeOffline(task, [0,1,2,3,4]);
  t("order: to'liq to'g'ri → 5/5", full.correct === 5 && full.total === 5);
  const g4 = api.gradeOffline(task, [0,1,2,3,4].map((v,i) => i));
  t('order: nusxa ham 5/5', g4.correct === 5);
  const none = api.gradeOffline(task, []);
  t('order: javobsiz → 0/5', none.correct === 0 && none.total === 5);
  const rev = api.gradeOffline(task, [4,3,2,1,0]);
  t("order: teskari tartib → 1/5 (o'rta pozitsiya joyida)", rev.correct === 1);
}

// imtihonlar — 8 va 10 band
{
  const ex = mcqTask('unit_exam', 8);
  t('unit_exam: total = 8', api.gradeOffline(ex, mcqKey(ex)).total === 8);
  const key = mcqKey(ex); key[0] = (key[0] + 1) % 4;
  t('unit_exam: bitta xato → 7/8', api.gradeOffline(ex, key).correct === 7);
  const lv = mcqTask('level_exam', 10);
  t('level_exam: total = 10', api.gradeOffline(lv, mcqKey(lv)).total === 10);
}

// ── 3. Normallashtirish ──────────────────────────────────────────
console.log('3. Normallashtirish (tinish belgisi, registr, probel, apostrof):');
{
  const task = tileTask('translate', ['I am a student']);
  const ok = (given) => api.gradeOffline(task, [given]).correct === 1;
  t('"I am a student" = "i am a student."', ok('i am a student.'));
  t("ortiqcha probel hisobga olinmaydi", ok('  I   am a  student '));
  t('bosh harf farqi hisobga olinmaydi', ok('I AM A STUDENT'));
  t('vergul/undov hisobga olinmaydi', ok('I, am a student!'));

  const dont = tileTask('translate', ["I don't know"]);
  t('"don\'t" javobi to\'g\'ri', api.gradeOffline(dont, ["I don't know"]).correct === 1);
  // Apostrof SAQLANADI: bu haqiqiy imlo farqi, tinish belgisi emas.
  t('"dont" ≠ "don\'t" → XATO', api.gradeOffline(dont, ['I dont know']).correct === 0);
  t("normOffline apostrofni o'chirmaydi", api.normOffline("don't") === "don't");
  t('normOffline nuqta va registrni tozalaydi', api.normOffline('  I Am.  ') === 'i am');
}

// ── 4. alt massivi ───────────────────────────────────────────────
console.log('4. alt massividagi variant:');
{
  const task = { type:'translate', items:[
    { uz:'x', en:'I am a student', tiles:[], distractors:[], alt:["I'm a student", 'I am a pupil'] },
  ]};
  t("asosiy `en` qabul qilinadi", api.gradeOffline(task, ['I am a student']).correct === 1);
  t('alt[0] qabul qilinadi', api.gradeOffline(task, ["I'm a student"]).correct === 1);
  t('alt[1] qabul qilinadi', api.gradeOffline(task, ['I am a pupil.']).correct === 1);
  t("alt'da yo'q variant rad etiladi", api.gradeOffline(task, ['I am student']).correct === 0);
  t('alt yo\'q bo\'lsa yiqilmaydi',
    api.gradeOffline({ type:'translate', items:[{ en:'Yes' }] }, ['yes']).correct === 1);
}

// ── 5. order — pozitsiya-ba-pozitsiya ────────────────────────────
console.log('5. order pozitsiya hisobi:');
{
  const task = orderTask();
  // 2 va 3 o'rin almashdi → AYNAN ikki pozitsiya xato.
  const g = api.gradeOffline(task, [0,2,1,3,4]);
  t('bitta juftlik almashsa → 3/5 (0/5 EMAS)', g.correct === 3 && g.total === 5);
  t('xato pozitsiyalar 1 va 2', g.detail[1].ok === false && g.detail[2].ok === false);
  t('to\'g\'ri pozitsiyalar 0, 3, 4', g.detail[0].ok && g.detail[3].ok && g.detail[4].ok);
  t('detail.given foydalanuvchi qo\'ygan jumlani ko\'rsatadi', g.detail[1].given === 'Three.');
  t('detail.expected to\'g\'ri jumlani ko\'rsatadi', g.detail[1].expected === 'Two.');
  // 3/5 PASS_THRESHOLD dan past — ya'ni bu hali ham yiqilish, lekin o'lchov ishlaydi.
  t('3/5 < PASS_THRESHOLD', 3/5 < api.PASS_THRESHOLD);
  t('4/5 ≥ PASS_THRESHOLD', 4/5 >= api.PASS_THRESHOLD);
}

// ── 6. Tur moslashtirish ─────────────────────────────────────────
console.log('6. Onlayn → offline tur moslashtirish:');
t("speak → dictate", api.offlineTypeOf('speak') === 'dictate');
t("write → order", api.offlineTypeOf('write') === 'order');
for (const keep of ['read','translate','build','listen']) {
  t(`${keep} o'zgarmaydi`, api.offlineTypeOf(keep) === keep);
}

// ── 7. Sxema tekshiruvi — id bo'yicha ────────────────────────────
console.log('7. offlineSchemaError — id bo\'yicha moslik:');
{
  const good = {
    level:'A1',
    units: api.CURRICULUM.A1.map(u => ({ id:u.id, tasks:[], exam:[] })),
    levelExam: [],
  };
  t('to\'g\'ri fayl → null', api.offlineSchemaError('A1', good) === null);
  t('level nomi mos emas → xato', !!api.offlineSchemaError('A2', good));
  const short = { ...good, units: good.units.slice(0, 5) };
  t('unit soni kam → xato', !!api.offlineSchemaError('A1', short));
  const shifted = { ...good, units: good.units.map((u,i) => i === 3 ? { ...u, id:'A1-99' } : u) };
  const err = api.offlineSchemaError('A1', shifted);
  t('bitta id chetlashsa → xato', !!err && /A1-99/.test(err));
  t('bo\'sh data → xato', !!api.offlineSchemaError('A1', null));
  t('levelExam massiv emas → xato', !!api.offlineSchemaError('A1', { ...good, levelExam:null }));
}

// ── 8. Haqiqiy data fayllari CURRICULUM bilan mos ────────────────
console.log('8. data/tasks-*.json ↔ CURRICULUM (id bo\'yicha):');
{
  let found = 0;
  for (const lv of api.LEVELS) {
    const url = new URL(`../data/tasks-${lv.toLowerCase()}.json`, import.meta.url);
    if (!fs.existsSync(url)) { console.log(`   —    tasks-${lv.toLowerCase()}.json hali yo'q`); continue; }
    found++;
    const data = JSON.parse(fs.readFileSync(url, 'utf8'));
    const err = api.offlineSchemaError(lv, data);
    t(`tasks-${lv.toLowerCase()}.json sxemasi to'g'ri${err ? ' — ' + err : ''}`, err === null);
  }
  t('kamida bitta daraja fayli bor', found > 0);
}

// ── 9. loadOfflineLevel — yuklash va kesh ────────────────────────
console.log('9. loadOfflineLevel:');
await (async () => {
  api.clearOfflineCache();
  const a1 = JSON.parse(fs.readFileSync(new URL('../data/tasks-a1.json', import.meta.url), 'utf8'));
  let asked = null;
  const okFetch = async (url) => { asked = url; return { ok:true, status:200, json: async () => a1 }; };

  const r1 = await api.loadOfflineLevel('A1', okFetch);
  t('yuklandi', r1.ok === true);
  t('kichik harfli fayl nomi so\'raldi', asked === 'data/tasks-a1.json');
  t('OFFLINE_TASKS ga keshlandi', api.OFFLINE_TASKS.A1 === r1.data);

  asked = null;
  const r2 = await api.loadOfflineLevel('A1', okFetch);
  t('ikkinchi chaqiruv keshdan (tarmoqqa chiqmaydi)', r2.cached === true && asked === null);

  api.clearOfflineCache();
  const r3 = await api.loadOfflineLevel('A1', async () => ({ ok:false, status:404 }));
  t('404 → reason=fetch', r3.ok === false && r3.reason === 'fetch');
  const r4 = await api.loadOfflineLevel('A1', async () => { throw new Error('offline'); });
  t('tarmoq xatosi yiqilmaydi', r4.ok === false && r4.reason === 'fetch');
  const r5 = await api.loadOfflineLevel('A1', async () => ({ ok:true, json: async () => ({ level:'A1', units:[], levelExam:[] }) }));
  t('sxema xatosi → reason=schema', r5.ok === false && r5.reason === 'schema');
  t('sxema xatosi keshlanmaydi', api.OFFLINE_TASKS.A1 === undefined);
  await api.loadOfflineLevel('A1', okFetch);
})();

// ── 10. offlineTaskAt — pozitsiya → vazifa ───────────────────────
console.log('10. offlineTaskAt (pozitsiya bo\'yicha):');
{
  const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
  u.program = api.initProgram('A1');
  api.setUser(u);
  api.markLessonSeen(api.getUnit().id);

  const r0 = api.offlineTaskAt();
  t('A1-01 #1 → read', r0.ok && r0.type === 'read' && r0.task.type === 'read');
  t("vazifada 5 band bor", api.offlineItems(r0.task).length === 5);

  u.program.taskIndex = 1;
  t('#2 → translate', api.offlineTaskAt().type === 'translate');
  u.program.taskIndex = 5;
  const last = api.offlineTaskAt();
  t('#6 turi kurrikulum turidan moslashtirilgan',
     last.ok && last.type === api.offlineTypeOf(api.CURRICULUM.A1[0].tasks[5]));

  u.program.taskIndex = api.TASKS_PER_UNIT;
  const ex = api.offlineTaskAt();
  t('taskIndex ≥ 6 → unit_exam, 8 band', ex.ok && ex.type === 'unit_exam' && ex.task.items.length === 8);

  u.program.taskIndex = 0;
  u.program.levelExam = { pending:true, attempts:0, remedial:0 };
  const le = api.offlineTaskAt();
  t('levelExam.pending → level_exam, 10 band', le.ok && le.type === 'level_exam' && le.task.items.length === 10);

  u.program.levelExam.remedial = 2;
  const rem = api.offlineTaskAt();
  t('remedial → translate vazifasi topiladi', rem.ok && rem.type === 'translate');

  u.program.levelExam = { pending:false, attempts:0, remedial:0 };
  u.program.level = 'B1';
  t("yuklanmagan daraja → reason=not_loaded", api.offlineTaskAt().reason === 'not_loaded');
  u.program.level = 'A1';
}

// ── 11. §7.5 offline shoxlari — AI chaqirilmaydi ─────────────────
console.log('11. §7.5 offline oqimi (fetch mutlaqo chaqirilmaydi):');
await (async () => {
  let calls = 0;
  fetchImpl = async () => { calls++; return { ok:false, status:500, json: async () => ({}) }; };
  api.setOffline(true);

  const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[], streak:0, lastTaskDay:null };
  u.program = api.initProgram('A1');
  api.setUser(u);
  api.markLessonSeen(api.getUnit().id);

  const st = await api.startTask();
  t('startTask ok', st.ok === true);
  t("current.offline data obyekti saqlandi", !!u.program.current.offline);
  t('current.type = read', u.program.current.type === 'read');
  t('AI chaqirilmadi', calls === 0);

  // To'liq to'g'ri javob → o'tadi
  const key = u.program.current.offline.items.map(i => i.answer);
  const sub = await api.submitTask(key);
  t('submitTask 5/5 → passed', sub.ok && sub.passed === true && sub.score.correct === 5);
  t('taskIndex 0 → 1', u.program.taskIndex === 1);
  t('XP berildi', u.xp === 25);
  t('hali ham AI chaqirilmadi', calls === 0);

  // Yiqilish → retry → reveal → skip
  await api.startTask();
  const cur = u.program.current;
  t('#2 translate ochildi', cur.type === 'translate');
  const bad = await api.submitTask(['x','x','x','x','x']);
  t('0/5 → yiqildi', bad.ok && bad.passed === false && bad.score.correct === 0);
  t('urinish sanaldi', u.program.current.attempts === 1);
  t('feedback saqlandi', typeof u.program.current.feedback === 'string' && u.program.current.feedback.length > 0);

  const rt = await api.retryTask();
  t('retryTask vazifani qayta ochadi', rt.ok && u.program.current.status === 'open');
  t('retry AYNI vazifani qoldiradi', u.program.current.offline === cur.offline);

  for (let i = 0; i < 4; i++) await api.submitTask(['x','x','x','x','x']);
  t('5 urinishdan keyin canSkip', u.program.current.canSkip === true);
  t('relief ham qo\'yilgan', u.program.current.relief === true);
  const rr = await api.retryTask();
  t("relief'da dars qayta ochilishi so'raladi", rr.ok && rr.openLesson === true);

  const rv = await api.revealAndSkip();
  t('revealAndSkip ok', rv.ok === true && rv.skipped === true);
  t("to'g'ri javoblar matni data'dan keldi", typeof rv.text === 'string' && rv.text.includes(cur.offline.items[0].en));
  t('vazifa o\'tkazildi (taskIndex 2)', u.program.taskIndex === 2);
  t('XP berilmadi', u.xp === 25);
  t('weakUnits ga yozildi', u.program.weakUnits.includes('A1-01'));
  t('butun oqimda AI chaqirilmadi', calls === 0);

  // Bo'sh javob — urinish sanalmaydi
  await api.startTask();
  const before = u.program.current.attempts;
  const empty = await api.submitTask(null);
  t("massiv bo'lmagan javob rad etiladi", empty.ok === false && empty.reason === 'empty_answer');
  t('urinish sanalmadi', u.program.current.attempts === before);

  api.setOffline(false);
})();

// ── 12. Data yo'q bo'lsa — ochiq xato, jimgina noto'g'ri vazifa emas ──
console.log('12. Kontent yo\'q holati:');
await (async () => {
  api.setOffline(true);
  const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
  u.program = api.initProgram('A1');
  u.program.level = 'C1';
  api.setUser(u);
  api.markLessonSeen(api.getUnit().id);
  const r = await api.startTask();
  t('yuklanmagan darajada startTask xato qaytaradi', r.ok === false && r.reason === 'offline_content');
  t('vazifa ochilmadi', u.program.current === null);
  api.setOffline(false);
})();

// ── 13. Yordamchi UI funksiyalari ────────────────────────────────
console.log('13. UI yordamchilari:');
{
  const tiles = api.offlineTiles({ tiles:['I','am','a','student'], distractors:['is','are'] });
  t('plitkalar = tiles + distractors', tiles.length === 6);
  t('barcha tiles bor', ['I','am','a','student'].every(w => tiles.includes(w)));
  // Aralashtirish deterministik EMAS — o'quvchi tartibni yodlab olmasin.
  const runs = new Set();
  for (let i = 0; i < 40; i++) runs.add(api.offlineShuffle(['a','b','c','d','e','f']).join(''));
  t('offlineShuffle har chaqiruvda boshqacha (>1 variant)', runs.size > 1);
  t('shuffle elementlarni yo\'qotmaydi',
     api.offlineShuffle(['a','b','c']).slice().sort().join('') === 'abc');

  t('taskLabel dictate ni taniydi (offline)', api.taskLabel('dictate').title === api.OFFLINE_TASK_TYPES.dictate.title);
  t('taskLabel order ni taniydi (offline)', api.taskLabel('order').title === api.OFFLINE_TASK_TYPES.order.title);

  const g = api.gradeOffline(tileTask('translate', ['I am a student']), ['I am student']);
  const fb = api.offlineFeedbackText(tileTask('translate', ['I am a student']), g);
  t('feedback matnida NATIJA marker bor', /NATIJA: 0\/1/.test(fb));
  t("feedback to'g'ri javobni ko'rsatadi", fb.includes('I am a student'));
}

// ── 14. taskBox() render — olti tur ──────────────────────────────
console.log('14. Render (olti tur):');
{
  api.setOffline(true);
  const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
  u.program = api.initProgram('A1');
  api.setUser(u);

  // Vazifani to'g'ridan-to'g'ri qo'yamiz — render turlarini data'dan qat'i nazar sinaymiz.
  const draw = (task) => {
    u.program.current = { unitId:'A1-01', taskIndex:0, type:task.type, prompt:'P',
                          status:'open', attempts:0, relief:false, lastScore:null, offline:task };
    return api.offlineBox(u.program.current, api.taskLabel(task.type));
  };

  const readTask = { type:'read', text:'ALI IS A STUDENT MARKER', items:[{ q:'Q1?', options:['a','b','c','d'], answer:1 }] };
  let h = draw(readTask);
  t('read: matn ekranda ko\'rinadi', h.includes('ALI IS A STUDENT MARKER'));
  t('read: 4 ta variant tugmasi', (h.match(/class="of-opt/g) || []).length === 4);
  t('read: klaviatura ochilmaydi (textarea yo\'q)', !h.includes('<textarea'));

  const listenTask = { type:'listen', text:'HIDDEN LISTEN MARKER', items:[{ q:'Q1?', options:['a','b','c','d'], answer:0 }] };
  h = draw(listenTask);
  t('listen: 🔊 tugma bor', h.includes('of-play'));
  // Bu muhitda speechSynthesis yo'q → TTS zaxirasi ishlaydi: matn KO'RSATILADI,
  // ya'ni vazifa read kabi ishlaydi va o'quvchi tiqilib qolmaydi.
  t('TTS yo\'q: offlineTtsReady() false', api.offlineTtsReady() === false);
  t('TTS yo\'q: listen matni ko\'rsatiladi (tiqilib qolmaydi)', h.includes('HIDDEN LISTEN MARKER'));

  // Endi TTS bor holat — matn yashiriladi.
  stubs.window.speechSynthesis = { getVoices: () => [{ lang:'en-US', name:'Test' }], cancel(){}, speak(){} };
  t('TTS bor: offlineTtsReady() true', api.offlineTtsReady() === true);
  h = draw(listenTask);
  t('TTS bor: listen matni YASHIRIN', !h.includes('HIDDEN LISTEN MARKER'));
  t('TTS bor: "matnni ko\'rsatish" zaxira tugmasi bor', h.includes('of-show'));

  const dictTask = { type:'dictate', items:[{ en:'SHE IS FROM BUKHARA', uz:'U Buxorodan',
    tiles:['She','is','from','Bukhara'], distractors:['are','in'], alt:[] }] };
  h = draw(dictTask);
  t('dictate: 🔊 tugma bor', h.includes('of-play'));
  t('dictate: jumla javobdan oldin yashirin', !h.includes('SHE IS FROM BUKHARA'));
  t('dictate: plitkalar bor (4+2)', (h.match(/class="of-tile/g) || []).length === 6);
  t('dictate: klaviatura ochilmaydi', !h.includes('<textarea'));
  delete stubs.window.speechSynthesis;

  const trTask = { type:'translate', items:[{ uz:'MEN TALABAMAN', en:'I am a student',
    tiles:['I','am','a','student'], distractors:['is','are'], alt:[] }] };
  h = draw(trTask);
  t('translate: o\'zbekcha jumla ko\'rinadi', h.includes('MEN TALABAMAN'));
  t('translate: 6 plitka', (h.match(/class="of-tile/g) || []).length === 6);
  t('translate: javob avvaldan ko\'rinmaydi', !h.includes('I am a student'));
  t('translate: Tekshirish tugmasi bosilmas (plitka tanlanmagan)', /id="of-check"[^>]*disabled/.test(h));

  const buildTask = { type:'build', items:[{ word:'STUDENTMARK', uz:'talaba', en:'I am a student',
    tiles:['I','am','a','student'], distractors:['is','are'], alt:[] }] };
  h = draw(buildTask);
  t('build: berilgan so\'z tepada', h.includes('STUDENTMARK'));

  const ordTask = { type:'order', topic:'T', topicUz:'MAVZU MARKER',
    sentences:['S one.','S two.','S three.','S four.','S five.'] };
  h = draw(ordTask);
  t('order: mavzu ko\'rinadi', h.includes('MAVZU MARKER'));
  t('order: 5 jumla tugmasi', (h.match(/class="of-sent/g) || []).length === 5);
  t('order: to\'g\'ri tartib avvaldan ko\'rsatilmaydi', !h.includes("To'g'ri tartib"));
  t('order: Tekshirish bosilmas (tartib to\'liq emas)', /id="of-check"[^>]*disabled/.test(h));

  // Imtihonlar ham variantli render bilan chiziladi.
  h = draw({ type:'unit_exam', items:[{ q:'Q?', options:['a','b','c','d'], answer:0 }] });
  t('unit_exam: variantli render', (h.match(/class="of-opt/g) || []).length === 4);

  // Har ochilishda qayta aralashtirish: run kaliti urinish bilan o'zgaradi.
  const c1 = { unitId:'A1-01', taskIndex:0, type:'translate', attempts:0 };
  const c2 = { unitId:'A1-01', taskIndex:0, type:'translate', attempts:1 };
  t('qayta urinishda plitkalar qayta aralashadi (kalit boshqacha)',
     api.offlineRunKey(c1) !== api.offlineRunKey(c2));

  t('order bitta qadam', api.offlineSteps(ordTask) === 1);
  t('read qadam soni = band soni', api.offlineSteps(readTask) === 1);

  u.program.current = null;
  api.setOffline(false);
}

// ── 14b. HAR BIR daraja haqiqiy data bilan ──────────────────────
// Integratsiya va "oltin javob" darvozasi: har unitning 6 vazifasi + imtihoni,
// so'ng daraja imtihoni. Har qadamda data'dan olingan TO'G'RI javob beriladi va
// vazifa o'tishi SHART. Bu bir vaqtning o'zida uch narsani qo'riqlaydi:
// turlar moslashtirilishini, band/pozitsiya hisobini va data'ning o'zini —
// `tiles` `en` ni yig'a olmasa yoki `answer` indeksi buzuq bo'lsa, shu yerda
// yiqiladi. Daraja fayli yo'q bo'lsa jimgina o'tkazib yuboriladi.
console.log('14b. Darajalarni oltin javob bilan to\'liq yurish:');
await (async () => {
  const disk = {};
  for (const lv of api.LEVELS) {
    const url = new URL(`../data/tasks-${lv.toLowerCase()}.json`, import.meta.url);
    if (fs.existsSync(url)) disk[lv] = JSON.parse(fs.readFileSync(url, 'utf8'));
  }
  const golden = (task) => {
    if (task.type === 'order') return api.offlineItems(task).map((_, i) => i);
    if (['translate','build','dictate'].includes(task.type)) return api.offlineItems(task).map(i => i.en);
    return api.offlineItems(task).map(i => i.answer);
  };

  // Yarim yozilgan darajani "yiqildi" deb ko'rsatish noto'g'ri bo'ladi —
  // generatsiya davom etayotganda bo'sh slot normal holat. Shuning uchun
  // to'liqlik alohida tekshiriladi: to'liq bo'lsa yurish MAJBURIY, bo'lmasa
  // o'tkaziladi va sababi ochiq yoziladi.
  const gaps = (d) => {
    const out = [];
    (d.units || []).forEach(u => {
      (u.tasks || []).forEach((t, i) => { if (!t || typeof t !== 'object') out.push(`${u.id} #${i + 1}`); });
      if (!Array.isArray(u.exam) || !u.exam.length) out.push(`${u.id} imtihon`);
    });
    if (!Array.isArray(d.levelExam) || !d.levelExam.length) out.push('daraja imtihoni');
    return out;
  };

  for (const lv of api.LEVELS) {
    if (!disk[lv]) { console.log(`   —    ${lv}: data yo'q, o'tkazildi`); continue; }
    const holes = gaps(disk[lv]);
    if (holes.length) {
      console.log(`   —    ${lv}: kontent to'liq emas (${holes.length} bo'sh: ${holes.slice(0, 3).join(', ')}${holes.length > 3 ? '…' : ''}), o'tkazildi`);
      continue;
    }
    api.setOffline(true);
    api.clearOfflineCache();
    fetchImpl = async (url) => {
      const hit = String(url).match(/tasks-([a-z0-9]+)\.json/);
      const d = hit && disk[hit[1].toUpperCase()];
      return d ? { ok:true, status:200, json: async () => d } : { ok:false, status:404, json: async () => ({}) };
    };

    const u = { name:'T', level:lv, goal:'general', xp:0, vocabulary:[], achievements:[],
                streak:0, lastTaskDay:null };
    u.program = api.initProgram(lv);
    api.setUser(u);
    await api.loadOfflineLevel(lv);            // startTask yuklamaydi — oldindan keshlanadi
    if (api.LEVELS.indexOf(lv) + 1 < api.LEVELS.length) {
      await api.loadOfflineLevel(api.LEVELS[api.LEVELS.indexOf(lv) + 1]).catch(() => {});
    }

    let steps = 0, bad = [];
    const guard = 200;
    while (u.program.level === lv && !u.program.completed && steps < guard) {
      steps++;
      u.program.doneToday = { date: u.program.doneToday.date, count: 0 };
      const unit = api.getUnit();
      if (unit) api.markLessonSeen(unit.id);
      const online = api.getTaskType();
      const r = await api.startTask();
      if (!r.ok) { bad.push(`${unit && unit.id} ${online}: ${r.message || r.reason}`); break; }
      if (!['unit_exam','level_exam'].includes(online) && !u.program.levelExam.pending
          && r.type !== api.offlineTypeOf(online)) {
        bad.push(`${unit.id}: ${online} → ${r.type}`);
      }
      const sub = await api.submitTask(golden(u.program.current.offline));
      if (!sub.ok || !sub.passed) {
        bad.push(`${unit && unit.id} ${r.type}: ${sub.score ? sub.score.correct + '/' + sub.score.total : sub.reason}`);
        break;
      }
    }

    const expected = 12 * (api.TASKS_PER_UNIT + 1) + 1;
    t(`${lv}: oltin javob bilan xatosiz yurdi (${steps}/${expected} qadam)${bad.length ? ' — ' + bad.slice(0,3).join(' | ') : ''}`,
      bad.length === 0 && steps === expected);
    const last = api.LEVELS[api.LEVELS.length - 1];
    t(`${lv}: daraja imtihonidan keyin ${lv === last ? 'dastur tugadi' : 'keyingi darajaga ko\'tarildi'}`,
      lv === last ? u.program.completed === true : u.program.level === api.LEVELS[api.LEVELS.indexOf(lv) + 1]);
  }
  fetchImpl = async () => ({ ok:false, status:0, json: async () => ({}) });
  api.setOffline(false);          // 15-bo'lim yetkazilayotgan holatni tekshiradi
  api.clearOfflineCache();
})();
// ── 16. O'YIN REJIMLARI (docs/specs/offline-games.md) ────────────
// Spec "Test talablari" bo'limidagi 7 band shu yerda qamralgan.
console.log("16. O'yin rejimlari — sof mantiq:");
{
  const W = (en, uz, ipa) => ({ en, uz, ipa: ipa || `/${en}/` });
  // 24 ta so'z: hovuz GAME_MIN_POOL dan katta, hamma o'yin quriladi.
  const POOL = ['book','table','water','bread','house','friend','school','teacher',
                'window','garden','summer','winter','market','doctor','pencil','bottle',
                'yellow','orange','flower','coffee','letter','island','forest','silver']
    .map((en, i) => W(en, `uz-${en}`, `/${i}/`));

  // ── 16.1 buildRound har o'yin uchun ────────────────────────────
  console.log('  16.1 buildRound (to\'g\'ri javob hovuzda, chalg\'ituvchilar takrorlanmaydi):');
  {
    let bad = [];
    for (let n = 0; n < 60; n++) {
      const r = api.buildRound('speed', POOL);
      if (!r) { bad.push('speed null'); break; }
      const uzSet = new Set(POOL.map(w => w.uz));
      if (r.options.length !== api.GAME_OPTIONS) bad.push('speed variant soni');
      if (r.options[r.answer] !== r.word.uz) bad.push('speed to\'g\'ri javob indeksi');
      if (new Set(r.options).size !== r.options.length) bad.push('speed takror variant');
      if (!r.options.every(o => uzSet.has(o))) bad.push('speed hovuzdan tashqari variant');
      if (!POOL.some(w => w.en === r.word.en)) bad.push('speed so\'z hovuzda yo\'q');
      if (r.options.filter(o => o === r.word.uz).length !== 1) bad.push('speed chalg\'ituvchi javobga teng');
    }
    t(`speed: 60 raund toza${bad.length ? ' — ' + bad[0] : ''}`, bad.length === 0);

    bad = [];
    for (let n = 0; n < 60; n++) {
      const r = api.buildRound('listen_game', POOL);
      if (!r) { bad.push('listen null'); break; }
      const enSet = new Set(POOL.map(w => w.en));
      if (r.options.length !== api.GAME_OPTIONS) bad.push('listen variant soni');
      // Variantlar INGLIZCHA — bu talaffuzni tanish o'yini, tarjima emas.
      if (!r.options.every(o => enSet.has(o))) bad.push('listen variant inglizcha emas');
      if (r.options[r.answer] !== r.word.en) bad.push('listen javob indeksi');
      if (new Set(r.options).size !== r.options.length) bad.push('listen takror variant');
    }
    t(`listen_game: 60 raund toza, variantlar inglizcha${bad.length ? ' — ' + bad[0] : ''}`, bad.length === 0);

    const an = api.buildRound('anagram', POOL);
    t('anagram: so\'z hovuzdan', !!an && POOL.some(w => w.en === an.answer));
    const mem = api.buildRound('memory', POOL);
    t('memory: quriladi', !!mem && Array.isArray(mem.cards));

    // Hovuz kichik bo'lsa — null, ya'ni menyu o'yinni taklif qilmaydi.
    t('4 tadan kam so\'z → speed null', api.buildRound('speed', POOL.slice(0, 3)) === null);
    t('6 juftga yetmasa → memory null', api.buildRound('memory', POOL.slice(0, 5)) === null);
    t('mos so\'z yo\'q → anagram null', api.buildRound('anagram', [W('ok', 'x')]) === null);
  }

  // ── 16.1b Chalg'ituvchilar MA'NOLI ─────────────────────────────
  console.log('  16.1b Chalg\'ituvchilar ma\'noli (tasodifiy emas):');
  {
    const near = ['car','can','cap','cab','cat'];
    const far  = ['elephant','university','bicycle','hospital','strawberry'];
    const mix  = near.concat(far).map(en => W(en, `uz-${en}`));
    const cat  = mix.find(w => w.en === 'cat');
    let offNear = 0;
    for (let n = 0; n < 40; n++) {
      const d = api.gameDistractors(mix, cat, 3, true);
      if (!d.every(w => near.includes(w.en))) offNear++;
    }
    t('listen_game chalg\'ituvchilari tovushga yaqin so\'zlardan', offNear === 0);
    t('soundScore yaqinni uzoqdan yuqori baholaydi',
      api.soundScore('car', 'cat') > api.soundScore('elephant', 'cat'));
    t('chalg\'ituvchi hech qachon to\'g\'ri javobga teng emas',
      api.gameDistractors(mix, cat, 3, true).every(w => w.en !== 'cat'));
    // speed chalg'ituvchilari ham O'SHA hovuzdan, tasodifiy lug'atdan emas.
    const d2 = api.gameDistractors(POOL, POOL[0], 3, false);
    t('speed chalg\'ituvchilari hovuzdan', d2.every(w => POOL.includes(w)));
    t('speed chalg\'ituvchilari takrorlanmaydi', new Set(d2.map(w => w.uz)).size === 3);
    // Yaqin, lekin QOTIB QOLGAN emas — aks holda o'quvchi to'rtlikni yodlab oladi.
    const sets = new Set();
    for (let n = 0; n < 40; n++) sets.add(api.gameDistractors(mix, cat, 3, true).map(w => w.en).sort().join(','));
    t('chalg\'ituvchilar to\'plami har raundda bir xil emas', sets.size > 1);
  }

  // ── 16.2 So'z hovuzi ───────────────────────────────────────────
  console.log('  16.2 So\'z hovuzi (lug\'at → unit so\'zlari, ko\'rmagan daraja YO\'Q):');
  {
    const a1 = api.CURRICULUM.A1;
    const a2 = api.CURRICULUM.A2;
    const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
    u.program = api.initProgram('A1');
    api.setUser(u);

    const p0 = api.gameWordPool();
    t('lug\'at bo\'sh bo\'lsa ham hovuz quriladi (unit so\'zlaridan)', p0.length > 0);
    const u1 = new Set(api.unitWords(a1[0]).map(w => w.en));
    t('A1-01 so\'zlari hovuzda', p0.some(w => u1.has(w.en)));
    const u2 = new Set(api.unitWords(a1[1]).map(w => w.en));
    t('hali OCHILMAGAN A1-02 so\'zlari hovuzda YO\'Q', !p0.some(w => u2.has(w.en)));
    const lvl2 = new Set(a2.flatMap(x => api.unitWords(x).map(w => w.en)));
    t('ko\'rmagan A2 darajasidan so\'z OLINMAYDI', !p0.some(w => lvl2.has(w.en)));
    t('buildRound shu hovuzdan ishlaydi', api.buildRound('speed', p0) !== null);

    u.program.unitIndex = 2;
    const p2 = api.gameWordPool();
    t('unit ochilgach A1-03 so\'zlari qo\'shiladi',
      p2.some(w => new Set(api.unitWords(a1[2]).map(x => x.en)).has(w.en)));
    t('A1-04 hali yo\'q', !p2.some(w => new Set(api.unitWords(a1[3]).map(x => x.en)).has(w.en)));

    // Lug'at 20 tadan ko'p bo'lsa — faqat o'rgangan so'zlar.
    u.vocabulary = POOL.map(w => ({ word:w.en, translation:w.uz, pronunciation:w.ipa }));
    const pv = api.gameWordPool();
    t('lug\'at ≥ 20 bo\'lsa unit so\'zlari qo\'shilmaydi', pv.length === POOL.length);
    t('hovuz o\'rgangan so\'zlardan', pv.every(w => POOL.some(x => x.en === w.en)));

    // B2 darajasidagi o'quvchi oldingi darajalarni ham ko'rgan.
    const u3 = { name:'T', level:'A2', goal:'general', xp:0, vocabulary:[], achievements:[] };
    u3.program = api.initProgram('A2');
    u3.program.unitIndex = 0;
    api.setUser(u3);
    const pa2 = api.gameWordPool();
    t('A2 o\'quvchisida A1 so\'zlari ham bor', pa2.some(w => u1.has(w.en)));
    const b1 = new Set((api.CURRICULUM.B1 || []).flatMap(x => api.unitWords(x).map(w => w.en)));
    t('A2 o\'quvchisida B1 so\'zlari YO\'Q', !pa2.some(w => b1.has(w.en)));

    t('gamesAvailable to\'liq hovuzda 3 ta o\'yin (TTS yo\'q)',
      api.gamesAvailable(POOL, false).sort().join(',') === 'anagram,memory,speed');
    t('TTS bo\'lsa quloq o\'yini ham ochiladi',
      api.gamesAvailable(POOL, true).includes('listen_game'));
    t('TTS yo\'q → listen_game MENYUDA yo\'q',
      !api.gamesAvailable(POOL, false).includes('listen_game'));
    t('hovuz bo\'sh bo\'lsa hech qaysi o\'yin ochilmaydi', api.gamesAvailable([], true).length === 0);
  }

  // ── 16.3 anagram ───────────────────────────────────────────────
  console.log('  16.3 anagram (harflar ko\'p to\'plami, uzunlik chegarasi):');
  {
    const ms = s => s.split('').sort().join('');
    let bad = 0;
    for (let n = 0; n < 60; n++) {
      const r = api.buildRound('anagram', POOL);
      if (!r) { bad++; continue; }
      if (ms(r.letters.join('')) !== ms(r.answer)) bad++;
      if (r.answer.length < api.ANAGRAM_MIN_LEN || r.answer.length > api.ANAGRAM_MAX_LEN) bad++;
    }
    t('aralashtirilgan harflar asl so\'zning ko\'p to\'plamiga teng', bad === 0);
    t('scrambleWord harf qo\'shmaydi/tushirmaydi',
      ms(api.scrambleWord('bottle').join('')) === ms('bottle'));
    t('scrambleWord odatda asl tartibdan farq qiladi',
      api.scrambleWord('elephant').join('') !== 'elephant');

    t('2 harfli so\'z tanlanmaydi', api.anagramEligible(W('on', 'x')) === false);
    t('11 harfli so\'z tanlanmaydi', api.anagramEligible(W('information', 'x')) === false);
    t('3 harfli so\'z mos', api.anagramEligible(W('cat', 'x')) === true);
    t('10 harfli so\'z mos', api.anagramEligible(W('friendship', 'x')) === true);
    t('ko\'p so\'zli ibora tanlanmaydi', api.anagramEligible(W('good morning', 'x')) === false);

    // Chegaradan tashqaridagilar aralashgan hovuzdan HAM faqat mosi olinadi.
    const mixed = [W('on','x'), W('information','x'), W('at','x'), W('table','stol')];
    let outside = 0;
    for (let n = 0; n < 30; n++) {
      const r = api.buildRound('anagram', mixed);
      if (!r || r.answer !== 'table') outside++;
    }
    t('chegaradan tashqaridagi so\'zlar hech qachon tanlanmaydi', outside === 0);
  }

  // ── 16.4 speed kombo ───────────────────────────────────────────
  console.log('  16.4 speed kombo (5 → ×2, 10 → ×3, xato nolga tushiradi):');
  {
    t('comboMult(0) = 1', api.comboMult(0) === 1);
    t('comboMult(4) = 1', api.comboMult(4) === 1);
    t('comboMult(5) = 2', api.comboMult(api.GAME_COMBO_X2) === 2);
    t('comboMult(9) = 2', api.comboMult(9) === 2);
    t('comboMult(10) = 3', api.comboMult(api.GAME_COMBO_X3) === 3);

    let s = api.newGameState();
    for (let i = 0; i < 5; i++) s = api.scoreRound(s, true);
    t('5 ta to\'g\'ri → ball 5 (hali ×1)', s.score === 5 && s.combo === 5);
    t('endi ko\'paytma ×2', s.mult === 2);
    s = api.scoreRound(s, true);
    t('6-javob ×2 bilan sanaldi (5 → 7)', s.score === 7);
    for (let i = 0; i < 4; i++) s = api.scoreRound(s, true);
    t('10 ta ketma-ket → ko\'paytma ×3', s.mult === 3);
    const before = s.score, bc = s.bestCombo;
    s = api.scoreRound(s, false);
    t('xato kombo\'ni NOLGA tushiradi', s.combo === 0 && s.mult === 1);
    t('xato ball qo\'shmaydi', s.score === before);
    t('xato eng uzun kombo\'ni saqlaydi', s.bestCombo === bc && bc === 10);
    t('xatolar sanaladi', s.wrong === 1);
    s = api.scoreRound(s, true);
    t('xatodan keyin yana ×1 dan boshlanadi', s.score === before + 1);
    // scoreRound SOF: eski holatni o'zgartirmaydi.
    const base = api.newGameState();
    api.scoreRound(base, true);
    t('scoreRound sof (kirish holati o\'zgarmaydi)', base.score === 0 && base.combo === 0);
    // anagram ball: yordam olingan so'z arzonroq.
    const withHint = api.scoreRound(api.newGameState(), true, api.ANAGRAM_HINT_POINTS);
    const noHint   = api.scoreRound(api.newGameState(), true, api.ANAGRAM_POINTS);
    t('yordam olingan anagram kamroq ball beradi', withHint.score < noHint.score);
  }

  // ── 16.5 memory ────────────────────────────────────────────────
  console.log('  16.5 memory (12 karta, 6 juft, har juft bir marta):');
  {
    let bad = [];
    for (let n = 0; n < 30; n++) {
      const r = api.buildRound('memory', POOL);
      if (!r) { bad.push('null'); break; }
      if (r.cards.length !== 2 * api.GAME_MEMORY_PAIRS) bad.push('karta soni');
      if (r.pairs.length !== api.GAME_MEMORY_PAIRS) bad.push('juft soni');
      const byPair = {};
      r.cards.forEach(c => { (byPair[c.pair] = byPair[c.pair] || []).push(c.face); });
      if (Object.keys(byPair).length !== api.GAME_MEMORY_PAIRS) bad.push('juft id soni');
      for (const k of Object.keys(byPair)) {
        if (byPair[k].sort().join(',') !== 'en,uz') bad.push('juft en/uz emas');
      }
      // Har so'z bir marta: 6 juft — 6 xil so'z.
      if (new Set(r.pairs.map(w => w.en)).size !== api.GAME_MEMORY_PAIRS) bad.push('so\'z takrorlandi');
    }
    t(`12 karta / 6 juft / har juft bir marta${bad.length ? ' — ' + bad[0] : ''}`, bad.length === 0);
    const r = api.buildRound('memory', POOL);
    t('bir tomonda inglizcha, ikkinchisida o\'zbekcha',
      r.cards.filter(c => c.face === 'en').every(c => c.text === c.word.en) &&
      r.cards.filter(c => c.face === 'uz').every(c => c.text === c.word.uz));
    // Vaqt cheklovi yo'q: raund obyektida deadline umuman yo'q.
    t('memory raundida vaqt maydoni yo\'q (sokin o\'yin)',
      r.endsAt === undefined && r.seconds === undefined);
  }

  // ── 16.6 Rekord saqlash ────────────────────────────────────────
  console.log('  16.6 Rekord (memory\'da KICHIKROQ yaxshiroq):');
  {
    delete store[api.GAMES_KEY];
    const g0 = api.getGames();
    t('eski foydalanuvchida standart qiymat (crash yo\'q)',
      g0.speed.best === 0 && g0.memory.best === null && g0.anagram.plays === 0);
    t('to\'rt o\'yin ham bor', api.GAME_KEYS.length === 4 && Object.keys(g0).length === 4);

    let r = api.recordGame('speed', 12);
    t('birinchi natija rekord bo\'ladi', r.best === 12 && r.improved === true && r.plays === 1);
    r = api.recordGame('speed', 7);
    t('pastroq ball rekordni buzmaydi', r.best === 12 && r.improved === false && r.plays === 2);
    r = api.recordGame('speed', 20);
    t('yuqoriroq ball yangi rekord', r.best === 20 && r.improved === true);

    r = api.recordGame('memory', 14);
    t('memory birinchi natija rekord', r.best === 14 && r.improved === true);
    r = api.recordGame('memory', 9);
    t('memory: KICHIKROQ natija yaxshiroq', r.best === 9 && r.improved === true);
    r = api.recordGame('memory', 11);
    t('memory: kattaroq natija rekordni buzmaydi', r.best === 9 && r.improved === false);
    t('betterScore memory\'da teskari',
      api.betterScore('memory', 5, 6) === true && api.betterScore('speed', 5, 6) === false);

    t('rekord localStorage\'ga yozildi', JSON.parse(store[api.GAMES_KEY]).memory.best === 9);
    // Buzuq/eski yozuv ham yiqitmaydi.
    store[api.GAMES_KEY] = JSON.stringify({ speed:{ best:'x' }, memory:null });
    const g1 = api.getGames();
    t('buzuq yozuv standartga tushadi', g1.speed.best === 0 && g1.memory.best === null);
    delete store[api.GAMES_KEY];
    api.ensureGames();
    t('ensureGames standart yozuvni yaratadi', !!store[api.GAMES_KEY]);
  }

  // ── 16.7 XP: o'yin vazifadan ARZON ─────────────────────────────
  console.log('  16.7 XP (o\'yin vazifadan kam):');
  {
    t('GAME_XP_MAX vazifa XP\'sining yarmi', api.GAME_XP_MAX === Math.floor(api.XP_PER_TASK / 2));
    t('GAME_XP_MAX < XP_PER_TASK', api.GAME_XP_MAX < api.XP_PER_TASK);
    t('juda katta ball ham tepani oshmaydi', api.gameXp('speed', { score: 9999 }) === api.GAME_XP_MAX);
    t('kichik ball kam XP', api.gameXp('speed', { score: 6 }) === 2);
    t('nol ball → 0 XP', api.gameXp('speed', { score: 0 }) === 0);
    t('ideal memory → to\'liq (lekin cheklangan) XP',
      api.gameXp('memory', { attempts: api.GAME_MEMORY_PAIRS }) === api.GAME_XP_MAX);
    t('sekin memory → kamroq XP',
      api.gameXp('memory', { attempts: 20 }) < api.gameXp('memory', { attempts: 8 }));
    t('o\'ynalmagan memory → 0 XP', api.gameXp('memory', { attempts: 0 }) === 0);
    let over = 0;
    for (const k of api.GAME_KEYS) {
      if (api.gameXp(k, { score: 5000, attempts: 6 }) >= api.XP_PER_TASK) over++;
    }
    t('hech bir o\'yin vazifa XP\'siga yetmaydi', over === 0);
  }

  // ── 16.8 Navigatsiya — bayroqqa bog'liq ────────────────────────
  console.log('  16.8 Navigatsiya:');
  {
    api.setOffline(false);
    const off = api.navTabs().map(x => x.id);
    t('OFFLINE_BUILD=false: o\'yin tabi YO\'Q', !off.includes('games'));
    t('OFFLINE_BUILD=false: navigatsiya o\'zgarmagan',
      off.join(',') === api.NAV_TABS.map(x => x.id).join(','));

    api.setOffline(true);
    const on = api.navTabs().map(x => x.id);
    t('OFFLINE_BUILD=true: o\'yin tabi bor', on.includes('games'));
    t('offline bilkada AI Ustoz va eski Testlar (quiz mode) baribir yo\'q',
      !on.includes('ai') && !on.includes('tests'));
    t('o\'yin va yangi Testlar tabi bir qatorda turadi', on.join(',') === 'home,tasks,games,quiz,progress');
    api.setOffline(false);
  }

  // ── 16.9 Render — zudlik bilan vizual javob ────────────────────
  // Ekran chizilishi ham sinaladi: aks holda o'yin ichidagi TypeError faqat
  // qurilmada ko'rinadi (offlineBox uchun 14-bo'lim aynan shu sababdan bor).
  console.log('  16.9 Render (yashil/qizil + animatsiya):');
  {
    const mkR = (game, round, extra) => Object.assign({
      game, round, state: api.newGameState(), flash:null, lock:false, over:false,
      result:null, xp:0, seen:[], rounds:1, typed:[], hint:false,
      attempts:0, open:[], done:[], endsAt: Date.now() + 60000,
    }, extra || {});

    const sp = mkR('speed', api.buildRound('speed', POOL));
    let h = api.gameBody(sp);
    t('speed: 4 variant tugmasi', (h.match(/class="gm-opt/g) || []).length === api.GAME_OPTIONS);
    t('speed: so\'z ekranda', h.includes(sp.round.prompt));
    t('speed: klaviatura ochilmaydi', !h.includes('<textarea') && !h.includes('<input'));

    const wrong = (sp.round.answer + 1) % api.GAME_OPTIONS;
    h = api.gameBody(mkR('speed', sp.round, { flash:{ i:wrong, ok:false } }));
    t('speed: xato → qizil + silkinish', h.includes('gm-shake') && h.includes('border-red-500'));
    t('speed: xato → to\'g\'ri javob yashil ko\'rsatiladi', h.includes('border-emerald-500'));
    t('speed: xato → 2 soniya jarima aytiladi', /2 soniya jarima/.test(h));
    h = api.gameBody(mkR('speed', sp.round, { flash:{ i:sp.round.answer, ok:true } }));
    t('speed: to\'g\'ri → yashil + masshtab animatsiyasi', h.includes('gm-pop') && h.includes('border-emerald-500'));

    const ls = mkR('listen_game', api.buildRound('listen_game', POOL));
    h = api.gameBody(ls);
    t('listen_game: 🔊 tugma bor', h.includes('gm-say'));
    t('listen_game: variantlar inglizcha ko\'rsatiladi', ls.round.options.every(o => h.includes(o)));

    const mem = mkR('memory', api.buildRound('memory', POOL));
    h = api.gameBody(mem);
    t('memory: 12 karta', (h.match(/class="gm-cell/g) || []).length === 2 * api.GAME_MEMORY_PAIRS);
    t('memory: yopiq karta matnini oshkor qilmaydi', !h.includes(mem.round.pairs[0].en));
    t('memory: vaqt cheklovi yo\'qligi aytiladi', /Vaqt cheklovi yo'q/.test(h));
    t('memory: sarlavhada taymer yo\'q', !/⏱/.test(api.gameHeadStats(mem)));
    t('speed: sarlavhada taymer bor', /⏱/.test(api.gameHeadStats(sp)));

    const an = mkR('anagram', api.buildRound('anagram', POOL));
    h = api.gameBody(an);
    t('anagram: har harf uchun tugma', (h.match(/class="gm-letter/g) || []).length === an.round.letters.length);
    t('anagram: o\'zbekcha tarjima ko\'rsatiladi', h.includes(an.round.word.uz));
    t('anagram: javob avvaldan ko\'rinmaydi', !h.includes(`>${an.round.answer}<`));
    h = api.gameBody(mkR('anagram', an.round, { hint:true, typed:[0] }));
    t('anagram: yordam ochilganda ogohlantiriladi', /ball kamayadi/.test(h));

    const over = mkR('speed', sp.round, { over:true, xp:7,
      result:{ best:42, plays:3, improved:true }, state:{ score:42, combo:0, bestCombo:9, correct:20, wrong:2, mult:1 } });
    h = api.gameBody(over);
    t('yakun: nechta to\'g\'ri ko\'rsatiladi', h.includes('>20<'));
    t('yakun: eng uzun kombo ko\'rsatiladi', h.includes('>9<'));
    t('yakun: rekord ko\'rsatiladi', /Yangi rekord/.test(h) && h.includes('42'));
    t('yakun: XP ko\'rsatiladi', /\+7 XP/.test(h));
    t('yakun: "Yana" tugmasi bor', h.includes('gm-again'));

    // Menyu ham chizilsin — TTS yo'q holatda quloq o'yini ko'rinmasligi shart.
    const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
    u.program = api.initProgram('A1');
    api.setUser(u);
    api.setOffline(true);
    let crashed = null;
    try { api.renderGames(); } catch (e) { crashed = e.message; }
    t(`renderGames yiqilmaydi${crashed ? ' — ' + crashed : ''}`, crashed === null);
    api.setOffline(false);

    t('anagram sessiyasi cheklangan', api.GAME_ANAGRAM_WORDS > 0);
    t('listen_game sessiyasi cheklangan', api.GAME_LISTEN_ROUNDS > 0);
  }

  // O'yinlar dastur mexanizmiga TEGMAYDI — bu butun bo'limning shartnomasi.
  {
    const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[],
                streak:0, lastTaskDay:null };
    u.program = api.initProgram('A1');
    api.setUser(u);
    const snap = JSON.stringify(u.program);
    api.buildRound('speed', POOL);
    api.buildRound('memory', POOL);
    api.buildRound('anagram', POOL);
    api.scoreRound(api.newGameState(), true);
    api.recordGame('anagram', 5);
    t('o\'yin dastur holatini o\'zgartirmaydi', JSON.stringify(u.program) === snap);
    t('o\'yin streak bermaydi', u.streak === 0 && u.lastTaskDay === null);
    t('o\'yin kunlik normani sarflamaydi', u.program.doneToday.count === 0);
  }
}

// ── 17. TESTLAR (docs/specs/offline-testlar.md) ──────────────────
// Mavjud exam/levelExam massivlarini dastur oqimidan tashqarida
// o'ynatadigan sof sinov rejimi. Yangi kontent yozilmaydi — faqat
// data/tasks-<lv>.json dagi mavjudlarini o'qiydi.
console.log("17. Testlar — sof mantiq:");
{
  const mkExamItem = (i) => ({ q:`Q${i}?`, options:['a','b','c','d'], answer: i % 4 });
  const mkUnit = (id, examLen) => ({
    id, title:`Unit ${id}`,
    tasks: [],
    exam: examLen ? Array.from({ length: examLen }, (_, i) => mkExamItem(i)) : [],
  });

  // ── 17.1 availableQuizzes — bo'sh/mavjud bo'lmagan exam/levelExam chiqarilmaydi
  console.log('  17.1 availableQuizzes (bo\'sh/mavjud bo\'lmagan chiqarilmaydi):');
  {
    const fake = {
      A1: {
        units: [mkUnit('A1-01', 8), mkUnit('A1-02', 0), mkUnit('A1-03', 8)],
        levelExam: Array.from({ length: 10 }, (_, i) => mkExamItem(i)),
      },
      A2: {
        units: [mkUnit('A2-01', 8)],
        levelExam: [],   // bo'sh — ko'rinmasligi shart
      },
      // B1 umuman yo'q — mavjud emas, ko'rinmasligi shart
    };
    const list = api.availableQuizzes(fake);
    const keys = list.map(q => q.key);
    t('A1-01 (exam bor) ro\'yxatda', keys.includes('A1-A1-01'));
    t('A1-02 (exam bo\'sh) ro\'yxatda YO\'Q', !keys.includes('A1-A1-02'));
    t('A1-03 (exam bor) ro\'yxatda', keys.includes('A1-A1-03'));
    t('A1 levelExam (bor) ro\'yxatda', keys.includes('A1-levelExam'));
    t('A2-01 (exam bor) ro\'yxatda', keys.includes('A2-A2-01'));
    t('A2 levelExam (bo\'sh) ro\'yxatda YO\'Q', !keys.includes('A2-levelExam'));
    t('B1 (data yo\'q) hech narsa chiqarmaydi', !keys.some(k => k.startsWith('B1-')));
    t('faqat haqiqiy elementlar sanaladi', list.length === 4);
    const unitEntry = list.find(q => q.key === 'A1-A1-01');
    t('unit elementi kind=unit', unitEntry.kind === 'unit' && unitEntry.unitId === 'A1-01');
    const levelEntry = list.find(q => q.key === 'A1-levelExam');
    t('daraja elementi kind=level', levelEntry.kind === 'level' && levelEntry.unitId === null);

    t('bo\'sh obyekt bilan chaqirilsa bo\'sh ro\'yxat', api.availableQuizzes({}).length === 0);
  }

  // ── 17.2 buildQuizSession / scoreQuizAnswer — to'g'ri hisoblash
  console.log('  17.2 buildQuizSession / scoreQuizAnswer:');
  {
    const items = Array.from({ length: 4 }, (_, i) => mkExamItem(i)); // answer: 0,1,2,3
    let s = api.buildQuizSession(items);
    t('boshlang\'ich sessiya: idx=0, correct=0', s.idx === 0 && s.correct === 0 && s.answers.length === 0);

    s = api.scoreQuizAnswer(s, 0);   // to'g'ri (item0.answer===0)
    t('to\'g\'ri javob → correct oshadi', s.correct === 1 && s.idx === 1);
    t('answers massiviga yoziladi', s.answers[0].ok === true && s.answers[0].chosenIdx === 0);

    s = api.scoreQuizAnswer(s, 0);   // item1.answer===1, chosenIdx=0 → xato
    t('xato javob → correct oshmaydi', s.correct === 1 && s.idx === 2);
    t('xato answers massivida ok:false', s.answers[1].ok === false);

    s = api.scoreQuizAnswer(s, 2);   // to'g'ri
    s = api.scoreQuizAnswer(s, 3);   // to'g'ri
    t('sessiya oxirida nisbat to\'g\'ri chiqadi (3/4)', s.correct === 3 && s.idx === 4);
    t('quizPct to\'g\'ri foiz hisoblaydi', api.quizPct(s) === 75);
    t('bo\'sh sessiya foizi 0 (bo\'lishga 0)', api.quizPct(api.buildQuizSession([])) === 0);

    // Sof: kirish obyekti o'zgarmaydi.
    const base = api.buildQuizSession(items);
    const snap = JSON.stringify(base);
    api.scoreQuizAnswer(base, 0);
    t('scoreQuizAnswer sof (kirish holati o\'zgarmaydi)', JSON.stringify(base) === snap);
  }

  // ── 17.3 Saqlash (eb_quiz_results) ───────────────────────────────
  console.log('  17.3 Saqlash (eb_quiz_results):');
  {
    delete store['eb_quiz_results'];
    t('boshlang\'ich holat bo\'sh', Object.keys(api.getQuizResults()).length === 0);
    let r = api.recordQuizResult('A1-A1-01', 60);
    t('birinchi urinish: best=60, attempts=1', r.best === 60 && r.attempts === 1 && r.improved === true);
    r = api.recordQuizResult('A1-A1-01', 40);
    t('pastroq natija: best o\'zgarmaydi, attempts oshadi', r.best === 60 && r.attempts === 2 && r.improved === false);
    r = api.recordQuizResult('A1-A1-01', 90);
    t('yuqoriroq natija: yangi rekord', r.best === 90 && r.attempts === 3 && r.improved === true);
    const all = api.getQuizResults();
    t('shakl <LEVEL>-<unitId|levelExam> kaliti bilan saqlanadi',
      all['A1-A1-01'] && all['A1-A1-01'].best === 90 && all['A1-A1-01'].attempts === 3);
    delete store['eb_quiz_results'];
  }

  // ── 17.4 Mavjud darajalarni oltin javob bilan to'liq yurish ──────
  // exam/levelExam data/tasks-*.json dan — yangi fixture kerak emas.
  // Yarim yozilgan daraja (B2/C1/C2 hali muallif tomonidan yozilmoqda)
  // "yiqildi" deb ko'rsatilmaydi — 14b dagi bilan bir xil qoida.
  console.log('  17.4 Mavjud darajalarni oltin javob bilan yurish (unit exam + levelExam):');
  {
    for (const lv of api.LEVELS) {
      const url = new URL(`../data/tasks-${lv.toLowerCase()}.json`, import.meta.url);
      if (!fs.existsSync(url)) { console.log(`     —    ${lv}: fayl yo'q, o'tkazildi`); continue; }
      const data = JSON.parse(fs.readFileSync(url, 'utf8'));
      const units = Array.isArray(data.units) ? data.units : [];
      const holesUnits = units.filter(u => !Array.isArray(u.exam) || !u.exam.length).map(u => u.id);
      const noLevelExam = !Array.isArray(data.levelExam) || !data.levelExam.length;
      if (holesUnits.length || noLevelExam) {
        console.log(`     —    ${lv}: kontent to'liq emas (${holesUnits.length} unit imtihoni, levelExam ${noLevelExam ? "yo'q" : 'bor'}), o'tkazildi`);
        continue;
      }

      const src = { [lv]: data };
      const quizzes = api.availableQuizzes(src);
      t(`${lv}: barcha unit + daraja imtihoni ro'yxatda (${units.length + 1} ta)`,
        quizzes.length === units.length + 1);

      let bad = [];
      for (const q of quizzes) {
        let s = api.buildQuizSession(q.items);
        while (s.idx < s.items.length) {
          s = api.scoreQuizAnswer(s, s.items[s.idx].answer);   // oltin javob
        }
        if (api.quizPct(s) !== 100) bad.push(`${q.key}: ${s.correct}/${s.items.length}`);
      }
      t(`${lv}: har bir unit exam + levelExam oltin javob bilan 100% beradi${bad.length ? ' — ' + bad.slice(0,3).join(' | ') : ''}`,
        bad.length === 0);
    }
  }

  // ── 17.5 Dastur holatiga hech narsa yozmaydi ─────────────────────
  console.log('  17.5 Dastur holatiga (user.program) ta\'sir yo\'q:');
  {
    const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[],
                streak:0, lastTaskDay:null };
    u.program = api.initProgram('A1');
    api.setUser(u);
    const snap = JSON.stringify(u.program);
    const items = Array.from({ length: 4 }, (_, i) => mkExamItem(i));
    let s = api.buildQuizSession(items);
    s = api.scoreQuizAnswer(s, 0);
    api.recordQuizResult('A1-A1-01', api.quizPct(s));
    t('Testlar dastur holatini o\'zgartirmaydi', JSON.stringify(u.program) === snap);
    t('Testlar streak bermaydi', u.streak === 0 && u.lastTaskDay === null);
    t('Testlar kunlik normani sarflamaydi', u.program.doneToday.count === 0);
  }

  // ── 17.6 navTo('quiz') — bayroqqa bog'liq ────────────────────────
  console.log('  17.6 navTo bayroqqa bog\'liq:');
  {
    const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
    u.program = api.initProgram('A1');
    api.setUser(u);

    api.setOffline(false);
    let crashed = null;
    try { api.navTo('quiz'); } catch (e) { crashed = e.message; }
    t(`OFFLINE_BUILD=false: navTo('quiz') xatosiz${crashed ? ' — ' + crashed : ''} (renderDashboard'ga tushadi)`, crashed === null);

    api.setOffline(true);
    crashed = null;
    try { api.navTo('quiz'); } catch (e) { crashed = e.message; }
    t(`OFFLINE_BUILD=true: navTo('quiz') xatosiz${crashed ? ' — ' + crashed : ''} (renderQuizList'ga tushadi)`, crashed === null);
    api.setOffline(false);
  }
}

// ── 15. OFFLINE_BUILD = false — regressiya yo'q ──────────────────
console.log('15. Yetkazilayotgan holat:');
t('OFFLINE_BUILD false yetkaziladi', api.getOffline() === false);
{
  // Bayroq o'chiq bo'lganda offline shoxlarining birortasi ham ochilmaydi:
  // taskBox eski yo'ldan ketadi (renderAI), submitTask matn kutadi.
  const u = { name:'T', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
  u.program = api.initProgram('A1');
  api.setUser(u);
  api.markLessonSeen(api.getUnit().id);
  api.issueTask('translate', 'AI matni');
  t('offline bo\'lmagan vazifada current.offline yo\'q', u.program.current.offline === undefined);
  t('taskLabel onlayn turlarni o\'zgartirmaydi', api.taskLabel('speak').title === api.TASK_TYPES.speak.title);
  t('taskLabel write ham o\'zgarmaydi', api.taskLabel('write').title === api.TASK_TYPES.write.title);
}

console.log(fails === 0 ? '\nHAMMASI OK' : `\n${fails} TA TEST YIQILDI`);
process.exit(fails === 0 ? 0 : 1);
