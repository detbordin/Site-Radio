// ==========================================================================
// ตั้งค่า Firebase ของคุณที่นี่
// ไปที่ https://console.firebase.google.com -> สร้างโปรเจกต์ -> Project settings
// -> Your apps -> Web app (</>) แล้วคัดลอกค่าเหล่านี้มาวาง
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBy0ZhLlqPW3V_ESfA73CICsbPzX7PC_pE",
  authDomain: "site-radio-bsk.firebaseapp.com",
  databaseURL: "https://site-radio-bsk-default-rtdb.firebaseio.com",
  projectId: "site-radio-bsk",
  storageBucket: "site-radio-bsk.firebasestorage.app",
  messagingSenderId: "442585958982",
  appId: "1:442585958982:web:28d2e8a1c6770ed2935847"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();
const storage = firebase.storage();
