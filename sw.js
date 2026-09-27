// Service worker เบา ๆ สำหรับแคชเปลือกแอป (ไม่แคชข้อมูลเรียลไทม์ของ Firebase)
// v2: เปลี่ยนมาใช้กลยุทธ์ network-first สำหรับไฟล์เปลือกแอป
// เพื่อให้ผู้ใช้ได้โค้ดเวอร์ชันล่าสุดทันทีที่ deploy ใหม่ (ก่อนหน้านี้แคชแบบ cache-first
// ทำให้เครื่องที่เคยเปิดแอปแล้วยังคงเห็น firebase-config.js รุ่นเก่าค้างอยู่ แม้ deploy ใหม่ไปแล้ว)
const CACHE_NAME = 'site-radio-shell-v4';
const SHELL_FILES = [
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/identity.js',
  './js/groups.js',
  './js/presence.js',
  './js/chat.js',
  './js/dm.js',
  './js/rtc-common.js',
  './js/mesh.js',
  './js/video-call.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // ไม่แคชคำขอไปยัง Firebase/Google APIs หรือ CDN ภายนอก - ต้องเป็นข้อมูลสดเสมอ
  if (url.includes('firebaseio.com') || url.includes('googleapis.com') || url.includes('gstatic.com/firebasejs') || url.includes('cdn.jsdelivr.net')) {
    return;
  }
  // network-first: พยายามโหลดของใหม่จากเซิร์ฟเวอร์ก่อนเสมอ (เมื่อออนไลน์)
  // แล้วอัปเดตแคชไว้ใช้ตอนออฟไลน์เท่านั้น
  event.respondWith(
    fetch(event.request).then(res => {
      const resClone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone)).catch(() => {});
      return res;
    }).catch(() => caches.match(event.request))
  );
});
