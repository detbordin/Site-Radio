// จัดการตัวตนของอุปกรณ์นี้: ชื่อที่ตั้งเอง + รูปโปรไฟล์ (อีโมจิ/รูปที่อัปโหลด) + uid จาก anonymous auth
const Identity = (() => {
  let uid = null;
  let name = localStorage.getItem('sr_name') || '';
  let avatar = null;
  try { avatar = JSON.parse(localStorage.getItem('sr_avatar') || 'null'); } catch { avatar = null; }
  // avatar = { type: 'emoji', value: '👷' } หรือ { type: 'photo', dataUrl: 'data:image/jpeg;base64,...' }

  function getName() { return name; }
  function setName(n) {
    name = n.trim();
    localStorage.setItem('sr_name', name);
  }
  function getUid() { return uid; }

  function getAvatar() { return avatar; }
  function setAvatar(a) {
    avatar = a;
    if (a) localStorage.setItem('sr_avatar', JSON.stringify(a));
    else localStorage.removeItem('sr_avatar');
  }

  function signIn() {
    return new Promise((resolve, reject) => {
      auth.onAuthStateChanged((user) => {
        if (user) {
          uid = user.uid;
          resolve(uid);
        }
      });
      auth.signInAnonymously().catch(reject);
    });
  }

  return { getName, setName, getUid, signIn, getAvatar, setAvatar };
})();
