// แชทห้องรวม: ข้อความและรูปภาพ
const Chat = (() => {
  let unsub = null;
  let lastCount = 0;
  let firstLoad = true;

  function listen(groupId, cb) {
    firstLoad = true;
    lastCount = 0;
    if (unsub) unsub();
    unsub = db.collection('groups').doc(groupId).collection('messages')
      .orderBy('createdAt', 'asc')
      .limitToLast(100)
      .onSnapshot(snap => {
        const msgs = [];
        snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        const isNewIncoming = !firstLoad && msgs.length > lastCount;
        lastCount = msgs.length;
        firstLoad = false;
        cb(msgs, isNewIncoming);
      });
  }

  function stop() {
    if (unsub) { unsub(); unsub = null; }
  }

  async function sendText(groupId, text) {
    const uid = Identity.getUid();
    const name = Identity.getName();
    await db.collection('groups').doc(groupId).collection('messages').add({
      type: 'text',
      text,
      senderUid: uid,
      senderName: name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function sendImage(groupId, file) {
    const uid = Identity.getUid();
    const name = Identity.getName();
    const path = `chat_images/${groupId}/${Date.now()}_${uid}.jpg`;
    const ref = storage.ref(path);
    await ref.put(file, { contentType: file.type || 'image/jpeg' });
    const url = await ref.getDownloadURL();
    await db.collection('groups').doc(groupId).collection('messages').add({
      type: 'image',
      imageUrl: url,
      senderUid: uid,
      senderName: name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return { listen, stop, sendText, sendImage };
})();
