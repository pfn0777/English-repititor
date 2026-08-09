// initData imzo diagnostikasi. Ikki rejim:
//   node scripts/initdata-probe.mjs <bot_token>
//     -> sun'iy, TO'G'RI imzolangan initData yasab, deployed `chat` ga POST qiladi.
//        200 = server to'g'ri (ayb klientda), 401 = server buzuq.
//   node scripts/initdata-probe.mjs --verify "<initData>" <bot_token>
//     -> haqiqiy initData ni lokal tekshiradi, 4 variantni sinaydi.
// Token faqat argument sifatida beriladi — hech qayerga yozilmaydi.

import { createHmac, randomBytes } from 'node:crypto';

const CHAT_URL = 'https://wbcwavqbxjflgtxepdmf.supabase.co/functions/v1/chat';
const ORIGIN = 'http://localhost:5500';

const hmac = (key, msg) => createHmac('sha256', key).update(msg).digest();
const secretOf = (token) => hmac('WebAppData', token);

function dcsFrom(pairs, { withSignature }) {
  return pairs
    .filter(([k]) => k !== 'hash' && (withSignature || k !== 'signature'))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function decodedPairs(initData) {
  return [...new URLSearchParams(initData).entries()];
}

function rawPairs(initData) {
  return initData.split('&').map((p) => {
    const i = p.indexOf('=');
    return i === -1 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
  });
}

function verify(initData, token) {
  const hash = new URLSearchParams(initData).get('hash') || '';
  const secret = secretOf(token);
  const variants = [
    ['decoded, signature EXCLUDED', dcsFrom(decodedPairs(initData), { withSignature: false })],
    ['decoded, signature INCLUDED', dcsFrom(decodedPairs(initData), { withSignature: true })],
    ['raw,     signature EXCLUDED', dcsFrom(rawPairs(initData), { withSignature: false })],
    ['raw,     signature INCLUDED', dcsFrom(rawPairs(initData), { withSignature: true })],
  ];
  console.log('hash        :', hash || '(YO\'Q)');
  console.log('keys        :', [...new URLSearchParams(initData).keys()].sort().join(','));
  let matched = null;
  for (const [name, dcs] of variants) {
    const got = hmac(secret, dcs).toString('hex');
    const ok = got === hash;
    if (ok) matched = name;
    console.log(`${ok ? 'MOS  ' : 'mos emas'} ${name}  ${got.slice(0, 12)}…`);
  }
  console.log('');
  console.log(matched
    ? `NATIJA: "${matched}" varianti mos keldi.`
    : 'NATIJA: hech bir variant mos kelmadi -> bu initData BOSHQA bot tokeni bilan imzolangan.');
  return matched;
}

function makeInitData(token) {
  const user = JSON.stringify({ id: 777000, first_name: 'Probe', username: 'probe', language_code: 'uz' });
  const pairs = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['query_id', 'AA' + randomBytes(8).toString('hex')],
    ['signature', randomBytes(24).toString('base64url')],
    ['user', user],
  ];
  const hash = hmac(secretOf(token), dcsFrom(pairs, { withSignature: false })).toString('hex');
  return [...pairs, ['hash', hash]]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

async function probe(token) {
  const initData = makeInitData(token);
  console.log('Lokal tekshiruv (o\'z imzomizga qarshi):');
  verify(initData, token);
  console.log('\nDeployed `chat` ga POST...');
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      userId: '00000000-0000-4000-8000-000000000001',
      initData,
      system: 'Reply with the single word OK.',
      messages: [{ role: 'user', content: 'ping' }],
      mode: 'conversation',
      profile: { name: 'Probe', level: 'A1', goal: 'general' },
    }),
  });
  const body = await res.text();
  console.log('status:', res.status);
  console.log('body  :', body.slice(0, 400));
  console.log('');
  console.log(res.status === 401
    ? 'XULOSA: server sun\'iy TO\'G\'RI imzoni ham rad etdi -> ayb SERVERDA (yoki app_secrets.bot_token boshqa bot).'
    : 'XULOSA: server to\'g\'ri imzoni qabul qildi -> ayb KLIENTDA/launch manbasida (initData boshqa bot tomonidan imzolangan).');
}

const [a, b, c] = process.argv.slice(2);
if (a === '--verify') {
  if (!b || !c) { console.error('foydalanish: node scripts/initdata-probe.mjs --verify "<initData>" <bot_token>'); process.exit(2); }
  verify(b, c);
} else if (a) {
  await probe(a);
} else {
  console.error('foydalanish: node scripts/initdata-probe.mjs <bot_token>');
  process.exit(2);
}
