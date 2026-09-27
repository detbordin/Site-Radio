// จัดการกลุ่ม/โปรเจกต์: สร้าง, เข้าร่วม, สลับกลุ่ม, แอดมินเพิ่ม/ลบสมาชิก
const Groups = (() => {
  const LOCAL_KEY = 'sr_groups'; // [{id, name, role}]

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function randomCode(len = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function getMyGroups() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch { return []; }
  }

  function saveMyGroup(g) {
    const list = getMyGroups().filter(x => x.id !== g.id);
    list.unshift(g);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  }

  function removeMyGroup(id) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(getMyGroups().filter(x => x.id !== id)));
  }

  // เก็บรหัสผ่านแบบข้อความล้วนไว้ในเครื่องแอดมินเท่านั้น (ไม่เก็บลง Firestore)
  // เพื่อให้แอดมินกลับมาสร้าง QR เชิญใหม่ได้ภายหลังโดยไม่ต้องพิมพ์รหัสผ่านซ้ำ
  function getGroupPassword(id) {
    const g = getMyGroups().find(x => x.id === id);
    return g && g.pass ? g.pass : null;
  }

  // สร้างกลุ่มใหม่ - อุปกรณ์นี้เป็นแอดมิน (เมน)
  async function createGroup(groupName, password) {
    const uid = Identity.getUid();
    const name = Identity.getName();
    const groupId = randomCode(6);
    const passwordHash = await sha256(password);

    await db.collection('groups').doc(groupId).set({
      name: groupName,
      passwordHash,
      adminUid: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('groups').doc(groupId).collection('members').doc(uid).set({
      name,
      avatar: Identity.getAvatar() || null,
      role: 'admin',
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      joinPasswordHash: passwordHash
    });

    saveMyGroup({ id: groupId, name: groupName, role: 'admin', pass: password });
    return { groupId, password };
  }

  // เข้าร่วมกลุ่มด้วยรหัสกลุ่ม + รหัสผ่าน (ทำครั้งเดียว)
  async function joinGroup(groupId, password) {
    groupId = groupId.trim().toUpperCase();
    const uid = Identity.getUid();
    const name = Identity.getName();
    const passwordHash = await sha256(password);

    const groupSnap = await db.collection('groups').doc(groupId).get();
    if (!groupSnap.exists) throw new Error('ไม่พบรหัสกลุ่มนี้');
    const group = groupSnap.data();

    await db.collection('groups').doc(groupId).collection('members').doc(uid).set({
      name,
      avatar: Identity.getAvatar() || null,
      role: uid === group.adminUid ? 'admin' : 'member',
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      joinPasswordHash: passwordHash
    });

    saveMyGroup({ id: groupId, name: group.name, role: uid === group.adminUid ? 'admin' : 'member' });
    return { groupId, name: group.name };
  }

  // อัปเดตชื่อ/รูปโปรไฟล์ของตัวเองในกลุ่มที่เข้าร่วมอยู่แล้ว (ไม่กระทบ role/joinedAt/joinPasswordHash)
  async function updateMyProfile(groupId, { name, avatar } = {}) {
    const uid = Identity.getUid();
    const data = {};
    if (name !== undefined) data.name = name;
    if (avatar !== undefined) data.avatar = avatar || null;
    if (Object.keys(data).length === 0) return;
    await db.collection('groups').doc(groupId).collection('members').doc(uid).update(data);
  }

  async function getGroupInfo(groupId) {
    const snap = await db.collection('groups').doc(groupId).get();
    return snap.exists ? { id: groupId, ...snap.data() } : null;
  }

  function listenMembers(groupId, cb) {
    return db.collection('groups').doc(groupId).collection('members')
      .onSnapshot(snap => {
        const members = [];
        snap.forEach(d => members.push({ uid: d.id, ...d.data() }));
        cb(members);
      });
  }

  async function removeMember(groupId, uid) {
    await db.collection('groups').doc(groupId).collection('members').doc(uid).delete();
    await rtdb.ref(`presence/${groupId}/${uid}`).remove();
  }

  async function leaveGroup(groupId) {
    const uid = Identity.getUid();
    await db.collection('groups').doc(groupId).collection('members').doc(uid).delete();
    await rtdb.ref(`presence/${groupId}/${uid}`).remove();
    removeMyGroup(groupId);
  }

  // ตั้ง/ถอดสิทธิ์แอดมินร่วมให้สมาชิกคนใดก็ได้ (ทำได้กี่คนก็ได้ ไม่จำกัดแค่คนที่สร้างกลุ่ม)
  async function setMemberRole(groupId, uid, role) {
    await db.collection('groups').doc(groupId).collection('members').doc(uid).update({ role });
  }

  // ลบกลุ่มทิ้งถาวร (สำหรับแอดมินเท่านั้น) - ลบสมาชิกทั้งหมด, ข้อความทั้งหมด, ตัวกลุ่มเอง,
  // และล้างข้อมูลที่เกี่ยวข้องใน Realtime Database (presence/pings/rtc/calls) ให้หมด กู้คืนไม่ได้
  async function deleteGroupPermanently(groupId) {
    const membersSnap = await db.collection('groups').doc(groupId).collection('members').get();
    if (!membersSnap.empty) {
      const batch = db.batch();
      membersSnap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    let msgsSnap = await db.collection('groups').doc(groupId).collection('messages').limit(400).get();
    while (!msgsSnap.empty) {
      const batch = db.batch();
      msgsSnap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      msgsSnap = await db.collection('groups').doc(groupId).collection('messages').limit(400).get();
    }

    await db.collection('groups').doc(groupId).delete();

    await Promise.all([
      rtdb.ref(`presence/${groupId}`).remove().catch(() => {}),
      rtdb.ref(`pings/${groupId}`).remove().catch(() => {}),
      rtdb.ref(`rtc/${groupId}`).remove().catch(() => {}),
      rtdb.ref(`calls/${groupId}`).remove().catch(() => {})
    ]);

    removeMyGroup(groupId);
  }

  return {
    createGroup, joinGroup, getGroupInfo, listenMembers, updateMyProfile,
    removeMember, leaveGroup, setMemberRole, deleteGroupPermanently,
    getMyGroups, saveMyGroup, removeMyGroup, getGroupPassword
  };
})();
