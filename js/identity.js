// จัดการตัวตนของอุปกรณ์นี้: ชื่อที่ตั้งเอง + รูปโปรไฟล์ (อีโมจิ/รูปที่อัปโหลด) + uid ที่ผูกกับบัญชี Gmail
// ทุกคนต้อง Login ด้วย Gmail ก่อนใช้งาน (บังคับ) - ใช้ anonymous auth เป็น session พื้นฐานก่อน
// แล้ว "ผูก" (link) เข้ากับบัญชี Google ทันที เพื่อให้ uid เดิมไม่เปลี่ยน (กลุ่ม/ประวัติแชทเดิมยังอยู่)
// ถ้า Gmail นั้นเคยผูกกับบัญชีอื่นมาก่อน (เปิดจากเครื่อง/เบราว์เซอร์อื่นมาก่อน) ระบบจะสลับไปใช้บัญชีเดิมนั้น
// โดยอัตโนมัติ เพื่อให้ตัวตนของ Gmail นี้ตามไปทุกเครื่องที่ล็อกอิน
const SUPER_ADMIN_EMAIL = 'detbordin.sy@gmail.com';

const Identity = (() => {
  let uid = null;
  let email = null;
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
  function getEmail() { return email; }
  function isSuperAdmin() { return !!email && email.toLowerCase() === SUPER_ADMIN_EMAIL; }

  function getAvatar() { return avatar; }
  function setAvatar(a) {
    avatar = a;
    if (a) localStorage.setItem('sr_avatar', JSON.stringify(a));
    else localStorage.removeItem('sr_avatar');
  }

  function hasGoogleLinked(user) {
    return !!(user && user.providerData && user.providerData.some(p => p.providerId === 'google.com'));
  }

  function signIn() {
    return new Promise((resolve, reject) => {
      // สำคัญ: ต้องรอผลลัพธ์แรกจาก onAuthStateChanged ก่อน (คือ session เดิมที่ Firebase คืนค่าให้จาก
      // เครื่องนี้ ถ้ามี) แล้วค่อยตัดสินใจว่าจะสร้าง anonymous ใหม่ไหม - ถ้าเรียก signInAnonymously()
      // มั่วๆ ทันทีตอนมี session ที่ผูก Google ไว้แล้วอยู่ Firebase จะ "ล็อกเอาต์" บัญชีเดิมทิ้งแล้วสร้าง
      // anonymous ใหม่แทนทันที (พฤติกรรมของ Firebase เอง) ทำให้ผู้ใช้ที่ล็อกอินด้วย Gmail ไว้แล้ว
      // จะหลุดตัวตนทุกครั้งที่เปิดแอปใหม่ - จึงต้องเช็คก่อนเสมอ
      const unsub = auth.onAuthStateChanged((user) => {
        unsub();
        if (user) {
          uid = user.uid;
          email = user.email || null;
          resolve(user);
        } else {
          auth.signInAnonymously().then(cred => {
            uid = cred.user.uid;
            email = cred.user.email || null;
            resolve(cred.user);
          }).catch(reject);
        }
      }, reject);
    });
  }

  // ยังไม่เคยผูก Gmail กับ session นี้ - ต้องบังคับให้ล็อกอินก่อนถึงจะใช้แอปต่อได้
  function needsGoogleLogin() {
    return !hasGoogleLinked(auth.currentUser);
  }

  async function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      const result = await auth.currentUser.linkWithPopup(provider);
      uid = result.user.uid; email = result.user.email || null;
      return result.user;
    } catch (err) {
      // Gmail นี้เคยผูกกับบัญชี(อุปกรณ์)อื่นมาก่อนแล้ว - สลับไปใช้บัญชีเดิมนั้นแทน เพื่อให้ตัวตนตามมาทุกเครื่อง
      if (err.code === 'auth/credential-already-in-use' && err.credential) {
        const result2 = await auth.signInWithCredential(err.credential);
        uid = result2.user.uid; email = result2.user.email || null;
        return result2.user;
      }
      throw err;
    }
  }

  return {
    getName, setName, getUid, getEmail, isSuperAdmin,
    signIn, getAvatar, setAvatar, needsGoogleLogin, loginWithGoogle
  };
})();
