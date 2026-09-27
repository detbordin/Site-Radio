// ค่ากลางสำหรับ WebRTC
const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    // หมายเหตุ: ถ้าใช้งานข้ามเครือข่ายที่มี NAT/Firewall เข้มงวด (4G สลับ WiFi ฯลฯ)
    // อาจต้องเพิ่ม TURN server ของคุณเองที่นี่ เช่น:
    // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
  ]
};

function pairKey(a, b) {
  return [a, b].sort().join('__');
}
