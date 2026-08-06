// Model A/B test — chat Edge Function orqali real dastur (program) rejimini sinaydi.
// Ishlatish:
//   node scripts/model-ab-test.mjs baseline
//   node scripts/model-ab-test.mjs lite
// Model app_secrets.model dan olinadi — skript modelni O'ZGARTIRMAYDI, faqat o'lchaydi.
// Argument shunchaki natija faylining nomi.

import fs from 'node:fs';
import path from 'node:path';

const SB_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3dhdnFieGpmbGd0eGVwZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjAxMzEsImV4cCI6MjA5ODEzNjEzMX0.8RA7w_L6C3fy_ytaJl6ipETz2WZuamFhSGcIQGMOXXo';
// Tozalash: delete from usage where user_id='00000000-0000-4000-8000-000000000abc';
//           delete from users where id='00000000-0000-4000-8000-000000000abc';
const TEST_UID = '00000000-0000-4000-8000-000000000abc';
const OUT_DIR = process.env.AB_OUT || path.join(process.cwd(), '.ab-test');

// index.html dagi A1-02 uniti (have got) — programContext() chiqishi bilan bir xil shakl.
const CONTEXT = `DASTUR: A1 darajasi, 2/12-unit
Unit A1-02 — Mening oilam
Maqsad: Oilam a'zolari haqida gapira olaman va nimam borligini ayta olaman
Grammatika: Egalik olmoshlari (my/your/his/her) va 'have got' — egalikni bildirish
Unit lug'ati (asosan SHULARDAN foydalan): have, has, got, his, her, our, their, family, mother, father, brother, sister, son, daughter, friend, old, young, year, how, many, two, three, but, not, very`;

const TONE = "Ko'proq o'zbek tilida tushuntir. Ingliz so'zlarni o'zbek harflarida ham yoz. Juda sodda gap qurilmasi.";

const HEAD = `Sen QATTIQ QO'L ingliz tili repetitorisan. O'zbek foydalanuvchi bilan ishlaysan.
Bu erkin suhbat EMAS — dastur bo'yicha vazifa. Mavzudan chetga chiqma, ortiqcha gap yozma.
Foydalanuvchi: Test
${CONTEXT}

USLUB:
${TONE}`;

// index.html: TASK_GUIDE.translate
const ISSUE_GUIDE = `5 ta O'ZBEKCHA jumla yoz — foydalanuvchi ularni inglizchaga o'giradi.
Jumlalar unit grammatikasiga va unit lug'atiga tayansin, oddiydan murakkabga.
Raqamlangan ro'yxat: 1) ... 5)
Javoblarni O'ZING BERMA. Salom, tushuntirish, qo'shimcha izoh yozma — faqat 5 ta jumla.`;

const CHECK_GUIDE = `Foydalanuvchi 5 ta tarjimani yubordi. Har birini ALOHIDA tekshir.
To'g'ri hisoblanadi: ma'no to'liq va grammatika to'g'ri.
Bitta harflik imlo xatosi kechiriladi. Grammatik xato, tushib qolgan so'z, noto'g'ri zamon — KECHIRILMAYDI.
Javob berilmagan jumla — noto'g'ri.`;

// index.html: buildProgramSystem('issue')
const SYSTEM_ISSUE = `${HEAD}

VAZIFA BERISH (Tarjima):
${ISSUE_GUIDE}

QOIDALAR:
1. Faqat vazifani yoz. Salomlashish, "omad", "tayyormisiz" kabi gaplar YOZMA.
2. Javoblarni oshkor qilma.
3. Yangi so'z kiritsang: 📌 **word** (talaffuz) — [o'zbekcha]`;

// Sobit vazifa matni — ikkala model bir xil narsani tekshirsin.
const GIVEN_TASK = `1) Mening ikkita akam bor.
2) Uning singlisi juda yosh.
3) Bizning oilamiz katta emas.
4) Ularning otasi o'qituvchi.
5) Sizning nechta do'stingiz bor?`;

