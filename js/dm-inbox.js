// กล่องข้อความส่วนตัว (inbox): เก็บรายการบทสนทนาล่าสุดของแต่ละคน เพื่อให้เปิดดู/ตอบได้จากปุ่ม 📩
// โครงสร้าง: คอลเลกชัน dmThreads เป็น flat collection เอกสารละ 1 บทสนทนา "มองจากมุมของ ownerUid"
// เอกสาร id = `${ownerUid}_${peerUid}` แต่ละฝั่งของบทสนทนามีเอกสารของตัวเอง (2 เอกสารต่อ 1 บทสนทนา)
const DmInbox = (() => {
  let unsub = null;

  function docId(ownerUid, peerUid) { return `${ownerUid}_${peerUid}`; }

  // เรียกทุกครั้งที่มีการส่งข้อความ DM ใหม่ - อัปเดตกล่องข้อความของทั้งสองฝั่งพร้อมกัน
  async function touch(peer, lastText) {
    const myUid = Identity.getUid();
    const myName = Identity.getName();
    const myAvatar = Identity.getAvatar() || null;
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.collection('dmThreads').doc(docId(myUid, peer.uid)), {
      ownerUid: myUid, peerUid: peer.uid, peerName: peer.name, peerAvatar: peer.avatar || null,
      lastText, lastTs: now, unread: false, lastSenderUid: myUid
    });
    batch.set(db.collection('dmThreads').doc(docId(peer.uid, myUid)), {
      ownerUid: peer.uid, peerUid: myUid, peerName: myName, peerAvatar: myAvatar,
      lastText, lastTs: now, unread: true, lastSenderUid: myUid
    });
    await batch.commit();
  }

  async function markRead(peerUid) {
    const myUid = Identity.getUid();
    const ref = db.collection('dmThreads').doc(docId(myUid, peerUid));
    // เช็คก่อนว่ามีบทสนทนานี้อยู่จริงไหม - ถ้ายังไม่เคยคุยกันเลย (แค่กดดูชื่อ/เปิดหน้าแชทเฉยๆ)
    // จะได้ไม่สร้างเอกสารเปล่าๆ ไปโผล่ในกล่องข้อความส่วนตัวของตัวเอง
    const snap = await ref.get().catch(() => null);
    if (!snap || !snap.exists) return;
    await ref.set({ unread: false, lastSenderUid: myUid }, { merge: true }).catch(() => {});
  }

  function listen(cb) {
    if (unsub) unsub();
    const myUid = Identity.getUid();
    unsub = db.collection('dmThreads').where('ownerUid', '==', myUid)
      .onSnapshot(snap => {
        const threads = [];
        snap.forEach(d => threads.push({ id: d.id, ...d.data() }));
        threads.sort((a, b) => {
          const ta = a.lastTs && a.lastTs.toMillis ? a.lastTs.toMillis() : 0;
          const tb = b.lastTs && b.lastTs.toMillis ? b.lastTs.toMillis() : 0;
          return tb - ta;
        });
        cb(threads);
      }, () => {});
  }

  function stop() {
    if (unsub) { unsub(); unsub = null; }
  }

  return { touch, markRead, listen, stop };
})();
