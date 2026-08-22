#!/usr/bin/env node
// Builds the APK payload into build/offline/ WITHOUT touching the shipped
// web client. index.html / sw.js / manifest.json stay exactly as Vercel
// deploys them (OFFLINE_BUILD = false); every APK-only change is applied to
// the copy here.
//
//   node scripts/build-offline.mjs
//
// Output: build/offline/{index.html, sw.js, manifest.json, tailwind.js, data/*}
// build/ is gitignored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'offline');
const TAILWIND_CDN = 'https://cdn.tailwindcss.com';

const fail = (m) => { console.error(`XATO: ${m}`); process.exit(1); };
const rd = (p) => fs.readFileSync(p, 'utf8');

// ── 1. Source guard: the shipped client must stay online-mode ──────────────
const srcHtml = rd(path.join(ROOT, 'index.html'));
if (!srcHtml.includes('let OFFLINE_BUILD = false;')) {
  fail('index.html da "let OFFLINE_BUILD = false;" topilmadi — manba o\'zgargan yoki allaqachon true.');
}

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

// WebView'da speechSynthesis yo'q — native TextToSpeech ustiga polyfill.
// Faqat APK nusxasiga tushadi; veb versiyada bu skript umuman bo'lmaydi.
const ttsPolyfill = rd(path.join(ROOT, 'scripts', 'tts-polyfill.js'));
if (!ttsPolyfill.includes('window.AndroidTTS')) fail('scripts/tts-polyfill.js buzuq.');
if (ttsPolyfill.includes('</script')) fail('tts-polyfill.js ichida </script tegi bor — inline qilib bo\'lmaydi.');

// ── 2. Transform index.html ────────────────────────────────────────────────
// Each replacement is asserted: a silently missed patch would ship an APK
// that quietly falls back to online behavior.
const patches = [
  // Offline mode on.
  ['let OFFLINE_BUILD = false;', 'let OFFLINE_BUILD = true;   // APK bilkasi'],
  // Tailwind must be local — the CDN is unreachable with no network.
  // The TTS polyfill rides along here: it must run before the app script, and
  // inlining keeps the APK payload a single html file.
  ['<script src="https://cdn.tailwindcss.com"></script>',
   '<script src="./tailwind.js"></script>\n  <script>\n' + ttsPolyfill + '\n  </script>'],
  // Telegram SDK is a network fetch that can never succeed inside the APK.
  ['<script src="https://telegram.org/js/telegram-web-app.js"></script>', ''],
  // Service worker off: inside WebView a SW\'s own fetch() bypasses
  // shouldInterceptRequest, so WebViewAssetLoader URLs would 404 from the
  // worker and the shell would break. Assets are already local — no SW needed.
  ["if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {",
   'if (false) {   // APK: assets lokal, service worker kerak emas'],
];

let html = srcHtml;
for (const [from, to] of patches) {
  if (!html.includes(from)) fail(`index.html da kutilgan parcha topilmadi:\n  ${from.slice(0, 90)}`);
  html = html.replace(from, to);
}
if (html.includes('cdn.tailwindcss.com') || html.includes('telegram.org/js')) {
  fail('nusxada hamon tashqi CDN havolasi bor.');
}
if (!html.includes('window.AndroidTTS')) fail('nusxaga TTS polyfill tushmadi.');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ── 3. Static copies ───────────────────────────────────────────────────────
for (const f of ['sw.js', 'manifest.json']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}

const tasks = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^tasks-[a-z0-9]+\.json$/.test(f));
if (!tasks.length) fail('data/tasks-*.json topilmadi.');
for (const f of tasks) {
  const raw = rd(path.join(ROOT, 'data', f));
  JSON.parse(raw);                       // buzuq JSON APK ichiga tushmasin
  fs.writeFileSync(path.join(OUT, 'data', f), raw);
}

// ── 4. Tailwind: fetch the CDN response once, then reuse it ────────────────
const twPath = path.join(OUT, 'tailwind.js');
if (fs.existsSync(twPath) && fs.statSync(twPath).size > 100_000) {
  console.log('tailwind.js: mavjud, qayta yuklanmadi');
} else {
  process.stdout.write('tailwind.js yuklanmoqda... ');
  const res = await fetch(TAILWIND_CDN);
  if (!res.ok) fail(`Tailwind CDN ${res.status} — internetsiz build uchun tailwind.js ni qo'lda joylashtiring.`);
  const js = await res.text();
  if (js.length < 100_000) fail('Tailwind javobi juda kichik — CDN o\'rniga xato sahifa keldi.');
  fs.writeFileSync(twPath, js);
  console.log(`${(js.length / 1024).toFixed(0)} KB`);
}

// ── 5. Report ──────────────────────────────────────────────────────────────
const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
console.log(`\nbuild/offline/ tayyor:`);
console.log(`  index.html   ${size(path.join(OUT, 'index.html'))}  (OFFLINE_BUILD = true)`);
console.log(`  tailwind.js  ${size(twPath)}`);
console.log(`  data/        ${tasks.length} fayl: ${tasks.join(', ')}`);
