// แปลภาษาด้วยเสียง: พูดภาษาหนึ่ง ระบบฟังแล้วแปลงเป็นข้อความ, แปลเป็นอีกภาษาที่เลือก,
// แล้วอ่านออกเสียงคำแปลให้ฟัง (ใช้ Web Speech API ของเบราว์เซอร์สำหรับฟัง/พูด
// และ MyMemory Translation API ที่ใช้งานฟรีไม่ต้องมี API key สำหรับแปลข้อความ)
const Translate = (() => {
  // ใช้ชุดภาษาเดียวกับ I18N (ไทย/อังกฤษ/จีน/เขมร/พม่า/ลาว) เพราะเป็นภาษาที่พบบ่อยในไซต์งานก่อสร้างไทย
  const LANGS = ['th', 'en', 'zh', 'km', 'my', 'lo'];
  const LANG_NAMES = { th: 'ไทย', en: 'English', zh: '中文', km: 'ខ្មែរ', my: 'မြန်မာ', lo: 'ລາວ' };
  const LANG_EN_NAMES = { th: 'Thai', en: 'English', zh: 'Chinese', km: 'Khmer', my: 'Burmese', lo: 'Lao' };
  const LANG_FLAG = { th: '🇹🇭', en: '🇬🇧', zh: '🇨🇳', km: '🇰🇭', my: '🇲🇲', lo: '🇱🇦' };
  const SPEECH_LANG = { th: 'th-TH', en: 'en-US', zh: 'zh-CN', km: 'km-KH', my: 'my-MM', lo: 'lo-LA' };

  // ป้ายชื่อภาษาแบบเต็ม สำหรับใส่ใน dropdown - มีธงชาติ + ชื่อภาษาเดิม + ชื่อภาษาอังกฤษกำกับ
  // เพื่อให้คนที่ไม่คุ้นตัวอักษรของภาษานั้น ๆ ยังพอเดาได้ว่าเลือกภาษาอะไรอยู่
  function langLabel(code) {
    const flag = LANG_FLAG[code] || '';
    if (code === 'en') return `${flag} English`.trim();
    return `${flag} ${LANG_NAMES[code] || code} (${LANG_EN_NAMES[code] || code})`.trim();
  }

  // แปลข้อความผ่าน MyMemory Translation API (ฟรี ไม่ต้องมี API key แต่มีโควตาจำกัดต่อวันต่อ IP
  // และคุณภาพการแปลอาจไม่สมบูรณ์แบบ 100% โดยเฉพาะคู่ภาษาที่ไม่ใช่อังกฤษ-ไทย)
  async function translateText(text, fromLang, toLang) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new Error('เชื่อมต่อบริการแปลภาษาไม่ได้ ตรวจสอบอินเทอร์เน็ต');
    }
    if (!res.ok) throw new Error('เรียกบริการแปลภาษาไม่สำเร็จ');
    const data = await res.json().catch(() => null);
    const translated = data && data.responseData && data.responseData.translatedText;
    if (!translated) throw new Error('แปลภาษาไม่สำเร็จ ลองใหม่อีกครั้ง');
    return translated;
  }

  // เริ่มฟังเสียงพูดเป็นภาษาที่กำหนด (langCode เช่น 'th', 'my') แล้วแปลงเป็นข้อความ
  // คืนค่า object ที่มี .stop() ไว้ยกเลิกกลางทาง หรือ null ถ้าเบราว์เซอร์ไม่รองรับ
  function startListening(langCode, { onResult, onError, onEnd } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { onError && onError(new Error('เบราว์เซอร์นี้ไม่รองรับการฟังเสียงพูด')); return null; }
    const recog = new SR();
    recog.lang = SPEECH_LANG[langCode] || 'th-TH';
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => onResult && onResult(e.results[0][0].transcript);
    recog.onerror = (e) => onError && onError(e);
    recog.onend = () => onEnd && onEnd();
    try {
      recog.start();
    } catch (e) {
      onError && onError(e);
      return null;
    }
    return { stop: () => { try { recog.stop(); } catch (e) {} } };
  }

  // อ่านออกเสียงข้อความเป็นภาษาที่กำหนด - ต้องมีเสียง (voice) ของภาษานั้นติดตั้งอยู่ในเครื่อง/เบราว์เซอร์
  // ถ้าไม่มีเสียงที่ตรงเป๊ะ จะลองใช้เสียงที่ใกล้เคียงที่สุดที่หาได้แทน
  function speak(text, langCode) {
    if (!('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const targetLang = SPEECH_LANG[langCode] || 'en-US';
      utter.lang = targetLang;
      const voices = window.speechSynthesis.getVoices() || [];
      const exact = voices.find(v => v.lang === targetLang);
      const partial = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langCode));
      if (exact) utter.voice = exact;
      else if (partial) utter.voice = partial;
      window.speechSynthesis.speak(utter);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ตรวจว่ามีเสียงอ่าน (TTS) ของภาษานี้ในเครื่องหรือไม่ (ใช้เตือนผู้ใช้ล่วงหน้าถ้าไม่มี)
  function hasVoiceFor(langCode) {
    if (!('speechSynthesis' in window)) return false;
    const targetLang = SPEECH_LANG[langCode] || '';
    const voices = window.speechSynthesis.getVoices() || [];
    return voices.some(v => v.lang === targetLang || (v.lang && v.lang.toLowerCase().startsWith(langCode)));
  }

  return { LANGS, LANG_NAMES, LANG_EN_NAMES, LANG_FLAG, SPEECH_LANG, langLabel, translateText, startListening, speak, hasVoiceFor };
})();
