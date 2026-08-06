// Ovozli xabar yo'lini sinaydi — chat funksiyasi audioni har doim Gemini'ga yuboradi,
// shuning uchun model almashtirilganda buni alohida tekshirish shart.
// Ishlatish: node scripts/model-ab-audio.mjs <label> <path-to.wav>

import fs from 'node:fs';

const SB_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY3dhdnFieGpmbGd0eGVwZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjAxMzEsImV4cCI6MjA5ODEzNjEzMX0.8RA7w_L6C3fy_ytaJl6ipETz2WZuamFhSGcIQGMOXXo';
const TEST_UID = '00000000-0000-4000-8000-000000000abc';

const [label = 'audio', wav] = process.argv.slice(2);
if (!wav) { console.error('WAV yo\'li kerak'); process.exit(1); }

const system = `Sen ingliz tili repetitorisan. O'zbek foydalanuvchi bilan ishlaysan.
Foydalanuvchi: Test (A2 daraja)
Xatolarni quyidagi formatda ko'rsat:
❌ Xato: [...]
✅ To'g'ri: [...]
💡 Nima uchun: [o'zbekcha qisqa sabab]`;

const t0 = Date.now();
const res = await fetch(`${SB_URL}/functions/v1/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON },
  body: JSON.stringify({
    userId: TEST_UID,
    system,
    messages: [{ role: 'user', content: 'Ovozli xabar' }],
    mode: 'speak',
    profile: { name: 'Test', level: 'A2', goal: 'general' },
    audio: { data: fs.readFileSync(wav).toString('base64'), mimeType: 'audio/wav' },
  }),
});
const ms = Date.now() - t0;
const d = await res.json().catch(() => ({}));
const text = d.text || '';
console.log(`=== ${label} / audio — ${res.status}, ${ms}ms, ${text.length} chars`);
console.log(JSON.stringify({
  transcribed: /shop|brother|car/i.test(text),
  has_error_card: /❌/.test(text) && /✅/.test(text),
}));
console.log('---\n' + (text || JSON.stringify(d)));
