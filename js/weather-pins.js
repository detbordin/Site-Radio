// หมุดสภาพอากาศบนแผนที่หน้าหลัก - ปักหมุดบอกสภาพอากาศ ณ ตำแหน่งนั้น พร้อมรูป (ถ้ามี)
// แต่ละหมุดจะถูกลบออกจากแผนที่ "อัตโนมัติเป็นรายหมุด" หลังปักไปแล้ว 2 ชั่วโมง (นับจากเวลาที่ปักหมุดนั้นๆ เอง
// ไม่ใช่รีเซ็ตพร้อมกันทั้งหมดทุก 3 ชม.แบบเดิม) - Firestore query แบบ real-time ไม่รู้จัก "เวลาปัจจุบันขยับ"
// เอง จึงต้องกรองอายุหมุดซ้ำฝั่ง client ทุกๆ 30 วิ (ไทเมอร์ในหน้า app.js) เพื่อให้หมุดหายตรงเวลาจริง
const WeatherPins = (() => {
  const TTL_MS = 2 * 60 * 60 * 1000; // อายุหมุด 2 ชั่วโมง
  const QUERY_MARGIN_MS = 30 * 60 * 1000; // ดึงข้อมูลเผื่อไว้อีก 30 นาที กัน race condition ตอนใกล้หมดอายุ
  let unsub = null;

  function listen(cb) {
    if (unsub) unsub();
    const cutoff = new Date(Date.now() - TTL_MS - QUERY_MARGIN_MS);
    unsub = db.collection('weatherPins')
      .where('ts', '>=', cutoff)
      .orderBy('ts', 'desc')
      .onSnapshot(snap => {
        const pins = [];
        snap.forEach(d => pins.push({ id: d.id, ...d.data() }));
        cb(pins);
      }, () => {});
    // เก็บกวาดหมุดที่หมดอายุ (เกิน 2 ชม.) ทิ้งจริงจากฐานข้อมูล แบบขี้เกียจ (lazy) -
    // ทำครั้งเดียวตอนเปิดแผนที่ ไม่ต้องมีเซิร์ฟเวอร์ตั้งเวลาลบ (แผนฟรีไม่มี Cloud Functions)
    purgeStale().catch(() => {});
  }

  function stop() {
    if (unsub) { unsub(); unsub = null; }
  }

  // อายุหมุด (มิลลิวินาที) ณ ตอนนี้ - ใช้ทั้งตอนกรองแสดงผลและตอนแปะป้ายเวลาบนแผนที่
  function ageMs(pin) {
    if (!pin.ts || !pin.ts.toMillis) return 0;
    return Date.now() - pin.ts.toMillis();
  }

  function isExpired(pin) {
    return ageMs(pin) >= TTL_MS;
  }

  async function purgeStale() {
    const staleCutoff = new Date(Date.now() - TTL_MS);
    const snap = await db.collection('weatherPins').where('ts', '<', staleCutoff).limit(200).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  async function addPin({ lat, lng, condition, note, photoDataUrl }) {
    const uid = Identity.getUid();
    await db.collection('weatherPins').add({
      uid,
      name: Identity.getName(),
      avatar: Identity.getAvatar() || null,
      lat, lng, condition,
      note: note || '',
      photoDataUrl: photoDataUrl || null,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function removePin(pinId) {
    await db.collection('weatherPins').doc(pinId).delete();
  }

  return { listen, stop, addPin, removePin, ageMs, isExpired, TTL_MS };
})();
