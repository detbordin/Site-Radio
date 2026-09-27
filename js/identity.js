// จัดการตัวตนของอุปกรณ์นี้: ชื่อที่ตั้งเอง + uid จาก anonymous auth
const Identity = (() => {
  let uid = null;
  let name = localStorage.getItem('sr_name') || '';

  function getName() { return name; }
  function setName(n) {
    name = n.trim();
    localStorage.setItem('sr_name', name);
  }
  function getUid() { return uid; }

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

  return { getName, setName, getUid, signIn };
})();
