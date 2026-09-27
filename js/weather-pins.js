// หมุดสภาพอากาศบนแผนที่หน้าหลัก - ปักหมุดบอกสภาพอากาศ ณ ตำแหน่งนั้น พร้อมรูป (ถ้ามี)
// รีเซ็ตพร้อมกันทุก 3 ชั่วโมง: ใช้วิธีตัดเป็น "ช่วง" (bucket) ตามเวลาโลกจริง แทนการนับ 3 ชม.
// จากตอนที่ปักแต่ละหมุด เพื่อให้หมุดทั้งหมดหายไปพร้อมกันทีเดียวตามเวลาเดียวกันสำหรับทุกคน
const WeatherPins = (() => {
  const BUCKET_MS = 3 * 60 * 60 * 1000; // 3 ชั่วโมง
  let unsub = null;

  function currentBucketStart() {
    return Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
  }

  function listen(cb) {
    if (unsub) unsub();
    const bucketStart = new Date(currentBucketStart());
    unsub = db.collection('weatherPins')
      .where('ts', '>=', bucketStart)
      .orderBy('ts', 'desc')
      .onSnapshot(snap => {
        const pins = [];
        snap.forEach(d => pins.push({ id: d.id, ...d.data() }));
        cb(pins);
      }, () => {});
    // เก็บกวาดหมุดที่หมดอายุไปนานแล้ว (เก่ากว่าปัจจุบันไป 2 ช่วงขึ้นไป) แบบขี้เกียจ (lazy) -
    // ทำครั้งเดียวตอนเปิดแผนที่ ไม่ต้องมีเซิร์ฟเวอร์ตั้งเวลาลบ (แผนฟรีไม่มี Cloud Functions)
    purgeStale().catch(() => {});
  }

  function stop() {
    if (unsub) { unsub(); unsub = null; }
  }

  async function purgeStale() {
    // ใช้ 2 ช่วงย้อนหลัง (6 ชม.) แทน 1 ช่วง เพื่อให้แน่ใจว่าหมุดที่จะลบเก่าเกิน 6 ชม.เสมอ
    // ตรงตามกฎความปลอดภัยที่อนุญาตให้ใครก็ได้ลบหมุดคนอื่นที่เก่าเกิน 6 ชม. (ไม่งั้น batch อาจถูกปฏิเสธ)
    const staleCutoff = new Date(currentBucketStart() - 2 * BUCKET_MS);
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

  return { listen, stop, addPin, removePin, currentBucketStart, BUCKET_MS };
})();