// index.html: buildProgramSystem('check')
const SYSTEM_CHECK = `${HEAD}

BERILGAN VAZIFA:
${GIVEN_TASK}

TEKSHIRISH (Tarjima):
${CHECK_GUIDE}

JAVOB FORMATI — QAT'IY:
1. BIRINCHI QATOR aynan shunday bo'lsin: 📊 NATIJA: N/5
   (N — to'g'ri bandlar soni, 0 dan 5 gacha. Bu qator birinchi bo'lishi SHART.)
2. Keyin HAR BIR noto'g'ri band uchun alohida karta ber — birortasini ham tashlab ketma:
   ❌ Xato: [foydalanuvchi yozgani]
   ✅ To'g'ri: [to'g'ri variant]
   💡 Nima uchun: [qisqa sabab, o'zbekcha]
   🧩 Mavzu: [qisqa kategoriya, masalan: Present Simple yoki Artikllar]
   (3 ta xato bo'lsa 3 ta karta, 5 ta bo'lsa 5 ta karta.)
3. Oxirida 1-2 jumla rag'bat. To'g'ri qilganini ham ayt.
4. Har kartani qisqa yoz — 4 qatordan oshirma.`;

// 5 ta javob: 1,2,4 to'g'ri; 3 (zamon/inkor xato) va 5 (tuzilish xato) noto'g'ri → kutilgan 3/5.
const USER_ANSWER = `1) I have got two brothers.
2) His sister is very young.
3) Our family are not big.
4) Their father is a teacher.
5) How many friend you have got?`;

const SCENARIOS = [
  { name: 'issue', mode: 'program_issue', system: SYSTEM_ISSUE, messages: [{ role: 'user', content: 'Vazifani ber.' }] },
  { name: 'check', mode: 'program_check', system: SYSTEM_CHECK, messages: [{ role: 'user', content: USER_ANSWER }] },
];

// ── Tekshiruvchilar (index.html dagi parserlar bilan bir xil regexlar) ──
function gradeIssue(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^\d\)/.test(l));
  return {
    five_numbered_lines: numbered.length === 5,
    no_english_answers: !/\bI have got\b|\bis a teacher\b/i.test(text),
    numbered_count: numbered.length,
  };
}

function gradeCheck(text) {
  const first = text.trim().split('\n')[0];
  const m = text.match(/📊\s*NATIJA:\s*(\d{1,3})\s*\/\s*(\d{1,3})/);
  const cards = (text.match(/❌\s*Xato:/g) || []).length;
  return {
    marker_present: !!m,
    marker_on_first_line: /📊\s*NATIJA:/.test(first),
    parsed: m ? `${m[1]}/${m[2]}` : null,
    score_is_3_of_5: !!m && m[1] === '3' && m[2] === '5',
    error_cards: cards,
    two_error_cards: cards === 2,
    has_correct_line: /✅\s*To'g'ri:/.test(text),
    has_topic_line: /🧩\s*Mavzu:/.test(text),
  };
}

async function run(label) {
  const results = [];
  for (const s of SCENARIOS) {
    const t0 = Date.now();
    const res = await fetch(`${SB_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON },
      body: JSON.stringify({
        userId: TEST_UID,
        system: s.system,
        messages: s.messages,
        mode: s.mode,
        profile: { name: 'Test', level: 'A1', goal: 'general' },
      }),
    });
    const ms = Date.now() - t0;
    const data = await res.json().catch(() => ({}));
    const text = data.text || '';
    const grade = s.name === 'issue' ? gradeIssue(text) : gradeCheck(text);
    results.push({ scenario: s.name, status: res.status, ms, chars: text.length, error: data.error || null, grade, text });
    console.log(`\n=== ${label} / ${s.name} — ${res.status}, ${ms}ms, ${text.length} chars`);
    console.log(JSON.stringify(grade));
    console.log('---\n' + (text || JSON.stringify(data)));
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${label}.json`);
  fs.writeFileSync(out, JSON.stringify({ label, results }, null, 2), 'utf8');
  console.log(`\nSaqlandi: ${out}`);
}

const label = process.argv[2] || 'run';
await run(label);
