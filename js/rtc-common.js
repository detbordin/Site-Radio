// ค่ากลางสำหรับ WebRTC
// มี TURN server (ฟรี, Open Relay Project) ต่อจาก STUN ไว้ด้วย เพราะทีมงานส่วนใหญ่
// อยู่คนละเครือข่ายมือถือ (4G/5G) ซึ่งมักติด NAT แบบเข้มงวดที่ STUN อย่างเดียวเชื่อมต่อไม่ผ่าน
// ถ้าใช้งานหนักมากในอนาคต แนะนำให้เปลี่ยนไปใช้ TURN server ของตัวเอง/ผู้ให้บริการที่เสถียรกว่านี้
const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

function pairKey(a, b) {
  return [a, b].sort().join('__');
}
