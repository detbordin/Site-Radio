// แชทสาธารณะหน้าหลัก: ใครก็ตามที่เข้าแอปแล้วตั้งชื่อ สามารถพิมพ์คุยในนี้ได้เลย ไม่ต้องเข้ากลุ่มใดๆ
const PublicChat = (() => {
  let unsub = null;

  function listen(cb) {
    if (unsub) unsub();
    unsub = db.collection('publicChatMessages')
      .orderBy('createdAt', 'asc')
      .limitToLast(150)
      .onSnapshot(snap => {
        const msgs = [];
        snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        cb(msgs);
      }, () => {});
  }

  function stop() {
    if (unsub) { unsub(); unsub = null; }
  }

  async function sendText(text) {
    const uid = Identity.getUid();
    await db.collection('publicChatMessages').add({
      type: 'text',
      text,
      senderUid: uid,
      senderName: Identity.getName(),
      senderAvatar: Identity.getAvatar() || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return { listen, stop, sendText };
})();
