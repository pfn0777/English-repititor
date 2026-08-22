// Android WebView uchun speechSynthesis polyfill'i (APK bilkasiga in'ektsiya
// qilinadi, manba index.html ga TEGMAYDI — build-offline.mjs qo'shadi).
//
// WebView'da window.speechSynthesis umuman yo'q, shuning uchun `listen`,
// `dictate` va "Quloq o'yini" APK'da o'chib qolgan edi. Bu skript native
// android.speech.tts.TextToSpeech ustiga standart Web Speech API'ni yasaydi,
// shunda klient kodi (speakText / offlineTtsReady / gamesAvailable) hech qanday
// o'zgarishsiz ishlaydi.
//
// Qat'iy qoidalar:
//   1. window.speechSynthesis ALLAQACHON bo'lsa — hech narsa qilinmaydi
//      (brauzer/veb versiyasi buzilmasin).
//   2. AndroidTTS.status() === 'unavailable' bo'lsa (til paketi yo'q —
//      LANG_MISSING_DATA / LANG_NOT_SUPPORTED, yoki engine umuman yo'q) —
//      polyfill O'RNATILMAYDI. Shunda offlineTtsReady() false qaytaradi va
//      ilova hozirgi to'g'ri degradatsiyaga qaytadi: matn ko'rsatiladi,
//      "Quloq o'yini" menyuda chiqmaydi. Jimgina sukut — eng yomon natija.
//   3. TextToSpeech.onInit ASINXRON. MainActivity loadUrl() ni qisqa vaqt
//      kutadi, lekin sovuq startda engine kechikishi mumkin — o'shanda status
//      'pending' bo'ladi. Bunday holatda polyfill optimistik o'rnatiladi va
//      native keyinroq __ebTtsState() ni chaqiradi; javob 'ready' bo'lmasa
//      polyfill O'ZINI OLIB TASHLAYDI va foydalanuvchiga sabab aytiladi.
(function () {
  'use strict';

  if ('speechSynthesis' in window) return;              // 1-qoida
  var A = window.AndroidTTS;
  if (!A || typeof A.status !== 'function') return;

  var state;
  try { state = A.status(); } catch (e) { return; }
  if (state === 'unavailable') return;                  // 2-qoida

  var VOICE = {
    voiceURI: 'AndroidTTS', name: 'Android TTS English',
    lang: 'en-US', localService: true, default: true,
  };

  var pending = Object.create(null);
  var seq = 0;

  function SpeechSynthesisUtterance(text) {
    this.text = text == null ? '' : String(text);
    this.lang = 'en-US';
    this.voice = null;
    this.rate = 1; this.pitch = 1; this.volume = 1;
    this.onstart = null; this.onend = null; this.onerror = null;
  }

  function fire(u, name, ev) {
    var fn = u && u[name];
    if (typeof fn !== 'function') return;
    try { fn.call(u, ev || { type: name.slice(2), utterance: u }); }
    catch (e) { console.error('tts ' + name, e); }
  }

  function settle(id) {
    var u = pending[id];
    if (u) delete pending[id];
    for (var k in pending) return u;                    // hali navbat bor
    synth.speaking = false;
    return u;
  }

  // Native UtteranceProgressListener shu funksiyani chaqiradi.
  window.__ebTtsEvent = function (id, kind) {
    var u = settle(String(id));
    if (!u) return;
    if (kind === 'done') fire(u, 'onend');
    else fire(u, 'onerror', { type: 'error', error: 'synthesis-failed', utterance: u });
  };

  var synth = {
    speaking: false, pending: false, paused: false,
    getVoices: function () { return [VOICE]; },
    speak: function (u) {
      if (!u || !u.text) return;
      var id = 's' + (++seq);
      pending[id] = u;
      synth.speaking = true;
      var ok = false;
      try { ok = A.speak(String(u.text), id, Number(u.rate) || 1, Number(u.pitch) || 1); }
      catch (e) { ok = false; }
      if (!ok) {
        settle(id);
        // Jimgina yiqilish o'rniga sabab aytiladi.
        if (typeof window.toast === 'function') {
          window.toast("Qurilmada ovoz ishlamadi — matnni ko'ring", 'error');
        }
        fire(u, 'onerror', { type: 'error', error: 'synthesis-failed', utterance: u });
        return;
      }
      fire(u, 'onstart');
    },
    cancel: function () {
      pending = Object.create(null);
      synth.speaking = false;
      try { A.cancel(); } catch (e) { /* engine yo'qolgan — jim o'tamiz */ }
    },
    pause: function () {}, resume: function () {},
    addEventListener: function () {}, removeEventListener: function () {},
    dispatchEvent: function () { return true; },
  };

  try {
    Object.defineProperty(window, 'speechSynthesis', {
      value: synth, writable: false, configurable: true, enumerable: true,
    });
  } catch (e) {
    window.speechSynthesis = synth;
  }
  window.SpeechSynthesisUtterance = SpeechSynthesisUtterance;

  // 3-qoida: engine kech javob berdi va tili yo'q ekan — orqaga qaytamiz.
  if (state === 'pending') {
    window.__ebTtsState = function (s) {
      if (s === 'ready') return;
      try { delete window.speechSynthesis; } catch (e) { window.speechSynthesis = undefined; }
      try { delete window.SpeechSynthesisUtterance; } catch (e) {}
      if (typeof window.toast === 'function') {
        window.toast("Qurilmada ingliz tili ovozi yo'q — matnli rejim", 'error');
      }
    };
  }
})();
