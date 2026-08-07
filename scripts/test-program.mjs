import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.log('SCRIPT BLOKI TOPILMADI'); process.exit(1); }
const src = m[1];

// 1. Sintaksis
try { new Function(src); console.log('1. Sintaksis: OK'); }
catch (e) { console.log('1. Sintaksis XATO:', e.message); process.exit(1); }

// 2. Logika testi — brauzer API'larini soxtalashtirib script'ni ishga tushiramiz
const store = {};
const stubs = {
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  document: null,   // quyida to'ldiriladi
  window: {},
  crypto: { randomUUID: () => '00000000-1111-2222-3333-444444444444' },
  fetch: async () => ({ ok:false, status:0, json: async () => ({}) }),
  speechSynthesis: undefined,
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  navigator: {},
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

// init() ni chaqirtirmaymiz — DOM'ga tegadi
const patched = src.replace(/^init\(\);\s*$/m, '');
const names = Object.keys(stubs);
const exported = ['initProgram','getUnit','getTaskType','canStartTask','issueTask','applyResult',
                  'advance','levelUp','calibrate','rollDaily','todayStr','currentLevel','xpLevel',
                  'parseResult','buildProgramSystem','programContext','buildSystem','isAiError',
                  'unitWords','needsLesson','markLessonSeen','seedUnitWords','skipTask',
                  'CURRICULUM','LEVELS','PASS_THRESHOLD','MAX_DAILY_TASKS','TASKS_PER_UNIT','TASK_GUIDE',
                  'MAX_ATTEMPTS_BEFORE_SKIP'];
const runner = new Function(...names, `${patched}\n; return { ${exported.join(',')}, setUser:u=>{user=u}, getUser:()=>user };`);
const api = runner(...names.map(n => stubs[n]));

let fails = 0;
const t = (label, cond) => { console.log(`   ${cond ? 'OK  ' : 'FAIL'} ${label}`); if (!cond) fails++; };

// --- Vaqt zonasi
console.log('2. todayStr() Toshkent vaqti:');
const utcDate = new Date().toISOString().split('T')[0];
const tzDate = api.todayStr();
const expected = new Date(Date.now() + 5*3600000).toISOString().split('T')[0];
t(`todayStr()=${tzDate} (UTC=${utcDate}, kutilgan=${expected})`, tzDate === expected);

// --- Dastur holati
console.log('3. Dastur holati:');
const u = { name:'Test', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
u.program = api.initProgram('A1');
api.setUser(u);

t('getUnit() = A1-01', api.getUnit()?.id === 'A1-01');
t("getTaskType() = 'translate'", api.getTaskType() === 'translate');
t('canStartTask() ok', api.canStartTask().ok === true);

api.issueTask('translate', 'test prompt');
t("vazifa ochilgach canStartTask reason='open_task'", api.canStartTask().reason === 'open_task');

// --- PASS chegarasi
console.log('4. PASS chegarasi (0.8):');
let r = api.applyResult({ correct:4, total:5 });
t('4/5 → passed', r.passed === true);
t('taskIndex 0 → 1', u.program.taskIndex === 1);
t('doneToday.count = 1', u.program.doneToday.count === 1);
t('XP +25', u.xp === 25);

api.issueTask('build', 'p2');
r = api.applyResult({ correct:3, total:5 });
t('3/5 → failed', r.passed === false);
t('taskIndex O\'ZGARMAYDI (1)', u.program.taskIndex === 1);
t('attempts = 1', u.program.current.attempts === 1);
t('XP oshmadi (25)', u.xp === 25);
t('doneToday hali 1', u.program.doneToday.count === 1);

// --- 3 urinish → relief
console.log('5. 3 urinishdan keyin yengillashtirish:');
api.applyResult({ correct:0, total:5 });
t('2-urinishdan keyin relief=false', u.program.current.relief === false);
r = api.applyResult({ correct:1, total:5 });
t('3-urinishdan keyin relief=true', u.program.current.relief === true);
t('attempts = 3', u.program.current.attempts === 3);

// --- Kunlik limit
console.log('6. Kunlik limit (3):');
api.applyResult({ correct:5, total:5 });          // 2-vazifa o'tdi
api.issueTask(api.getTaskType(), 'p3');
api.applyResult({ correct:5, total:5 });          // 3-vazifa o'tdi
t('doneToday.count = 3', u.program.doneToday.count === 3);
t("canStartTask reason='daily_limit'", api.canStartTask().reason === 'daily_limit');
u.program.doneToday.date = '2020-01-01';
t('ertasi kuni ochiladi', api.canStartTask().ok === true);

// --- Unit → daraja o'tishi
console.log('7. Unit va daraja o\'tishi:');
const A1N = api.CURRICULUM.A1.length, A2N = api.CURRICULUM.A2.length;
t(`CURRICULUM A1=${A1N}, A2=${A2N} (12/12 kutiladi)`, A1N === 12 && A2N === 12);

const u2 = { name:'T2', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
u2.program = api.initProgram('A1');
api.setUser(u2);
const doUnit = (u) => {
  for (let i = 0; i <= api.TASKS_PER_UNIT; i++) {   // 6 vazifa + unit imtihoni
    api.issueTask(api.getTaskType(), 'p');
    u.program.doneToday.count = 0;
    api.applyResult({ correct:5, total:5 });
  }
};
for (let i = 0; i < api.TASKS_PER_UNIT; i++) {
  api.issueTask(api.getTaskType(), 'p');
  u2.program.doneToday.count = 0;
  api.applyResult({ correct:5, total:5 });
}
t("7-qadam = 'unit_exam'", api.getTaskType() === 'unit_exam');
api.issueTask('unit_exam', 'p'); u2.program.doneToday.count = 0;
api.applyResult({ correct:5, total:5 });
t('A1-01 passedUnits ichida', u2.program.passedUnits.includes('A1-01'));
t('unitIndex → 1 (A1-02)', u2.program.unitIndex === 1);
t('taskIndex nolga tushdi', u2.program.taskIndex === 0);

// Qolgan 11 unitni ham tugatamiz → daraja imtihoni
for (let i = 1; i < A1N; i++) doUnit(u2);
t(`barcha ${A1N} unit passedUnits da`, u2.program.passedUnits.length === A1N);
t('levelExam.pending = true', u2.program.levelExam.pending === true);
t("getTaskType() = 'level_exam'", api.getTaskType() === 'level_exam');

// Daraja imtihonidan yiqilish → takror vazifalar
api.issueTask('level_exam', 'exam');
r = api.applyResult({ correct:2, total:10 });
t('imtihon FAIL → remedial=2', u2.program.levelExam.remedial === 2);
t("takror paytida getTaskType()='translate'", api.getTaskType() === 'translate');
api.issueTask('translate', 'rem1'); u2.program.doneToday.count=0; api.applyResult({correct:5,total:5});
api.issueTask('translate', 'rem2'); u2.program.doneToday.count=0; api.applyResult({correct:5,total:5});
t('takrorlar tugadi → yana level_exam', api.getTaskType() === 'level_exam');
api.issueTask('level_exam', 'exam2'); u2.program.doneToday.count=0;
api.applyResult({ correct:9, total:10 });
t('imtihon PASS → level A2', u2.program.level === 'A2');
t('unitIndex/taskIndex nolga tushdi', u2.program.unitIndex === 0 && u2.program.taskIndex === 0);
t('passedUnits tozalandi', u2.program.passedUnits.length === 0);
t('A2-01 ochildi', api.getUnit()?.id === 'A2-01');

// A2 tugagach B1 hali yo'q → "tayyorlanmoqda" holati
console.log("7b. A2 tugagach B1 hali yo'q:");
for (let i = 0; i < A2N; i++) doUnit(u2);
u2.program.doneToday.count = 0;
api.issueTask('level_exam', 'e'); api.applyResult({ correct:10, total:10 });
t("level → B1", u2.program.level === 'B1');
t("B1 CURRICULUM'da yo'q → getTaskType()=null", api.getTaskType() === null);
t("canStartTask reason='level_not_ready'", api.canStartTask().reason === 'level_not_ready');

// --- Kalibratsiya
console.log('8. Kalibratsiya (3 vazifa):');
const u3 = { name:'T3', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
u3.program = api.initProgram('A1');
api.setUser(u3);
for (let i = 0; i < 3; i++) {
  api.issueTask(api.getTaskType(), 'p');
  u3.program.doneToday.count = 0;
  api.applyResult({ correct:5, total:5 });   // 100%
}
t('3 ta natija yozildi', u3.program.calibration.results.length === 3);
const moved = api.calibrate();
t("3/3 mukammal → 'up' (A1→A2)", moved === 'up' && u3.program.level === 'A2');
t('calibration.checked = true', u3.program.calibration.checked === true);
t('kalibratsiyadan keyin unit/task nolga tushdi', u3.program.unitIndex === 0 && u3.program.taskIndex === 0);
t('ikkinchi marta ishlamaydi', api.calibrate() === null);

const u4 = { name:'T4', level:'A2', goal:'general', xp:0, vocabulary:[], achievements:[] };
u4.program = api.initProgram('A2');
u4.program.calibration.results = [0.2, 0.4, 0.0];
api.setUser(u4);
t("3/3 yiqilish → 'down' (A2→A1)", api.calibrate() === 'down' && u4.program.level === 'A1');

// --- currentLevel XP dan mustaqil
console.log('9. Daraja XP dan mustaqil:');
u4.xp = 99999;
t("currentLevel() = 'A1' (XP 99999 bo'lsa ham)", api.currentLevel() === 'A1');
t("xpLevel() = 'C2' (XP bari uchun)", api.xpLevel() === 'C2');

// --- parseResult
console.log('10. parseResult() markeri:');
t('birinchi qatorda 4/5', JSON.stringify(api.parseResult('📊 NATIJA: 4/5\n\n❌ Xato: ...')) === '{"correct":4,"total":5}');
t('bo\'shliqlar bilan', JSON.stringify(api.parseResult('📊  NATIJA:  10 / 10')) === '{"correct":10,"total":10}');
t('matn ichida ham topadi', api.parseResult('Salom!\n📊 NATIJA: 0/5')?.correct === 0);
t('marker yo\'q → null', api.parseResult("Yaxshi ish! Hammasi to'g'ri.") === null);
t('total=0 → null', api.parseResult('📊 NATIJA: 0/0') === null);
t('correct > total → null', api.parseResult('📊 NATIJA: 7/5') === null);
t('band markeri bilan chalkashmaydi', api.parseResult('🎯 Band: 6.5') === null);

// --- isAiError
console.log('11. isAiError():');
t('❌ xato', api.isAiError('❌ Xatolik') === true);
t('📡 internet', api.isAiError("📡 Internet aloqasi yo'q") === true);
t('⏳ limit', api.isAiError('⏳ Bugungi limit tugadi') === true);
t('oddiy javob false', api.isAiError('📊 NATIJA: 5/5') === false);

// --- Prompt yig'ilishi
console.log('12. Prompt yig\'ilishi:');
const u5 = { name:'Sardor', level:'A1', goal:'general', xp:0, achievements:[],
             vocabulary: Array.from({length:50},(_,i)=>({word:'w'+i, translation:'t', mastery:0})) };
u5.program = api.initProgram('A1');
api.setUser(u5);

const ctx = api.programContext();
t('kontekstda unit id bor', ctx.includes('A1-01'));
t('kontekstda grammatika bor', ctx.includes('to be') || ctx.includes('Grammatika:'));
t('kontekstda unit lug\'ati bor', ctx.includes("Unit lug'ati"));
t('lug\'at 30 ta bilan cheklangan (w49 bor, w19 yo\'q)', ctx.includes('w49') && !ctx.includes('w19'));

api.issueTask('translate', '1) Men talabaman.\n2) U shifokor.');
const issueSys = api.buildProgramSystem('issue');
const checkSys = api.buildProgramSystem('check');
t('issue promptda javob berish taqiqi bor', /Javoblarni O'ZING BERMA|javoblarsiz|Javoblarni BERMA/i.test(issueSys));
t('issue promptda relief yo\'q', !issueSys.includes('YENGILLASHTIRILGAN'));
t('check promptda berilgan vazifa matni bor', checkSys.includes('Men talabaman'));
t('check promptda 📊 NATIJA: N/5 talab qilingan', checkSys.includes('📊 NATIJA: N/5'));
t('check promptda "BIRINCHI QATOR" talabi bor', checkSys.includes('BIRINCHI QATOR'));
t('check promptda 🧩 Mavzu talabi bor', checkSys.includes('🧩 Mavzu'));

u5.program.current.relief = true;
t('relief=true → yengillashtirish ko\'rsatmasi qo\'shildi', api.buildProgramSystem('issue').includes('YENGILLASHTIRILGAN'));

// Payload chegarasi (chat/index.ts: MAX_PAYLOAD_CHARS = 20000)
const longest = Math.max(issueSys.length, checkSys.length);
t(`system prompt < 20000 belgi (eng uzuni ${longest})`, longest < 20000);
const chatSys = api.buildSystem('conversation');
t(`chat system prompt < 20000 (${chatSys.length})`, chatSys.length < 20000);
t('chat promptida ham dastur konteksti bor', chatSys.includes('A1-01'));

// Har tur uchun total to'g'ri promptga tushadi
console.log('13. Har vazifa turi:');
for (const [type, g] of Object.entries(api.TASK_GUIDE)) {
  u5.program.current.type = type;
  u5.program.current.relief = false;
  const s = api.buildProgramSystem('check');
  t(`${type}: 📊 NATIJA: N/${g.total}`, s.includes(`📊 NATIJA: N/${g.total}`));
}

// --- Curriculum so'z sxemasi
console.log('14. So\'z sxemasi { en, uz, ipa }:');
const allUnits = [...api.CURRICULUM.A1, ...api.CURRICULUM.A2];
t('har unitda 25 ta so\'z', allUnits.every(x => x.words.length === 25));
t('har so\'zda en/uz/ipa to\'liq',
  allUnits.every(x => x.words.every(w => w && w.en && w.uz && w.ipa)));
t('har unitda explain matni bor', allUnits.every(x => typeof x.explain === 'string' && x.explain.length > 20));
const enAll = allUnits.flatMap(x => x.words.map(w => w.en));
t(`600 noyob so'z (${enAll.length})`, enAll.length === 600 && new Set(enAll).size === 600);
const uw = api.unitWords(api.CURRICULUM.A1[0]);
t("unitWords() { en, uz, ipa } qaytaradi", uw[0].en === 'hello' && uw[0].uz.length > 0 && uw[0].ipa.length > 0);
t('unitWords() eski satr shaklini ham qabul qiladi',
  api.unitWords({ words:['test'] })[0].en === 'test');

// --- Mavzu darsi
console.log('15. Mavzu darsi:');
const u6 = { name:'T6', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
u6.program = api.initProgram('A1');
api.setUser(u6);
t('yangi unit boshida needsLesson() = true', api.needsLesson() === true);
t('markLessonSeen() birinchi marta true', api.markLessonSeen('A1-01') === true);
t('ko\'rilgandan keyin needsLesson() = false', api.needsLesson() === false);
t('markLessonSeen() takroriy chaqiruvda false', api.markLessonSeen('A1-01') === false);

api.issueTask('translate', 'p');
t('vazifa ochiq bo\'lsa needsLesson() = false', api.needsLesson() === false);
api.applyResult({ correct:5, total:5 });
t('unit o\'rtasida (taskIndex=1) needsLesson() = false', api.needsLesson() === false);

// Keyingi unitga o'tganda dars yana kerak
for (let i = 1; i <= api.TASKS_PER_UNIT; i++) {
  api.issueTask(api.getTaskType(), 'p');
  u6.program.doneToday.count = 0;
  api.applyResult({ correct:5, total:5 });
}
t('A1-02 ga o\'tildi', api.getUnit()?.id === 'A1-02');
t('yangi unitda needsLesson() yana true', api.needsLesson() === true);

// --- Lug'at seed
console.log('16. seedUnitWords() — lug\'at to\'ldirish:');
const u7 = { name:'T7', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
u7.program = api.initProgram('A1');
api.setUser(u7);
const added = api.seedUnitWords(api.CURRICULUM.A1[0]);
t('25 ta so\'z qo\'shildi', added === 25 && u7.vocabulary.length === 25);
const first = u7.vocabulary[0];
t('lug\'at yozuvi to\'liq (word/translation/pronunciation)',
  !!first.word && !!first.translation && !!first.pronunciation);
t('mastery 0 va darhol takrorlashga tayyor', first.mastery === 0 && first.nextReview <= Date.now());
t('XP berilmadi', u7.xp === 0);
t('ikkinchi chaqiruvda dublikat yo\'q',
  api.seedUnitWords(api.CURRICULUM.A1[0]) === 0 && u7.vocabulary.length === 25);
t('boshqa unit so\'zlari qo\'shiladi',
  api.seedUnitWords(api.CURRICULUM.A1[1]) === 25 && u7.vocabulary.length === 50);

// --- Chiqish yo'li (skip)
console.log('17. Tiqilib qolishdan chiqish yo\'li:');
const u8 = { name:'T8', level:'A1', goal:'general', xp:0, vocabulary:[], achievements:[] };
u8.program = api.initProgram('A1');
api.setUser(u8);
api.issueTask('translate', 'p');
t('skipTask() ruxsatsiz ishlamaydi', api.skipTask().reason === 'not_allowed');
for (let i = 1; i < api.MAX_ATTEMPTS_BEFORE_SKIP; i++) {
  r = api.applyResult({ correct:0, total:5 });
  t(`${i}-urinishdan keyin canSkip yo'q`, r.canSkip !== true);
}
r = api.applyResult({ correct:0, total:5 });
t(`${api.MAX_ATTEMPTS_BEFORE_SKIP}-urinishdan keyin canSkip = true`, r.canSkip === true);

const xpBefore = u8.xp;
const sk = api.skipTask();
t('skipTask() ok', sk.ok === true && sk.skipped === true);
t('keyingi vazifaga o\'tdi (taskIndex=1)', u8.program.taskIndex === 1);
t('XP berilmadi', u8.xp === xpBefore);
t('kunlik hisobga kirdi (erkin rejimlar ochiladi)', u8.program.doneToday.count === 1);
t('unit weakUnits ga yozildi', u8.program.weakUnits.includes('A1-01'));
t('vazifa yopildi', u8.program.current === null);
t('vazifasiz skipTask() ishlamaydi', api.skipTask().reason === 'no_task');
t('weakUnits promptga tushdi', api.programContext().includes('A1-01'));

// --- Yangi kontekst formati va payload chegarasi
console.log('18. Kontekst formati va payload:');
const u9 = { name:'Sardor', level:'A1', goal:'general', xp:0, achievements:[],
             vocabulary: Array.from({length:50},(_,i)=>({word:'w'+i, translation:'t', mastery:0})) };
u9.program = api.initProgram('A1');
api.setUser(u9);
const ctx2 = api.programContext();
t("lug'at 'en — uz' formatida", ctx2.includes('hello — salom'));
t('etalon tarjima talabi bor', ctx2.includes('AYNAN'));
// issue fazasi getTaskType() ga qaraydi — A1-01 da 'build' 2-qadamda turadi
u9.program.taskIndex = 1;
t("A1-01 2-qadam = 'build'", api.getTaskType() === 'build');
const buildSys = api.buildProgramSystem('issue');
u9.program.taskIndex = 0;
api.issueTask('build', 'p');
t("build promptida tarjimani o'ylab topish taqiqlangan", buildSys.includes("O'YLAB TOPMA"));
const revealSys = api.buildProgramSystem('reveal');
t("reveal fazasi to'g'ri javob so'raydi", revealSys.includes("TO'G'RI JAVOBLARNI"));
t('reveal fazasida 📊 NATIJA talab qilinmaydi', !revealSys.includes('📊 NATIJA: N/'));
// So'zlar endi ~3x uzunroq — 20000 belgi shiftini alohida tekshiramiz
let maxSys = 0;
for (const lv of ['A1','A2']) {
  for (let i = 0; i < api.CURRICULUM[lv].length; i++) {
    u9.program.level = lv; u9.program.unitIndex = i;
    for (const ph of ['issue','check','reveal']) maxSys = Math.max(maxSys, api.buildProgramSystem(ph).length);
  }
}
t(`barcha unitlar uchun system prompt < 20000 (eng uzuni ${maxSys})`, maxSys < 20000);

console.log(fails === 0 ? '\nHAMMASI OK' : `\n${fails} TA TEST YIQILDI`);
process.exit(fails === 0 ? 0 : 1);
