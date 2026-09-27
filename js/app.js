// ตัวควบคุมหลักของแอป: สลับหน้าจอ, ผูกปุ่ม, เชื่อมทุกโมดูลเข้าด้วยกัน
(() => {
  let currentGroup = null; // { id, name, role }
  let membersCache = [];
  let presenceCache = {};
  let unsubMembers = null;
  let unsubPresence = null;
  let isAdmin = false;
  let pttTarget = 'all';
  let pendingJoin = null; // { code, pass } จากลิงก์เชิญ/QR ที่รอเข้าร่วมหลังตั้งชื่อเสร็จ
  let currentMsgsCache = []; // ข้อความล่าสุดของกลุ่มที่เปิดอยู่ (ไว้คำนวณอ่านแล้ว/ยังไม่อ่าน)
  let pttResyncTimer = null;
  let currentDmPeer = null; // { uid, name } ที่กำลังแชทส่วนตัวด้วยอยู่
  let wakeLock = null;
  let pendingProfileAvatar = null; // avatar ที่กำลังแก้ไขอยู่ในหน้าต่างโปรไฟล์ (ยังไม่บันทึก)
  let profileEditScope = null; // null = แก้โปรไฟล์เริ่มต้น (ใช้กับทุกกลุ่ม), groupId = แก้เฉพาะกลุ่มนี้กลุ่มเดียว

  // ไอคอนอวตารให้เลือก แบ่งเป็น 2 หมวด: คน / สัตว์ (ไม่ใช้รูปสิ่งของ) หมวดละ ~30 แบบ
  // หมวกช่างสีเหลือง/ขาว ใช้อีโมจิเดียวกันแต่เปลี่ยนสีพื้นหลังวงกลมแทนสีหมวก
  const AVATAR_CATEGORIES = {
    people: [
      { value: '👷', bg: '#ffd21f' },      // ช่างหมวกเหลือง
      { value: '👷', bg: '#f4f6fb' },      // ช่างหมวกขาว
      { value: '👷‍♀️', bg: '#ffd21f' },    // ช่างหมวกเหลือง (หญิง)
      { value: '👷‍♀️', bg: '#f4f6fb' },    // ช่างหมวกขาว (หญิง)
      { value: '🧑‍🔧' }, { value: '👨‍🔧' }, { value: '👩‍🔧' },
      { value: '🧑‍🏭' }, { value: '👨‍🏭' }, { value: '👩‍🏭' },
      { value: '🧑‍💼' }, { value: '👨‍💼' }, { value: '👩‍💼' },
      { value: '🧑‍✈️' }, { value: '👮' }, { value: '👮‍♀️' },
      { value: '🕵️' }, { value: '🧑‍🚒' }, { value: '👨‍🚒' }, { value: '👩‍🚒' },
      { value: '🧑‍⚕️' }, { value: '👨‍⚕️' }, { value: '👩‍⚕️' },
      { value: '🧑‍🎓' }, { value: '🧑‍🌾' }, { value: '👨‍🌾' }, { value: '👩‍🌾' },
      { value: '🥷' }, { value: '🤠' }, { value: '😀' }, { value: '😎' }, { value: '🧑' }
    ],
    animals: [
      { value: '🐶' }, { value: '🐱' }, { value: '🐭' }, { value: '🐹' }, { value: '🐰' },
      { value: '🦊' }, { value: '🐻' }, { value: '🐼' }, { value: '🐨' }, { value: '🐯' },
      { value: '🦁' }, { value: '🐮' }, { value: '🐷' }, { value: '🐸' }, { value: '🐵' },
      { value: '🐔' }, { value: '🐧' }, { value: '🐦' }, { value: '🐤' }, { value: '🦆' },
      { value: '🦉' }, { value: '🐺' }, { value: '🐗' }, { value: '🐴' }, { value: '🦄' },
      { value: '🐝' }, { value: '🐛' }, { value: '🦋' }, { value: '🐌' }, { value: '🐞' }
    ]
  };
  const AVATAR_CAT_BG = '#eef1f8';
  let profileEmojiCategory = 'people';

  const el = (id) => document.getElementById(id);

  // ---------- ตัวช่วย: ข้อความที่ยังไม่ได้อ่าน (เก็บสถานะ "อ่านล่าสุด" ไว้ในเครื่อง) ----------
  const READ_KEY = 'sr_last_read';       // { [groupId]: lastMsgId }
  const DM_READ_KEY = 'sr_dm_last_read'; // { [peerUid]: lastMsgId }
  function readMap(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
  function writeMap(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }
  function getLastRead(groupId) { return readMap(READ_KEY)[groupId] || null; }
  function setLastRead(groupId, msgId) { const m = readMap(READ_KEY); m[groupId] = msgId; writeMap(READ_KEY, m); }
  function getDmLastRead(peerUid) { return readMap(DM_READ_KEY)[peerUid] || null; }
  function setDmLastRead(peerUid, msgId) { const m = readMap(DM_READ_KEY); m[peerUid] = msgId; writeMap(DM_READ_KEY, m); }

  // นับข้อความที่ยังไม่ได้อ่านจากลิสต์ msgs (เรียงเก่า->ใหม่) เทียบกับ lastReadId
  function countUnread(msgs, lastReadId, myUid) {
    if (!msgs || msgs.length === 0) return 0;
    let idx = lastReadId ? msgs.findIndex(m => m.id === lastReadId) : -1;
    const after = idx === -1 ? msgs : msgs.slice(idx + 1);
    return after.filter(m => m.senderUid !== myUid).length;
  }

  function renderBadge(count) {
    return count > 0 ? `<span class="badge">${count > 99 ? '99+' : count}</span>` : '';
  }

  // ---------- ตัวนับข้อความยังไม่อ่านต่อกลุ่ม (ทำงานอยู่เบื้องหลังตลอด แม้ไม่ได้เปิดห้องนั้นอยู่) ----------
  let unreadListeners = {}; // groupId -> unsub
  let unreadCounts = {};    // groupId -> count
  function watchGroupUnread(groupId) {
    if (unreadListeners[groupId]) return;
    unreadListeners[groupId] = db.collection('groups').doc(groupId).collection('messages')
      .orderBy('createdAt', 'asc').limitToLast(100)
      .onSnapshot(snap => {
        const msgs = [];
        snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        // ถ้ากำลังเปิดห้องนี้อยู่และดูแท็บแชท ให้ถือว่าอ่านแล้วทันที แทนการนับค้าง
        if (currentGroup && currentGroup.id === groupId && document.getElementById('tab-chat').classList.contains('active')) {
          const last = msgs[msgs.length - 1];
          if (last) setLastRead(groupId, last.id);
          unreadCounts[groupId] = 0;
        } else {
          unreadCounts[groupId] = countUnread(msgs, getLastRead(groupId), Identity.getUid());
        }
        updateUnreadBadgesUI();
      }, () => {});
  }
  function unwatchGroupUnread(groupId) {
    if (unreadListeners[groupId]) { unreadListeners[groupId](); delete unreadListeners[groupId]; }
    delete unreadCounts[groupId];
  }
  function updateUnreadBadgesUI() {
    // แถวในหน้ารายการกลุ่ม
    document.querySelectorAll('#groups-list .group-item').forEach(div => {
      const gid = div.dataset.groupId;
      const box = div.querySelector('.g-badge');
      if (box) box.innerHTML = renderBadge(unreadCounts[gid] || 0);
    });
    // ป้ายบนแท็บ "แชท" ด้านล่าง เมื่อกำลังอยู่ในห้องแต่ดูแท็บอื่น
    const navBadge = document.querySelector('.nav-btn[data-tab="chat"] .n-badge');
    if (navBadge) {
      const c = currentGroup ? (unreadCounts[currentGroup.id] || 0) : 0;
      navBadge.innerHTML = renderBadge(c);
    }
  }
  function markCurrentGroupRead() {
    if (!currentGroup) return;
    const last = currentMsgsCache[currentMsgsCache.length - 1];
    if (last) setLastRead(currentGroup.id, last.id);
    unreadCounts[currentGroup.id] = 0;
    updateUnreadBadgesUI();
  }

  // ---------- ตัวนับข้อความส่วนตัวยังไม่อ่านต่อคน (เฉพาะช่วงที่อยู่ในห้องที่มีคนนั้นเป็นสมาชิก) ----------
  let dmUnreadListeners = {}; // peerUid -> unsub
  let dmUnreadFlags = {};     // peerUid -> bool มีข้อความใหม่ไหม
  function watchDmUnread(peerUid) {
    if (dmUnreadListeners[peerUid]) return;
    const key = pairKey(Identity.getUid(), peerUid);
    dmUnreadListeners[peerUid] = db.collection('dm').doc(key).collection('messages')
      .orderBy('createdAt', 'asc').limitToLast(1)
      .onSnapshot(snap => {
        let last = null;
        snap.forEach(d => { last = { id: d.id, ...d.data() }; });
        if (!last) { dmUnreadFlags[peerUid] = false; renderMembers(); return; }
        const isOpenNow = currentDmPeer && currentDmPeer.uid === peerUid && !el('screen-dm').classList.contains('hidden');
        if (isOpenNow) {
          setDmLastRead(peerUid, last.id);
          dmUnreadFlags[peerUid] = false;
        } else {
          const unread = last.senderUid !== Identity.getUid() && last.id !== getDmLastRead(peerUid);
          if (unread && !dmUnreadFlags[peerUid]) {
            toast(`💬 ข้อความส่วนตัวใหม่จาก ${last.senderName || 'เพื่อนร่วมทีม'}`);
            playNotifySound();
          }
          dmUnreadFlags[peerUid] = unread;
        }
        renderMembers();
      }, () => {});
  }
  function unwatchDmUnread(peerUid) {
    if (dmUnreadListeners[peerUid]) { dmUnreadListeners[peerUid](); delete dmUnreadListeners[peerUid]; }
    delete dmUnreadFlags[peerUid];
  }

  // ---------- แชทส่วนตัว 1:1 ----------
  // returnScreen: หน้าที่จะกลับไปตอนกดปิดแชทส่วนตัว (มาจากห้องกลุ่ม/หน้าหลัก/กล่องข้อความ)
  let dmReturnScreen = 'screen-room';
  function openDm(member, returnScreen) {
    dmReturnScreen = returnScreen || 'screen-room';
    currentDmPeer = { uid: member.uid, name: member.name, avatar: member.avatar || null };
    el('dm-peer-name').textContent = member.name;
    showScreen('screen-dm');
    DM.listen(member.uid, (msgs) => {
      renderDmMessages(msgs);
      const last = msgs[msgs.length - 1];
      if (last) { setDmLastRead(member.uid, last.id); dmUnreadFlags[member.uid] = false; renderMembers(); }
    });
    DmInbox.markRead(member.uid).catch(() => {});
  }
  function closeDm() {
    DM.stop();
    currentDmPeer = null;
    showScreen(dmReturnScreen);
  }
  el('btn-back-dm').addEventListener('click', closeDm);

  function renderDmMessages(msgs) {
    const box = el('dm-messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    msgs.forEach(m => {
      const mine = m.senderUid === Identity.getUid();
      const div = document.createElement('div');
      div.className = 'msg' + (mine ? ' me' : '');
      const time = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
      div.innerHTML = `<div class="text">${escapeHtml(m.text || '')}</div><div class="time">${time}</div>`;
      box.appendChild(div);
    });
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  el('dm-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCurrentDmText(); });
  el('btn-dm-send').addEventListener('click', sendCurrentDmText);
  function sendCurrentDmText() {
    const input = el('dm-input');
    const v = input.value.trim();
    if (!v || !currentDmPeer) return;
    input.value = '';
    DM.sendText(currentDmPeer, v).catch(() => toast('ส่งข้อความไม่สำเร็จ'));
  }

  // ---------- Wake Lock: กันหน้าจอดับ/ล็อกตอนกำลังออนไลน์ ----------
  // หมายเหตุ: ช่วยได้แค่ตอนที่ "หน้าจอเปิดอยู่" (กันดับเอง) เท่านั้น
  // เว็บแอปไม่สามารถทำงานเบื้องหลังแบบเต็มรูปแบบตอนปิดหน้าจอ/สลับแอปอื่นได้จริง
  // (เป็นข้อจำกัดของเบราว์เซอร์ โดยเฉพาะ iOS Safari) ต้องเปิดแอปทิ้งไว้หน้าจอจึงจะรับสาย/วิทยุได้แน่นอน
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) { wakeLock = null; }
  }
  async function releaseWakeLock() {
    try { if (wakeLock) { await wakeLock.release(); } } catch (e) {}
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (isOnline && wakeLock === null && document.visibilityState === 'visible') {
      requestWakeLock();
    }
  });

  // ---------- ปุ่มกดแจ้งเตือน/เรียก (ping) ทั้งกลุ่ม หรือรายบุคคลในแชทส่วนตัว ----------
  let pingListeners = {}; // groupId -> { ref, handler }
  function watchGroupPing(groupId) {
    if (pingListeners[groupId]) return;
    const cutoff = Date.now() - 1500; // กันไม่ให้เสียงเก่าดังซ้ำตอนเพิ่งเข้าห้อง
    const ref = rtdb.ref(`pings/${groupId}`).orderByChild('ts').startAt(cutoff);
    const handler = (snap) => {
      const p = snap.val();
      if (!p || p.fromUid === Identity.getUid()) return;
      if (p.target && p.target !== 'all' && p.target !== Identity.getUid()) return;
      playAlertSound();
      const toMe = p.target && p.target !== 'all';
      toast(`🔔 ${p.fromName || 'เพื่อนร่วมทีม'} กดแจ้งเตือน${toMe ? 'ถึงคุณ' : 'ทั้งกลุ่ม'}`, 3200);
    };
    ref.on('child_added', handler, () => {});
    pingListeners[groupId] = { ref, handler };
  }
  function unwatchGroupPing(groupId) {
    const l = pingListeners[groupId];
    if (l) { l.ref.off('child_added', l.handler); delete pingListeners[groupId]; }
  }
  function sendGroupPing(target) {
    if (!currentGroup) return;
    playAlertSound(); // ให้ได้ยินเสียงยืนยันที่เครื่องตัวเองด้วยทันทีที่กด ไม่ต้องรอสัญญาณย้อนกลับจากเซิร์ฟเวอร์
    rtdb.ref(`pings/${currentGroup.id}`).push({
      fromUid: Identity.getUid(),
      fromName: Identity.getName(),
      target: target || 'all',
      ts: firebase.database.ServerValue.TIMESTAMP
    }).catch(() => toast('ส่งแจ้งเตือนไม่สำเร็จ'));
  }
  function playAlertSound() {
    const a = el('alert-sound');
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
  // ปุ่มแจ้งเตือนทั้งกลุ่ม: เฉพาะแอดมิน (รวมแอดมินร่วม) เท่านั้นที่เห็นปุ่มนี้และกดได้
  function updatePingGroupBtnVisibility() {
    el('btn-ping-group').classList.toggle('hidden', !isAdmin);
  }
  el('btn-ping-group').addEventListener('click', () => {
    if (!isAdmin) return; // กันไว้อีกชั้น เผื่อ DOM ถูกแก้ไขให้ปุ่มโผล่มา
    sendGroupPing('all');
    toast('🔔 ส่งเสียงแจ้งเตือนถึงทั้งกลุ่มแล้ว');
  });
  el('btn-ping-dm').addEventListener('click', () => {
    if (!currentDmPeer) return;
    sendGroupPing(currentDmPeer.uid);
    toast(`🔔 ส่งเสียงเรียก ${currentDmPeer.name} แล้ว`);
  });

  // ---------- อวตาร: รูปอัปโหลด/ไอคอนการ์ตูน หรือใช้ตัวอักษรแรกของชื่อแทน ----------
  function avatarHtml(person) {
    const av = person && person.avatar;
    if (av && av.type === 'photo' && av.dataUrl) return `<img class="avatar-img" src="${av.dataUrl}" alt="">`;
    if (av && av.type === 'emoji' && av.value) {
      const style = av.bg ? ` style="background:${av.bg}"` : '';
      return `<span class="avatar-emoji"${style}>${av.value}</span>`;
    }
    return initials(person && person.name);
  }

  // ย่อขนาดรูปที่อัปโหลดให้เล็กพอจะเก็บเป็น base64 ใน Firestore ได้ (จำกัดเอกสารละ 1MB)
  function resizeImageToDataUrl(file, maxSize = 220, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('เปิดรูปไม่สำเร็จ'));
        img.onload = () => {
          let { width, height } = img;
          if (width > height) { if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; } }
          else { if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; } }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- ป๊อปอัพแก้ไขโปรไฟล์ (ชื่อ + รูป/ไอคอน) ----------
  // เปิดจากปุ่ม 👤 หน้ารายการกลุ่ม = แก้ "โปรไฟล์เริ่มต้น" ใช้เป็นค่าตั้งต้นกับทุกกลุ่ม
  function openProfileModal() {
    profileEditScope = null;
    el('profile-modal-title').textContent = I18N.t('profile_title');
    el('profile-modal-sub').textContent = I18N.t('profile_sub_default');
    el('profile-name-input').value = Identity.getName();
    pendingProfileAvatar = Identity.getAvatar();
    profileEmojiCategory = guessAvatarCategory(pendingProfileAvatar);
    renderProfileEmojiGrid();
    renderProfileAvatarPreview();
    showModal('modal-profile');
  }
  // เปิดจากการแตะชื่อตัวเองในแท็บ "สมาชิก" = แก้เฉพาะชื่อ/รูปในกลุ่มนี้กลุ่มเดียว ไม่กระทบกลุ่มอื่น
  function openGroupProfileEdit(m) {
    if (!currentGroup) return;
    profileEditScope = currentGroup.id;
    el('profile-modal-title').textContent = I18N.t('profile_title_group');
    el('profile-modal-sub').textContent = I18N.t('profile_sub_group', { group: currentGroup.name });
    el('profile-name-input').value = m.name || Identity.getName();
    pendingProfileAvatar = m.avatar || Identity.getAvatar();
    profileEmojiCategory = guessAvatarCategory(pendingProfileAvatar);
    renderProfileEmojiGrid();
    renderProfileAvatarPreview();
    showModal('modal-profile');
  }
  function guessAvatarCategory(avatar) {
    if (avatar && avatar.type === 'emoji' && AVATAR_CATEGORIES.animals.some(ic => ic.value === avatar.value)) return 'animals';
    return 'people';
  }
  document.querySelectorAll('.avatar-cat-tabs .cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      profileEmojiCategory = btn.dataset.cat;
      renderProfileEmojiGrid();
    });
  });
  function renderProfileEmojiGrid() {
    document.querySelectorAll('.avatar-cat-tabs .cat-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === profileEmojiCategory);
    });
    const box = el('profile-emoji-grid');
    box.innerHTML = '';
    AVATAR_CATEGORIES[profileEmojiCategory].forEach(ic => {
      const bg = ic.bg || AVATAR_CAT_BG;
      const b = document.createElement('button');
      b.type = 'button';
      const selected = pendingProfileAvatar && pendingProfileAvatar.type === 'emoji'
        && pendingProfileAvatar.value === ic.value && (pendingProfileAvatar.bg || AVATAR_CAT_BG) === bg;
      b.className = 'emoji-choice' + (selected ? ' selected' : '');
      b.style.background = bg;
      b.textContent = ic.value;
      b.addEventListener('click', () => {
        pendingProfileAvatar = { type: 'emoji', value: ic.value, bg };
        renderProfileEmojiGrid();
        renderProfileAvatarPreview();
      });
      box.appendChild(b);
    });
  }
  function renderProfileAvatarPreview() {
    el('profile-avatar-preview').innerHTML = avatarHtml({ avatar: pendingProfileAvatar, name: Identity.getName() });
  }
  el('btn-pick-photo').addEventListener('click', () => el('profile-photo-input').click());
  el('profile-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      pendingProfileAvatar = { type: 'photo', dataUrl };
      renderProfileEmojiGrid();
      renderProfileAvatarPreview();
    } catch (err) { toast('อัปโหลดรูปไม่สำเร็จ'); }
  });
  el('btn-save-profile').addEventListener('click', async () => {
    const v = el('profile-name-input').value.trim();
    if (!v) { toast('กรุณาใส่ชื่อ'); return; }
    if (profileEditScope) {
      // แก้เฉพาะกลุ่มนี้กลุ่มเดียว ไม่แตะโปรไฟล์เริ่มต้น/กลุ่มอื่น
      try {
        await Groups.updateMyProfile(profileEditScope, { name: v, avatar: pendingProfileAvatar || null });
        hideModal('modal-profile');
        toast('บันทึกแล้ว (เฉพาะกลุ่มนี้)');
      } catch (e) { toast('บันทึกไม่สำเร็จ'); }
      return;
    }
    Identity.setName(v);
    Identity.setAvatar(pendingProfileAvatar);
    VideoCall.setMyName(v);
    hideModal('modal-profile');
    toast('บันทึกโปรไฟล์แล้ว');
    renderMembers();
    const groups = Groups.getMyGroups();
    groups.forEach(g => {
      Groups.updateMyProfile(g.id, { name: v, avatar: pendingProfileAvatar || null }).catch(() => {});
    });
  });

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    el(id).classList.remove('hidden');
  }
  function showModal(id) { el(id).classList.remove('hidden'); }
  function hideModal(id) { el(id).classList.add('hidden'); }
  function toast(msg, ms = 2200) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  document.querySelectorAll('.modal-close').forEach(b => {
    b.addEventListener('click', (e) => e.target.closest('.modal').classList.add('hidden'));
  });

  // ---------- แผ่นตัวเลือกอเนกประสงค์ (bottom sheet) ----------
  // items: [{icon, label, danger, selected, onClick}]
  function openSheet(title, items) {
    el('sheet-title').textContent = title || '';
    const body = el('sheet-body');
    body.innerHTML = '';
    items.forEach(it => {
      const btn = document.createElement('button');
      btn.className = 'sheet-item' + (it.danger ? ' danger' : '') + (it.selected ? ' selected' : '');
      btn.innerHTML = `<span class="si-icon">${it.icon || ''}</span><span>${escapeHtml(it.label)}</span>`;
      btn.addEventListener('click', () => { closeSheet(); it.onClick && it.onClick(); });
      body.appendChild(btn);
    });
    el('sheet-overlay').classList.remove('hidden');
  }
  function closeSheet() { el('sheet-overlay').classList.add('hidden'); }
  el('sheet-overlay').addEventListener('click', (e) => { if (e.target.id === 'sheet-overlay') closeSheet(); });

  // ---------- ขอสิทธิ์ไมค์/กล้องล่วงหน้า ----------
  // ขอตั้งแต่เข้าแอปครั้งแรกเลย เพื่อให้กดวิทยุ/วิดีโอคอลได้ทันทีโดยไม่ต้องเจอป๊อปอัพขอสิทธิ์อีก
  let mediaPermissionAsked = false;
  async function requestMediaPermissionsOnce() {
    if (mediaPermissionAsked) return;
    mediaPermissionAsked = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      s.getTracks().forEach(t => t.stop());
    } catch (e) {
      // ผู้ใช้กดปฏิเสธ หรือเครื่องไม่มีกล้อง/ไมค์ - ปล่อยผ่าน ฟีเจอร์ที่เกี่ยวข้องจะแจ้งเตือนตอนใช้งานจริงเอง
    }
  }

  // ---------- ชื่อผู้ใช้ + บังคับ Login ด้วย Gmail ----------
  async function init() {
    I18N.applyStaticTranslations();
    el('btn-ptt-target').textContent = I18N.t('ptt_target_all');
    attachVoiceInput('btn-mic-chat', 'chat-input');
    attachVoiceInput('btn-mic-dm', 'dm-input');
    attachVoiceInput('btn-mic-public', 'public-chat-input');
    await Identity.signIn();

    // เช็คว่ามาจากลิงก์เชิญ/สแกน QR ไหม (?g=รหัสกลุ่ม&p=รหัสผ่าน) - เก็บไว้ก่อน ใช้ตอนผ่านล็อกอิน/เช็คแบนแล้ว
    const params = new URLSearchParams(location.search);
    const joinCode = params.get('g');
    const joinPass = params.get('p');
    if (joinCode && joinPass) {
      pendingJoin = { code: joinCode, pass: joinPass };
      // ลบพารามิเตอร์ออกจาก URL ทันที ไม่ให้รหัสผ่านค้างอยู่ในแถบที่อยู่/ประวัติเบราว์เซอร์
      history.replaceState(null, '', location.pathname);
    }

    if (Identity.needsGoogleLogin()) {
      showScreen('screen-google-login');
      return; // รอกดปุ่ม "เข้าสู่ระบบด้วย Gmail" ก่อน (บังคับทุกคน) - ไปต่อที่ btn-google-login handler ด้านล่าง
    }
    await afterLogin();
  }

  el('btn-google-login').addEventListener('click', async () => {
    const btn = el('btn-google-login');
    btn.disabled = true;
    try {
      await Identity.loginWithGoogle();
      await afterLogin();
    } catch (err) {
      toast('เข้าสู่ระบบด้วย Gmail ไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      btn.disabled = false;
    }
  });

  // เช็คสถานะแบนก่อนเสมอหลังผ่านการล็อกอิน (ทั้งตอนเพิ่ง login และตอนกลับมาเปิดแอปซ้ำที่ login ค้างไว้แล้ว)
  async function checkAndShowBanStatus() {
    try {
      const doc = await db.collection('bannedUsers').doc(Identity.getUid()).get();
      if (!doc.exists) return false;
      const b = doc.data();
      const untilMs = b.bannedUntil && b.bannedUntil.toMillis ? b.bannedUntil.toMillis() : null;
      const stillBanned = !untilMs || untilMs > Date.now();
      if (!stillBanned) return false;
      el('banned-until-text').textContent = untilMs
        ? I18N.t('banned_until_prefix', { until: new Date(untilMs).toLocaleString('th-TH') })
        : I18N.t('banned_until_forever');
      el('banned-reason-text').textContent = b.reason ? I18N.t('ban_reason_prefix', { reason: b.reason }) : '';
      showScreen('screen-banned');
      return true;
    } catch (err) {
      return false; // เช็คไม่ได้ (เช่นออฟไลน์ชั่วคราว) - ปล่อยผ่านไปก่อน ไม่บล็อกเพราะเน็ตหลุด
    }
  }

  async function afterLogin() {
    const banned = await checkAndShowBanStatus();
    if (banned) return;
    VideoCall.setMyName(Identity.getName());
    DmInbox.listen(renderDmInboxBadge); // ตัวเลขแจ้งเตือนข้อความส่วนตัวใหม่ ทำงานอยู่เบื้องหลังตลอดทั้งเซสชัน
    updateSuperAdminUI();

    const name = Identity.getName();
    if (!name) {
      showScreen('screen-name');
    } else {
      requestMediaPermissionsOnce();
      await enterAppHome();
    }
  }

  el('btn-save-name').addEventListener('click', async () => {
    const v = el('input-name').value.trim();
    if (!v) { toast('กรุณาใส่ชื่อ'); return; }
    Identity.setName(v);
    VideoCall.setMyName(v);
    requestMediaPermissionsOnce();
    await enterAppHome();
  });

  // เข้าแอปแล้วจะไปที่ไหนก่อน: ถ้ามาจากลิงก์เชิญกลุ่ม (pendingJoin) ให้เข้ากลุ่มนั้นเลย
  // ไม่งั้นไปหน้าหลัก (แชทสาธารณะ + แผนที่อากาศ) เป็นค่าเริ่มต้น
  async function enterAppHome() {
    if (pendingJoin) {
      const pj = pendingJoin;
      pendingJoin = null;
      showScreen('screen-groups');
      renderGroupsList();
      await autoJoin(pj.code, pj.pass);
      return;
    }
    showScreen('screen-public');
    startPublicScreen();
  }

  // เข้าร่วมกลุ่มอัตโนมัติจากลิงก์เชิญ/QR
  async function autoJoin(code, pass) {
    toast('กำลังเข้าร่วมกลุ่มจากลิงก์เชิญ...');
    try {
      const res = await Groups.joinGroup(code, pass);
      renderGroupsList();
      toast(`เข้าร่วมกลุ่ม "${res.name}" สำเร็จ`);
      const g = Groups.getMyGroups().find(x => x.id === res.groupId);
      if (g) enterRoom(g);
    } catch (e) {
      toast('เข้าร่วมจากลิงก์ไม่สำเร็จ: ' + e.message, 3200);
    }
  }

  // ---------- QR เชิญเข้าร่วมกลุ่ม ----------
  function buildJoinUrl(groupId, pass) {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('g', groupId);
    url.searchParams.set('p', pass);
    return url.toString();
  }

  function showJoinQr(groupId, pass) {
    el('qr-group-code').textContent = groupId;
    el('qr-group-pass').textContent = pass;
    const box = el('qr-canvas-box');
    box.innerHTML = '';
    const joinUrl = buildJoinUrl(groupId, pass);
    try {
      new QRCode(box, {
        text: joinUrl, width: 192, height: 192,
        colorDark: '#0b1220', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {
      box.innerHTML = '<div style="color:#333;padding:10px;font-size:12px;">สร้าง QR ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)</div>';
    }
    el('btn-copy-join-link').onclick = () => {
      navigator.clipboard.writeText(joinUrl)
        .then(() => toast('คัดลอกลิงก์เชิญแล้ว'))
        .catch(() => toast('คัดลอกไม่สำเร็จ'));
    };
    showModal('modal-qr');
  }

  el('btn-my-name').addEventListener('click', openProfileModal);

  // ---------- เลือกภาษา ----------
  const LANG_FLAGS = { th: '🇹🇭', en: '🇬🇧', zh: '🇨🇳', km: '🇰🇭', my: '🇲🇲', lo: '🇱🇦' };
  el('btn-lang').addEventListener('click', () => {
    openSheet(I18N.t('lang_picker_title'), I18N.LANGS.map(l => ({
      icon: LANG_FLAGS[l] || '🌐',
      label: I18N.getLangName(l),
      selected: I18N.getLang() === l,
      onClick: () => changeLang(l)
    })));
  });
  function changeLang(l) {
    I18N.setLang(l);
    refreshDynamicTexts();
  }
  // ข้อความในหน้าจอที่ตั้งค่าด้วย JS (ไม่ใช่ data-i18n ตรง ๆ ใน HTML) ต้องรีเฟรชเองตอนเปลี่ยนภาษา
  function refreshDynamicTexts() {
    updateOnlineToggleUI();
    if (currentGroup) {
      renderMembers();
      updateRadioStatus();
      if (pttTarget === 'all') el('btn-ptt-target').textContent = I18N.t('ptt_target_all');
    } else {
      renderGroupsList();
    }
  }

  // ---------- ตรวจสอบ/บังคับอัปเดตแอปเป็นเวอร์ชันล่าสุด ----------
  // ใช้สำหรับคนที่เคยเปิด/ติดตั้งแอปไปแล้ว แต่เครื่องยังค้างแคชเวอร์ชันเก่าอยู่
  // กดแล้วจะล้างแคชทั้งหมด + ถอด service worker เก่าออก แล้วโหลดหน้าใหม่จากเซิร์ฟเวอร์ทันที
  el('btn-update-app').addEventListener('click', async () => {
    toast('กำลังตรวจสอบอัปเดต...', 2000);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) { /* ล้างไม่สำเร็จก็ยังรีโหลดต่อได้ตามปกติ */ }
    // เติม query string กันบราวเซอร์ดึง index.html จากแคชของตัวเองซ้ำ
    const url = new URL(location.href);
    url.searchParams.set('_u', Date.now().toString());
    location.replace(url.toString());
  });

  // ---------- รายการกลุ่ม ----------
  function renderGroupsList() {
    const list = Groups.getMyGroups();
    const box = el('groups-list');
    box.innerHTML = '';
    if (list.length === 0) {
      box.innerHTML = `<div class="empty-hint">${escapeHtml(I18N.t('empty_groups_hint'))}</div>`;
      return;
    }
    list.forEach(g => {
      const div = document.createElement('div');
      div.className = 'group-item';
      div.dataset.groupId = g.id;
      div.innerHTML = `
        <div class="avatar">📻</div>
        <div class="info">
          <div class="g-name">${escapeHtml(g.name)}</div>
          <div class="g-role">${g.role === 'admin' ? I18N.t('role_admin') : I18N.t('role_member')} · ${I18N.t('code_label')} ${g.id}</div>
        </div>
        <span class="g-badge">${renderBadge(unreadCounts[g.id] || 0)}</span>
        <div class="chevron">›</div>`;
      div.addEventListener('click', () => enterRoom(g));
      box.appendChild(div);
      watchGroupUnread(g.id);
    });
  }

  el('btn-fab-add').addEventListener('click', () => {
    openSheet('เพิ่มกลุ่ม', [
      { icon: '➕', label: 'สร้างกลุ่มใหม่', onClick: () => showModal('modal-create') },
      { icon: '🔑', label: 'เข้าร่วมด้วยรหัส', onClick: () => showModal('modal-join') }
    ]);
  });

  el('btn-do-create').addEventListener('click', async () => {
    const name = el('create-group-name').value.trim();
    const pass = el('create-group-pass').value;
    if (!name || !pass) { toast('กรอกชื่อกลุ่มและรหัสผ่าน'); return; }
    try {
      const res = await Groups.createGroup(name, pass);
      hideModal('modal-create');
      el('create-group-name').value = ''; el('create-group-pass').value = '';
      renderGroupsList();
      toast('สร้างกลุ่มสำเร็จ');
      showJoinQr(res.groupId, res.password);
    } catch (e) { toast('เกิดข้อผิดพลาด: ' + e.message); }
  });

  el('btn-do-join').addEventListener('click', async () => {
    const code = el('join-group-code').value.trim();
    const pass = el('join-group-pass').value;
    if (!code || !pass) { toast('กรอกรหัสกลุ่มและรหัสผ่าน'); return; }
    try {
      await Groups.joinGroup(code, pass);
      hideModal('modal-join');
      el('join-group-code').value = ''; el('join-group-pass').value = '';
      renderGroupsList();
      toast('เข้าร่วมกลุ่มสำเร็จ');
    } catch (e) { toast('เข้าร่วมไม่สำเร็จ: ' + e.message); }
  });

  // ---------- ห้องกลุ่ม ----------
  let isOnline = false;
  async function enterRoom(g) {
    currentGroup = g;
    pttTarget = 'all';
    isOnline = false;
    el('room-name').textContent = g.name;
    if (el('chat-scope-group-hint')) el('chat-scope-group-hint').textContent = I18N.t('scope_group_hint', { group: g.name });
    showScreen('screen-room');
    switchTab('chat');
    updateOnlineToggleUI();

    isAdmin = false; // จะอัปเดตให้ถูกต้องทันทีที่รายชื่อสมาชิกโหลดมา (ดูค่า role ของตัวเอง)
    updatePingGroupBtnVisibility();

    // เผื่อกลุ่มนี้ถูกแอดมินลบทิ้งถาวรไปแล้วโดยที่เครื่องนี้ยังไม่รู้ (ยังค้างอยู่ในรายการกลุ่มของเครื่องนี้)
    const stillExists = await Groups.getGroupInfo(g.id).catch(() => null);
    if (!stillExists) {
      toast(`กลุ่ม "${g.name}" ถูกลบไปแล้ว`, 3200);
      Groups.removeMyGroup(g.id);
      unwatchGroupUnread(g.id);
      currentGroup = null;
      showScreen('screen-groups');
      renderGroupsList();
      return;
    }

    // แชท/สมาชิก ทำงานตลอดเวลาไม่ว่าจะกด "ออนไลน์" หรือไม่ (เหมือนแอปแชททั่วไป อ่านข้อความได้เสมอ)
    Chat.listen(g.id, (msgs, isNewIncoming) => {
      currentMsgsCache = msgs;
      renderMessages(msgs);
      const chatTabActive = el('tab-chat').classList.contains('active');
      if (chatTabActive) {
        markCurrentGroupRead();
      } else {
        unreadCounts[g.id] = countUnread(msgs, getLastRead(g.id), Identity.getUid());
        updateUnreadBadgesUI();
      }
      if (isNewIncoming) {
        const last = msgs[msgs.length - 1];
        if (last && last.senderUid !== Identity.getUid()) {
          playNotifySound();
        }
      }
    });
    watchGroupUnread(g.id);

    unsubMembers = Groups.listenMembers(g.id, (members) => {
      membersCache = members;
      // เป็นแอดมินร่วมได้กี่คนก็ได้ - เช็คจาก role ของตัวเองในรายชื่อสมาชิกสด ๆ ทุกครั้งที่มีการเปลี่ยนแปลง
      const me = members.find(x => x.uid === Identity.getUid());
      isAdmin = !!me && me.role === 'admin';
      renderMembers();
      updatePingGroupBtnVisibility();
      members.forEach(m => { if (m.uid !== Identity.getUid()) watchDmUnread(m.uid); });
    });

    watchGroupPing(g.id);
  }

  // เปิด/ปิด "ออนไลน์" ด้วยตัวเอง (เหมือนสวิตช์เปิดวิทยุ) - ควบคุมสถานะออนไลน์, วิทยุ (PTT) และรับสายวิดีโอคอล
  el('btn-online-toggle').addEventListener('click', () => {
    if (!currentGroup) return;
    setOnline(!isOnline);
  });

  async function setOnline(on) {
    isOnline = on;
    updateOnlineToggleUI();
    if (!currentGroup) return;
    const g = currentGroup;

    if (on) {
      requestWakeLock();
      Presence.goOnline(g.id);
      if (unsubPresence) unsubPresence();
      unsubPresence = Presence.listen(g.id, (presence) => {
        presenceCache = presence;
        renderMembers();
        const onlineUids = Object.keys(presence);
        Mesh.syncOnlinePeers(onlineUids).catch(() => {});
        updateRadioStatus();
      });

      if (pttResyncTimer) clearInterval(pttResyncTimer);
      pttResyncTimer = setInterval(() => {
        Mesh.syncOnlinePeers(Object.keys(presenceCache)).catch(() => {});
      }, 6000);

      await Mesh.start(g.id, Identity.getUid());
      Mesh.onTalking(renderTalkingBanner);

      VideoCall.listenForIncoming(g.id, Identity.getUid());
      VideoCall.setUiHandlers({
        onIncoming: handleIncomingCall,
        // ไม่ขึ้น "เชื่อมต่อแล้ว" ตอนนี้ เพราะเป็นแค่สถานะรับสาย ยังไม่ใช่การยืนยันว่าวิดีโอเชื่อมต่อจริง
        onAccepted: () => { el('video-status').textContent = 'กำลังเชื่อมต่อวิดีโอ...'; },
        onEnded: (reason) => {
          stopRing();
          showScreen('screen-room');
          const msg = reason === 'declined' ? 'อีกฝ่ายปฏิเสธสาย' : (reason === 'failed' || reason === 'disconnected') ? 'การเชื่อมต่อวิดีโอขาดหาย (เครือข่ายไม่เสถียร)' : 'สายจบแล้ว';
          toast(msg, 3200);
        },
        onRemoteStream: (stream) => {
          playRemoteStream(stream);
          el('video-status').textContent = 'เชื่อมต่อแล้ว'; // ยืนยันจริงเมื่อมีภาพ/เสียงจากอีกฝ่ายเข้ามาแล้วเท่านั้น
        },
        onLocalStream: (stream) => { el('local-video').srcObject = stream; },
        onConnectionFailed: async (state) => {
          toast('การเชื่อมต่อวิดีโอมีปัญหา (เครือข่ายไม่เสถียร) กำลังวางสาย...', 3200);
          await VideoCall.hangUp();
          showScreen('screen-room');
        }
      });
      toast('🟢 ออนไลน์แล้ว - พร้อมใช้วิทยุ/รับสาย');
    } else {
      releaseWakeLock();
      Presence.goOffline();
      if (unsubPresence) { unsubPresence(); unsubPresence = null; }
      if (pttResyncTimer) { clearInterval(pttResyncTimer); pttResyncTimer = null; }
      Mesh.stop();
      VideoCall.stopListening();
      presenceCache = {};
      renderMembers();
      renderTalkingBanner([]);
      if (pttTalking) { pttTalking = false; pttBtn.classList.remove('active'); }
      el('room-sub').textContent = I18N.t('status_offline');
      el('radio-status').textContent = I18N.t('radio_waiting');
      toast('⚪ ออฟไลน์แล้ว');
    }
  }

  function updateOnlineToggleUI() {
    const btn = el('btn-online-toggle');
    btn.textContent = isOnline ? I18N.t('online_label') : I18N.t('offline_label');
    btn.classList.toggle('is-online', isOnline);
  }

  function updateRadioStatus() {
    const onlineCount = Object.keys(presenceCache).length;
    el('room-sub').textContent = `${onlineCount} ${I18N.t('status_online')}`;
    el('radio-status').textContent = onlineCount <= 1
      ? I18N.t('radio_waiting')
      : I18N.t('radio_connected_count', { n: Mesh.getPeerCount() });
  }

  function nameOf(uid) {
    const m = membersCache.find(x => x.uid === uid);
    return m ? m.name : (presenceCache[uid] ? presenceCache[uid].name : 'ไม่ทราบชื่อ');
  }

  // แสดงชื่อ+รูปคนที่กำลังกดวิทยุพูดอยู่ ให้เห็นตลอดทุกแท็บในห้อง (ไม่ใช่แค่แท็บวิทยุ)
  // เพื่อให้รู้ทันทีว่าใครกำลังพูดอยู่แม้กำลังดูแชท/สมาชิกอยู่ก็ตาม
  let lastTalkingKey = '';
  function renderTalkingBanner(talkingUids) {
    const banner = el('onair-banner');
    const key = (talkingUids || []).slice().sort().join(',');
    if (key === lastTalkingKey) return; // ไม่มีอะไรเปลี่ยน ไม่ต้องวาดใหม่ กันจอกระพริบ
    lastTalkingKey = key;
    if (!talkingUids || talkingUids.length === 0) { banner.classList.add('hidden'); banner.innerHTML = ''; return; }
    banner.innerHTML = talkingUids.map(uid => {
      const m = membersCache.find(x => x.uid === uid);
      const name = m ? m.name : nameOf(uid);
      return `<span class="tb-chip"><span class="tb-avatar">${avatarHtml(m || { name })}</span>🔊 ${escapeHtml(name)}</span>`;
    }).join('');
    banner.classList.remove('hidden');
  }

  function leaveRoomCleanup() {
    Chat.stop();
    if (unsubMembers) unsubMembers();
    if (unsubPresence) unsubPresence();
    Presence.goOffline();
    Mesh.stop();
    VideoCall.stopListening();
    releaseWakeLock();
    if (pttResyncTimer) { clearInterval(pttResyncTimer); pttResyncTimer = null; }
    if (currentGroup) unwatchGroupPing(currentGroup.id);
    membersCache.forEach(m => { if (m.uid !== Identity.getUid()) unwatchDmUnread(m.uid); });
    renderTalkingBanner([]);
    if (pttTalking) { pttTalking = false; pttBtn.classList.remove('active'); }
    isAdmin = false;
    updatePingGroupBtnVisibility();
    isOnline = false;
    currentGroup = null;
  }

  el('btn-back-room').addEventListener('click', () => {
    leaveRoomCleanup();
    showScreen('screen-groups');
    renderGroupsList();
  });

  // ---------- เมนูห้อง (⋮) ----------
  el('btn-room-menu').addEventListener('click', () => {
    const items = [];
    if (isAdmin) {
      items.push({
        icon: '🔑', label: `รหัสกลุ่ม: ${currentGroup.id}`,
        onClick: () => toast(`รหัสกลุ่ม: ${currentGroup.id} — แชร์ให้ทีมงานเพื่อเข้าร่วม`, 3200)
      });
      items.push({
        icon: '🔳', label: 'แสดง QR เชิญเข้าร่วม',
        onClick: () => {
          const savedPass = Groups.getGroupPassword(currentGroup.id);
          if (savedPass) { showJoinQr(currentGroup.id, savedPass); return; }
          const p = prompt('กรอกรหัสผ่านกลุ่มอีกครั้ง เพื่อสร้าง QR เชิญ');
          if (p) showJoinQr(currentGroup.id, p);
        }
      });
    }
    items.push({ icon: '🚪', label: 'ออกจากกลุ่ม (แค่ตัวเอง)', danger: true, onClick: leaveCurrentGroup });
    if (isAdmin) {
      items.push({ icon: '🗑️', label: 'ลบกลุ่มถาวร (ลบให้ทุกคน)', danger: true, onClick: confirmDeleteGroupPermanently });
    }
    openSheet(currentGroup.name, items);
  });

  async function leaveCurrentGroup() {
    if (!confirm('ออกจากกลุ่มนี้ใช่หรือไม่? (เฉพาะตัวคุณเอง กลุ่มยังอยู่สำหรับคนอื่น)')) return;
    const gid = currentGroup.id;
    await Groups.leaveGroup(gid);
    leaveRoomCleanup();
    unwatchGroupUnread(gid);
    showScreen('screen-groups');
    renderGroupsList();
  }

  // ลบกลุ่มทิ้งถาวร (แอดมินเท่านั้น) - หายไปสำหรับทุกคนในกลุ่ม กู้คืนไม่ได้
  async function confirmDeleteGroupPermanently() {
    const gname = currentGroup.name;
    if (!confirm(`ลบกลุ่ม "${gname}" ทิ้งถาวรใช่หรือไม่?\nสมาชิก แชท และข้อมูลทั้งหมดจะหายไปสำหรับทุกคน กู้คืนไม่ได้`)) return;
    const gid = currentGroup.id;
    toast('กำลังลบกลุ่ม...', 2000);
    try {
      await Groups.deleteGroupPermanently(gid);
      leaveRoomCleanup();
      unwatchGroupUnread(gid);
      showScreen('screen-groups');
      renderGroupsList();
      toast(`ลบกลุ่ม "${gname}" แล้ว`);
    } catch (e) {
      toast('ลบกลุ่มไม่สำเร็จ: ' + e.message, 3200);
    }
  }

  // ---------- แท็บล่าง (ห้องกลุ่ม) ----------
  // จำกัดขอบเขตแค่ในหน้าห้องกลุ่มเท่านั้น (ไม่งั้นจะไปชนกับแท็บของหน้าหลักที่ใช้คลาสเดียวกัน)
  document.querySelectorAll('#screen-room .nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  function switchTab(tab) {
    document.querySelectorAll('#screen-room .nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('#screen-room .tab-content').forEach(c => c.classList.remove('active'));
    el('tab-' + tab).classList.add('active');
    if (tab === 'chat') markCurrentGroupRead();
  }

  // ---------- แท็บล่าง (หน้าหลัก: แชทสาธารณะ / แผนที่อากาศ) ----------
  document.querySelectorAll('#screen-public .nav-btn[data-ptab]').forEach(btn => {
    btn.addEventListener('click', () => switchPublicTab(btn.dataset.ptab));
  });
  function switchPublicTab(tab) {
    document.querySelectorAll('#screen-public .nav-btn[data-ptab]').forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
    document.querySelectorAll('#screen-public .tab-content').forEach(c => c.classList.remove('active'));
    el('tab-' + tab).classList.add('active');
    if (tab === 'public-map') {
      requestAnimationFrame(() => {
        initWeatherMapIfNeeded();
        if (weatherMap) weatherMap.invalidateSize();
      });
    }
  }

  // ---------- แชท ----------
  function renderMessages(msgs) {
    const box = el('chat-messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    msgs.forEach(m => {
      const mine = m.senderUid === Identity.getUid();
      const div = document.createElement('div');
      div.className = 'msg' + (mine ? ' me' : '');
      const time = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
      let body = '';
      if (m.type === 'image') {
        body = `<img src="${m.imageUrl}" alt="image" onclick="window.open('${m.imageUrl}','_blank')">`;
      } else {
        body = `<div class="text">${escapeHtml(m.text || '')}</div>`;
      }
      div.innerHTML = `${mine ? '' : `<div class="sender">${escapeHtml(m.senderName || '')}</div>`}${body}<div class="time">${time}</div>`;
      box.appendChild(div);
    });
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  el('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCurrentText(); });
  el('btn-send').addEventListener('click', sendCurrentText);
  function sendCurrentText() {
    const input = el('chat-input');
    const v = input.value.trim();
    if (!v || !currentGroup) return;
    input.value = '';
    Chat.sendText(currentGroup.id, v).catch(e => toast('ส่งข้อความไม่สำเร็จ'));
  }

  el('btn-attach').addEventListener('click', () => {
    openSheet('เพิ่มรูปภาพ', [
      { icon: '📷', label: 'ถ่ายรูปใหม่', onClick: () => el('file-camera').click() },
      { icon: '🖼️', label: 'เลือกจากคลังภาพ', onClick: () => el('file-gallery').click() }
    ]);
  });
  el('file-gallery').addEventListener('change', handleFilePicked);
  el('file-camera').addEventListener('change', handleFilePicked);
  function handleFilePicked(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !currentGroup) return;
    toast('กำลังส่งรูป...');
    Chat.sendImage(currentGroup.id, file).catch(() => toast('ส่งรูปไม่สำเร็จ'));
  }

  function playNotifySound() {
    const a = el('notify-sound');
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  // ---------- พูดแล้วพิมพ์อัตโนมัติ (ใช้ในช่องแชทกลุ่ม/ส่วนตัว) ----------
  // ใช้ Web Speech API ของเบราว์เซอร์ (ต้องออนไลน์ + เบราว์เซอร์รองรับ เช่น Chrome/Safari รุ่นใหม่)
  function attachVoiceInput(btnId, inputId) {
    const btn = el(btnId);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btn.addEventListener('click', () => toast('เบราว์เซอร์นี้ไม่รองรับการพิมพ์ด้วยเสียง'));
      return;
    }
    let recog = null;
    let listening = false;
    function stopListening() {
      listening = false;
      btn.classList.remove('listening');
      if (recog) { try { recog.stop(); } catch (e) {} }
    }
    btn.addEventListener('click', () => {
      if (listening) { stopListening(); return; }
      recog = new SR();
      recog.lang = I18N.speechLang();
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const input = el(inputId);
        input.value = (input.value ? input.value + ' ' : '') + text;
        input.focus();
      };
      recog.onerror = () => toast('ฟังไม่ชัดเจน ลองพูดใหม่อีกครั้ง');
      recog.onend = () => { listening = false; btn.classList.remove('listening'); };
      try {
        recog.start();
        listening = true;
        btn.classList.add('listening');
      } catch (e) { listening = false; }
    });
  }

  // ---------- สมาชิก ----------
  function initials(name) {
    return (name || '?').trim().slice(0, 1).toUpperCase();
  }

  function renderMembers() {
    const box = el('members-list');
    box.innerHTML = '';
    membersCache.forEach(m => {
      const online = !!presenceCache[m.uid];
      const isMe = m.uid === Identity.getUid();
      const div = document.createElement('div');
      div.className = 'member-item tappable';
      const dmDot = !isMe && dmUnreadFlags[m.uid] ? '<span class="dm-dot"></span>' : '';
      div.innerHTML = `
        <div class="m-avatar">${avatarHtml(m)}<span class="dot ${online ? 'online' : ''}"></span></div>
        <div class="m-name">${escapeHtml(m.name)}${isMe ? ' (คุณ)' : ''}${dmDot}
          <div class="m-role">${m.role === 'admin' ? I18N.t('role_admin') : I18N.t('role_member')} · ${online ? I18N.t('status_online') : I18N.t('status_offline')}</div>
        </div>
        <div class="chevron">›</div>`;
      div.addEventListener('click', () => isMe ? openGroupProfileEdit(m) : openMemberSheet(m, online));
      box.appendChild(div);
    });
  }

  function openMemberSheet(m, online) {
    const items = [];
    items.push({ icon: '💬', label: 'ข้อความส่วนตัวถึง ' + m.name, onClick: () => openDm(m) });
    if (online) items.push({ icon: '📹', label: 'วิดีโอคอลหา ' + m.name, onClick: () => startVideoCallTo(m) });
    if (isAdmin) {
      if (m.role === 'admin') {
        items.push({ icon: '👑', label: 'ถอดสิทธิ์แอดมินร่วม', onClick: () => setMemberRole(m, 'member') });
      } else {
        items.push({ icon: '👑', label: 'ตั้งเป็นแอดมินร่วม', onClick: () => setMemberRole(m, 'admin') });
      }
      items.push({ icon: '🚫', label: 'นำออกจากกลุ่ม', danger: true, onClick: () => removeMember(m) });
    }
    if (Identity.isSuperAdmin() && m.uid !== Identity.getUid()) {
      items.push({ icon: '🛡️', label: 'แบนผู้ใช้นี้ (แอดมินระบบ)', danger: true, onClick: () => openBanModal(m.uid, m.name) });
    }
    openSheet(m.name, items);
  }

  async function removeMember(m) {
    if (!confirm(`นำ "${m.name}" ออกจากกลุ่มใช่หรือไม่?`)) return;
    try { await Groups.removeMember(currentGroup.id, m.uid); toast('นำออกจากกลุ่มแล้ว'); }
    catch (e) { toast('ทำรายการไม่สำเร็จ'); }
  }

  // แอดมินคนใดก็ได้ตั้ง/ถอดสิทธิ์แอดมินร่วมให้สมาชิกคนอื่นได้ ไม่จำกัดจำนวนคน
  async function setMemberRole(m, role) {
    if (role === 'member') {
      const adminCount = membersCache.filter(x => x.role === 'admin').length;
      if (adminCount <= 1) { toast('ต้องมีแอดมินเหลืออย่างน้อย 1 คนในกลุ่ม'); return; }
    }
    try {
      await Groups.setMemberRole(currentGroup.id, m.uid, role);
      toast(role === 'admin' ? `ตั้ง "${m.name}" เป็นแอดมินร่วมแล้ว` : `ถอดสิทธิ์แอดมินของ "${m.name}" แล้ว`);
    } catch (e) { toast('ทำรายการไม่สำเร็จ'); }
  }

  // ---------- วิทยุ (PTT) ----------
  el('btn-ptt-target').addEventListener('click', () => {
    const items = [{
      icon: '📢', label: I18N.t('label_all_group'), selected: pttTarget === 'all',
      onClick: () => setPttTarget('all', I18N.t('label_all_group'), '📢')
    }];
    membersCache.forEach(m => {
      if (m.uid === Identity.getUid()) return;
      items.push({
        icon: '🎧', label: m.name, selected: pttTarget === m.uid,
        onClick: () => setPttTarget(m.uid, m.name, '🎧')
      });
    });
    openSheet(I18N.t('ptt_who_title'), items);
  });
  function setPttTarget(uid, label, icon) {
    pttTarget = uid;
    el('btn-ptt-target').textContent = `${icon} ${label}`;
  }

  const pttBtn = el('btn-ptt');
  let pttTalking = false; // แตะครั้งแรกเริ่มพูด แตะอีกครั้งหยุดพูด (ไม่ต้องกดค้าง)

  function togglePtt(e) {
    e.preventDefault();
    pttTalking = !pttTalking;
    if (pttTalking) {
      pttBtn.classList.add('active');
      Mesh.pttDown(pttTarget);
    } else {
      pttBtn.classList.remove('active');
      Mesh.pttUp();
    }
  }
  pttBtn.addEventListener('click', togglePtt);

  // ---------- วิดีโอคอล ----------
  let pendingIncoming = null;

  // เสียงเรียกเข้า: ดังวนจนกว่าจะรับสาย/ปฏิเสธ
  function playRing() {
    const a = el('ring-sound');
    if (!a) return;
    a.loop = true;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
  function stopRing() {
    const a = el('ring-sound');
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  // แสดงวิดีโอของอีกฝ่าย - เบราว์เซอร์บางตัวบล็อกการเล่นวิดีโอ+เสียงอัตโนมัติ (autoplay policy)
  // ถ้าโดนบล็อก ให้เล่นแบบปิดเสียงชั่วคราวก่อน (อย่างน้อยเห็นภาพ) แล้วโชว์ปุ่มให้กดเปิดเสียงเอง
  function playRemoteStream(stream) {
    const v = el('remote-video');
    v.srcObject = stream;
    el('btn-unmute-remote').classList.add('hidden');
    const p = v.play();
    if (p && p.catch) {
      p.catch(() => {
        v.muted = true;
        v.play().catch(() => {});
        el('btn-unmute-remote').classList.remove('hidden');
      });
    }
  }
  el('btn-unmute-remote').addEventListener('click', () => {
    const v = el('remote-video');
    v.muted = false;
    v.play().catch(() => {});
    el('btn-unmute-remote').classList.add('hidden');
  });

  // รีเซ็ตปุ่มปิดไมค์/ปิดกล้อง/ปุ่มเปิดเสียงทุกครั้งที่เริ่มสายใหม่
  function resetCallControls() {
    el('btn-toggle-mic').textContent = '🎤';
    el('btn-toggle-mic').classList.remove('is-off');
    el('btn-toggle-cam').textContent = '📷';
    el('btn-toggle-cam').classList.remove('is-off');
    el('local-video').classList.remove('cam-off');
    el('btn-unmute-remote').classList.add('hidden');
  }

  function handleIncomingCall(call) {
    pendingIncoming = call;
    el('incoming-call-name').textContent = call.fromName || 'เพื่อนร่วมทีม';
    showModal('modal-incoming-call');
    playRing();
  }
  el('btn-accept-call').addEventListener('click', async () => {
    stopRing();
    hideModal('modal-incoming-call');
    if (!pendingIncoming) return;
    resetCallControls();
    showScreen('screen-video');
    el('video-status').textContent = 'กำลังเชื่อมต่อ...';
    await VideoCall.acceptCall(pendingIncoming);
    pendingIncoming = null;
  });
  el('btn-decline-call').addEventListener('click', async () => {
    stopRing();
    hideModal('modal-incoming-call');
    if (pendingIncoming) await VideoCall.declineCall(pendingIncoming);
    pendingIncoming = null;
  });

  async function startVideoCallTo(member) {
    resetCallControls();
    showScreen('screen-video');
    el('video-status').textContent = `กำลังโทรหา ${member.name}...`;
    try {
      await VideoCall.startCall(currentGroup.id, Identity.getUid(), member.uid, member.name);
    } catch (e) {
      toast('เปิดกล้อง/ไมค์ไม่สำเร็จ');
      showScreen('screen-room');
    }
  }

  el('btn-switch-cam').addEventListener('click', () => VideoCall.switchCamera().catch(() => toast('สลับกล้องไม่สำเร็จ')));
  el('btn-toggle-mic').addEventListener('click', () => {
    const muted = VideoCall.toggleMic();
    el('btn-toggle-mic').textContent = muted ? '🔇' : '🎤';
    el('btn-toggle-mic').classList.toggle('is-off', muted);
  });
  el('btn-toggle-cam').addEventListener('click', () => {
    const off = VideoCall.toggleCam();
    el('btn-toggle-cam').textContent = off ? '📵' : '📷';
    el('btn-toggle-cam').classList.toggle('is-off', off);
    el('local-video').classList.toggle('cam-off', off);
  });
  el('btn-hangup').addEventListener('click', async () => { await VideoCall.hangUp(); showScreen('screen-room'); });

  // ================== หน้าหลัก: แชทสาธารณะ + แผนที่สภาพอากาศ + กล่องข้อความส่วนตัว ==================
  let publicChatStarted = false;
  function startPublicScreen() {
    if (!publicChatStarted) {
      publicChatStarted = true;
      PublicChat.listen(renderPublicMessages);
    }
  }

  el('btn-goto-groups').addEventListener('click', () => {
    showScreen('screen-groups');
    renderGroupsList();
  });
  el('btn-back-public').addEventListener('click', () => showScreen('screen-public'));

  // ---------- แชทสาธารณะ ----------
  function renderPublicMessages(msgs) {
    const box = el('public-chat-messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    msgs.forEach(m => {
      const mine = m.senderUid === Identity.getUid();
      const div = document.createElement('div');
      div.className = 'msg' + (mine ? ' me' : '');
      const time = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
      div.innerHTML = `${mine ? '' : `<div class="sender tappable-sender">${escapeHtml(m.senderName || '')}</div>`}<div class="text">${escapeHtml(m.text || '')}</div><div class="time">${time}</div>`;
      if (!mine) {
        div.querySelector('.sender').addEventListener('click', () => {
          const peer = { uid: m.senderUid, name: m.senderName, avatar: m.senderAvatar };
          if (Identity.isSuperAdmin()) {
            openSheet(m.senderName, [
              { icon: '💬', label: 'ข้อความส่วนตัว', onClick: () => openDm(peer, 'screen-public') },
              { icon: '🛡️', label: 'แบนผู้ใช้นี้ (แอดมินระบบ)', danger: true, onClick: () => openBanModal(peer.uid, peer.name) }
            ]);
          } else {
            openDm(peer, 'screen-public');
          }
        });
      }
      box.appendChild(div);
    });
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  el('public-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCurrentPublicText(); });
  el('btn-public-send').addEventListener('click', sendCurrentPublicText);
  function sendCurrentPublicText() {
    const input = el('public-chat-input');
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    PublicChat.sendText(v).catch(() => toast('ส่งข้อความไม่สำเร็จ'));
  }

  // ---------- กล่องข้อความส่วนตัว (inbox) ----------
  // เข้าถึงกล่องข้อความส่วนตัวได้จากทั้งหน้าหลักและห้องกลุ่ม (บทสนทนาเดียวกันไม่ว่าจะเริ่มทักจากที่ไหน) -
  // เก็บว่ากดเข้ามาจากหน้าไหน เพื่อให้ปุ่มย้อนกลับพากลับไปหน้านั้นถูกต้อง
  let dmInboxReturnScreen = 'screen-public';
  el('btn-dm-inbox').addEventListener('click', () => { dmInboxReturnScreen = 'screen-public'; showScreen('screen-dm-inbox'); });
  el('btn-dm-inbox-room').addEventListener('click', () => { dmInboxReturnScreen = 'screen-room'; showScreen('screen-dm-inbox'); });
  el('btn-back-dm-inbox').addEventListener('click', () => showScreen(dmInboxReturnScreen));

  function renderDmInboxBadge(threads) {
    const count = threads.filter(t => t.unread).length;
    document.querySelectorAll('#btn-dm-inbox .n-badge, #btn-dm-inbox-room .n-badge').forEach(badge => {
      badge.innerHTML = renderBadge(count);
    });
    renderDmInboxList(threads);
  }

  function renderDmInboxList(threads) {
    const box = el('dm-inbox-list');
    if (!box) return;
    box.innerHTML = '';
    if (threads.length === 0) {
      box.innerHTML = `<div class="empty-hint">ยังไม่มีข้อความส่วนตัว แตะชื่อใครก็ได้ในแชทสาธารณะเพื่อเริ่มคุย</div>`;
      return;
    }
    threads.forEach(t => {
      const div = document.createElement('div');
      div.className = 'group-item';
      const time = t.lastTs && t.lastTs.toDate ? t.lastTs.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
      div.innerHTML = `
        <div class="avatar">${avatarHtml({ name: t.peerName, avatar: t.peerAvatar })}</div>
        <div class="info">
          <div class="g-name">${escapeHtml(t.peerName || '')}${t.unread ? '<span class="dm-dot"></span>' : ''}</div>
          <div class="g-role">${escapeHtml(t.lastText || '')}</div>
        </div>
        <div class="chevron">${time}</div>`;
      div.addEventListener('click', () => openDm({ uid: t.peerUid, name: t.peerName, avatar: t.peerAvatar }, 'screen-dm-inbox'));
      box.appendChild(div);
    });
  }

  // ---------- แผนที่สภาพอากาศ (Leaflet + OpenStreetMap ฟรี ไม่ต้องขอ API key) ----------
  const WEATHER_ICONS = { sunny: '☀️', cloudy: '☁️', rain: '🌧️' };
  const WEATHER_LABELS = { sunny: I18N.t('cond_sunny'), cloudy: I18N.t('cond_cloudy'), rain: I18N.t('cond_rain') };
  let weatherMap = null;
  let weatherMarkers = {};
  let weatherPinsStarted = false;
  let addPinMode = false;
  let pendingPinLatLng = null;
  let pendingPinCondition = null;
  let pendingPinPhotoDataUrl = null;
  let lastWeatherPins = [];

  // ป้ายกำกับเวลาของหมุด: เวลาที่ปัก (ตามเวลาไทย) + นับถอยหลังว่าอีกกี่นาทีจะหายไป (อายุหมุด 2 ชม.)
  function pinTimeLabel(p) {
    if (!p.ts || !p.ts.toDate) return '';
    return p.ts.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }
  function pinCountdownLabel(p) {
    const remainMs = WeatherPins.TTL_MS - WeatherPins.ageMs(p);
    if (remainMs <= 0) return 'กำลังจะหายไป';
    const mins = Math.max(1, Math.round(remainMs / 60000));
    if (mins >= 60) {
      const h = Math.floor(mins / 60), m = mins % 60;
      return `เหลือ ${h} ชม.${m ? ' ' + m + ' น.' : ''}`;
    }
    return `เหลือ ${mins} นาที`;
  }

  function initWeatherMapIfNeeded() {
    if (weatherMap || typeof L === 'undefined') return;
    weatherMap = L.map('weather-map', { zoomControl: true }).setView([13.7563, 100.5018], 6); // ค่าเริ่มต้น: กรุงเทพฯ
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(weatherMap);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        weatherMap.setView([pos.coords.latitude, pos.coords.longitude], 12);
      }, () => {}, { timeout: 5000 });
    }
    weatherMap.on('click', (e) => {
      if (!addPinMode) return;
      pendingPinLatLng = e.latlng;
      addPinMode = false;
      el('btn-add-pin').classList.remove('active');
      openWeatherPinModal();
    });
    if (!weatherPinsStarted) {
      weatherPinsStarted = true;
      WeatherPins.listen((pins) => { lastWeatherPins = pins; renderWeatherPins(pins); });
      // เช็คซ้ำทุก 30 วิ เพื่อซ่อนหมุดที่ครบ 2 ชม.พอดีออกจากแผนที่ และอัปเดตป้ายนับถอยหลัง
      // (query ของ Firestore ไม่รู้เองว่า "เวลาปัจจุบัน" ขยับไปแล้ว จึงต้องกรองซ้ำฝั่ง client)
      setInterval(() => renderWeatherPins(lastWeatherPins), 30000);
    }
  }

  el('btn-add-pin').addEventListener('click', () => {
    addPinMode = !addPinMode;
    el('btn-add-pin').classList.toggle('active', addPinMode);
    toast(addPinMode ? 'แตะบนแผนที่ตรงตำแหน่งที่ต้องการปักหมุด' : 'ยกเลิกการปักหมุด');
  });

  function renderWeatherPins(pinsIn) {
    if (!weatherMap) return;
    // กรองหมุดที่ครบอายุ 2 ชม.แล้วออกจากแผนที่ (query อาจยังคืนมาเผื่อไว้เกินอายุจริงเล็กน้อย)
    const pins = pinsIn.filter(p => !WeatherPins.isExpired(p));
    const seen = {};
    pins.forEach(p => {
      seen[p.id] = true;
      const iconHtml = `<span class="pin-emoji">${WEATHER_ICONS[p.condition] || '📍'}</span><span class="pin-age-tag">${escapeHtml(pinCountdownLabel(p))}</span>`;
      if (weatherMarkers[p.id]) {
        weatherMarkers[p.id].setLatLng([p.lat, p.lng]);
        weatherMarkers[p.id].setIcon(L.divIcon({ className: 'weather-pin-icon', html: iconHtml, iconSize: [34, 34] }));
      } else {
        const icon = L.divIcon({ className: 'weather-pin-icon', html: iconHtml, iconSize: [34, 34] });
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(weatherMap);
        marker.bindPopup(() => buildPinPopupHtml(p));
        marker.on('popupopen', () => wirePinPopup(p));
        weatherMarkers[p.id] = marker;
      }
    });
    Object.keys(weatherMarkers).forEach(id => {
      if (!seen[id]) { weatherMap.removeLayer(weatherMarkers[id]); delete weatherMarkers[id]; }
    });
  }

  function buildPinPopupHtml(p) {
    const photo = p.photoDataUrl ? `<img class="pin-popup-photo" src="${p.photoDataUrl}">` : '';
    const mine = p.uid === Identity.getUid();
    const avatarJson = escapeHtml(JSON.stringify(p.avatar || null));
    return `
      <div class="pin-popup">
        <div class="pin-popup-head">${WEATHER_ICONS[p.condition] || '📍'} <b>${escapeHtml(WEATHER_LABELS[p.condition] || '')}</b></div>
        <div class="pin-popup-by">${escapeHtml(p.name || '')}</div>
        <div class="pin-popup-time">🕐 ข้อมูล ณ เวลา ${escapeHtml(pinTimeLabel(p))} น. · ${escapeHtml(pinCountdownLabel(p))}</div>
        ${p.note ? `<div class="pin-popup-note">${escapeHtml(p.note)}</div>` : ''}
        ${photo}
        <div class="pin-popup-actions">
          ${mine
            ? `<button type="button" class="pin-popup-del" data-pin="${p.id}">🗑️</button>`
            : `<button type="button" class="pin-popup-dm" data-uid="${p.uid}" data-name="${escapeHtml(p.name || '')}" data-avatar='${avatarJson}'>💬</button>`}
          ${(!mine && Identity.isSuperAdmin())
            ? `<button type="button" class="pin-popup-ban" data-uid="${p.uid}" data-name="${escapeHtml(p.name || '')}">🛡️</button>`
            : ''}
        </div>
      </div>`;
  }

  function wirePinPopup(p) {
    if (!weatherMarkers[p.id]) return;
    const popup = weatherMarkers[p.id].getPopup();
    const node = popup && popup.getElement ? popup.getElement() : null;
    if (!node) return;
    const dmBtn = node.querySelector('.pin-popup-dm');
    if (dmBtn) dmBtn.addEventListener('click', () => {
      let avatar = null;
      try { avatar = JSON.parse(dmBtn.dataset.avatar); } catch (err) {}
      weatherMap.closePopup();
      openDm({ uid: dmBtn.dataset.uid, name: dmBtn.dataset.name, avatar }, 'screen-public');
    });
    const delBtn = node.querySelector('.pin-popup-del');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm('ลบหมุดนี้ใช่หรือไม่?')) return;
      try { await WeatherPins.removePin(delBtn.dataset.pin); weatherMap.closePopup(); }
      catch (err) { toast('ลบไม่สำเร็จ'); }
    });
    const banBtn = node.querySelector('.pin-popup-ban');
    if (banBtn) banBtn.addEventListener('click', () => {
      weatherMap.closePopup();
      openBanModal(banBtn.dataset.uid, banBtn.dataset.name);
    });
  }

  // ---------- ป๊อปอัพปักหมุดสภาพอากาศ ----------
  function openWeatherPinModal() {
    pendingPinCondition = null;
    pendingPinPhotoDataUrl = null;
    el('pin-note-input').value = '';
    el('pin-photo-preview').classList.add('hidden');
    el('pin-photo-preview').innerHTML = '';
    document.querySelectorAll('#modal-weather-pin .cond-btn').forEach(b => b.classList.remove('selected'));
    showModal('modal-weather-pin');
  }
  document.querySelectorAll('#modal-weather-pin .cond-btn').forEach(b => {
    b.addEventListener('click', () => {
      pendingPinCondition = b.dataset.cond;
      document.querySelectorAll('#modal-weather-pin .cond-btn').forEach(x => x.classList.toggle('selected', x === b));
    });
  });
  el('btn-pin-pick-photo').addEventListener('click', () => el('pin-photo-input').click());
  el('pin-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      pendingPinPhotoDataUrl = await resizeImageToDataUrl(file, 480, 0.6);
      el('pin-photo-preview').classList.remove('hidden');
      el('pin-photo-preview').innerHTML = `<img src="${pendingPinPhotoDataUrl}">`;
    } catch (err) { toast('แนบรูปไม่สำเร็จ'); }
  });
  el('btn-submit-pin').addEventListener('click', async () => {
    if (!pendingPinCondition) { toast('เลือกสภาพอากาศก่อน'); return; }
    if (!pendingPinLatLng) { toast('ยังไม่ได้เลือกตำแหน่งบนแผนที่'); return; }
    try {
      await WeatherPins.addPin({
        lat: pendingPinLatLng.lat, lng: pendingPinLatLng.lng,
        condition: pendingPinCondition, note: el('pin-note-input').value.trim(),
        photoDataUrl: pendingPinPhotoDataUrl
      });
      hideModal('modal-weather-pin');
      toast('ปักหมุดแล้ว');
      pendingPinLatLng = null;
    } catch (e) { toast('ปักหมุดไม่สำเร็จ'); }
  });

  // ================== แผงควบคุมแอดมินระบบ (super admin เท่านั้น): แบน/ปลดแบนผู้ใช้ ==================
  function updateSuperAdminUI() {
    el('btn-admin-panel').classList.toggle('hidden', !Identity.isSuperAdmin());
  }

  el('btn-admin-panel').addEventListener('click', () => {
    showScreen('screen-admin');
    renderBannedUsersList();
  });
  el('btn-back-admin').addEventListener('click', () => showScreen('screen-public'));

  let pendingBanTarget = null;
  function openBanModal(uid, name) {
    if (!Identity.isSuperAdmin()) return;
    pendingBanTarget = { uid, name };
    el('ban-target-name').textContent = name || '';
    showModal('modal-ban-user');
  }

  document.querySelectorAll('#modal-ban-user .ban-dur-btn').forEach(b => {
    b.addEventListener('click', async () => {
      if (!pendingBanTarget) return;
      const days = b.dataset.days;
      const bannedUntil = days === 'forever' ? null : firebase.firestore.Timestamp.fromMillis(Date.now() + Number(days) * 86400000);
      try {
        await db.collection('bannedUsers').doc(pendingBanTarget.uid).set({
          name: pendingBanTarget.name || '',
          bannedUntil,
          bannedBy: Identity.getUid(),
          bannedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        hideModal('modal-ban-user');
        toast('แบนผู้ใช้แล้ว');
      } catch (e) { toast('แบนไม่สำเร็จ'); }
    });
  });

  el('btn-ban-wipe').addEventListener('click', async () => {
    if (!pendingBanTarget) return;
    if (!confirm(`แบนถาวรและลบข้อความ/หมุดทั้งหมดของ "${pendingBanTarget.name}" ใช่หรือไม่? (กู้คืนไม่ได้)`)) return;
    const targetUid = pendingBanTarget.uid;
    try {
      await db.collection('bannedUsers').doc(targetUid).set({
        name: pendingBanTarget.name || '',
        bannedUntil: null,
        bannedBy: Identity.getUid(),
        bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
        wiped: true
      });
      // ลบข้อความแชทสาธารณะ + หมุดสภาพอากาศทั้งหมดของคนนี้ทิ้ง (จำกัดชุดละ 400 รายการต่อคอลเลกชัน กันเกินขีดจำกัด batch)
      const [msgsSnap, pinsSnap] = await Promise.all([
        db.collection('publicChatMessages').where('senderUid', '==', targetUid).limit(400).get(),
        db.collection('weatherPins').where('uid', '==', targetUid).limit(400).get()
      ]);
      const batch = db.batch();
      msgsSnap.forEach(d => batch.delete(d.ref));
      pinsSnap.forEach(d => batch.delete(d.ref));
      if (!msgsSnap.empty || !pinsSnap.empty) await batch.commit();
      hideModal('modal-ban-user');
      toast('ลบถาวรเรียบร้อยแล้ว');
    } catch (e) { toast('ทำรายการไม่สำเร็จ'); }
  });

  async function renderBannedUsersList() {
    const box = el('banned-users-list');
    box.innerHTML = '<div class="empty-hint">กำลังโหลด...</div>';
    try {
      const snap = await db.collection('bannedUsers').get();
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
      if (rows.length === 0) { box.innerHTML = '<div class="empty-hint">ยังไม่มีผู้ใช้ที่ถูกแบน</div>'; return; }
      box.innerHTML = '';
      rows.forEach(r => {
        const untilMs = r.bannedUntil && r.bannedUntil.toMillis ? r.bannedUntil.toMillis() : null;
        const statusText = untilMs ? ('จนถึง ' + new Date(untilMs).toLocaleString('th-TH')) : 'ถาวร';
        const div = document.createElement('div');
        div.className = 'group-item';
        div.innerHTML = `
          <div class="info">
            <div class="g-name">${escapeHtml(r.name || r.id)}</div>
            <div class="g-role">${escapeHtml(statusText)}${r.wiped ? ' · ลบเนื้อหาแล้ว' : ''}</div>
          </div>
          <button type="button" class="btn-secondary" data-unban="${r.id}" style="width:auto;padding:8px 14px;">ปลดแบน</button>`;
        div.querySelector('[data-unban]').addEventListener('click', async () => {
          try { await db.collection('bannedUsers').doc(r.id).delete(); renderBannedUsersList(); toast('ปลดแบนแล้ว'); }
          catch (e) { toast('ทำรายการไม่สำเร็จ'); }
        });
        box.appendChild(div);
      });
    } catch (e) {
      box.innerHTML = '<div class="empty-hint">โหลดรายชื่อไม่สำเร็จ</div>';
    }
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.addEventListener('beforeunload', () => { Presence.goOffline(); });

  init();
})();
