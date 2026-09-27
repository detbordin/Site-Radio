// แชทส่วนตัว 1:1 ระหว่างสมาชิกสองคน (ใช้ pairKey จาก rtc-common.js เพื่อกำหนด thread ร่วมกัน)
const DM = (() => {
  let unsub = null;

  function threadRef(peerUid) {
    const key = pairKey(Identity.getUid(), peerUid);
    return db.collection('dm').doc(key).collection('messages');
  }

  function listen(peerUid, cb) {
    if (unsub) unsub();
    unsub = threadRef(peerUid)
      .orderBy('createdAt', 'asc')
      .limitToLast(100)
      .onSnapshot(snap => {
        const msgs = [];
        snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        cb(msgs);
      });
  }

  function stop() {
    if (unsub) { unsub(); unsub = null; }
  }

  async function sendText(peerUid, text) {
    const uid = Identity.getUid();
    const name = Identity.getName();
    await threadRef(peerUid).add({
      type: 'text',
      text,
      senderUid: uid,
      senderName: name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return { listen, stop, sendText };
})();
