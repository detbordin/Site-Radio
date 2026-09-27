// สถานะออนไลน์ผ่าน Realtime Database (มี onDisconnect ในตัว)
const Presence = (() => {
  let currentRef = null;

  function goOnline(groupId) {
    const uid = Identity.getUid();
    const name = Identity.getName();
    currentRef = rtdb.ref(`presence/${groupId}/${uid}`);

    const connectedRef = rtdb.ref('.info/connected');
    connectedRef.on('value', (snap) => {
      if (snap.val() === true) {
        currentRef.onDisconnect().remove();
        currentRef.set({ name, online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      }
    });
  }

  function goOffline() {
    if (currentRef) currentRef.remove();
    currentRef = null;
  }

  function listen(groupId, cb) {
    const ref = rtdb.ref(`presence/${groupId}`);
    const handler = (snap) => cb(snap.val() || {});
    ref.on('value', handler);
    return () => ref.off('value', handler);
  }

  return { goOnline, goOffline, listen };
})();
