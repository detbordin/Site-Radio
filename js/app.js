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

  const el = (id) => document.getElementById(id);

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

  // ---------- ชื่อผู้ใช้ ----------
  async function init() {
    await Identity.signIn();
    VideoCall.setMyName(Identity.getName());

    // เช็คว่ามาจากลิงก์เชิญ/สแกน QR ไหม (?g=รหัสกลุ่ม&p=รหัสผ่าน)
    const params = new URLSearchParams(location.search);
    const joinCode = params.get('g');
    const joinPass = params.get('p');
    if (joinCode && joinPass) {
      pendingJoin = { code: joinCode, pass: joinPass };
      // ลบพารามิเตอร์ออกจาก URL ทันที ไม่ให้รหัสผ่านค้างอยู่ในแถบที่อยู่/ประวัติเบราว์เซอร์
      history.replaceState(null, '', location.pathname);
    }

    const name = Identity.getName();
    if (!name) {
      showScreen('screen-name');
    } else {
      showScreen('screen-groups');
      renderGroupsList();
      if (pendingJoin) { const pj = pendingJoin; pendingJoin = null; await autoJoin(pj.code, pj.pass); }
    }
  }

  el('btn-save-name').addEventListener('click', async () => {
    const v = el('input-name').value.trim();
    if (!v) { toast('กรุณาใส่ชื่อ'); return; }
    Identity.setName(v);
    VideoCall.setMyName(v);
    showScreen('screen-groups');
    renderGroupsList();
    if (pendingJoin) { const pj = pendingJoin; pendingJoin = null; await autoJoin(pj.code, pj.pass); }
  });

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

  el('btn-my-name').addEventListener('click', () => {
    const v = prompt('เปลี่ยนชื่อของคุณ', Identity.getName());
    if (v && v.trim()) { Identity.setName(v.trim()); VideoCall.setMyName(v.trim()); toast('เปลี่ยนชื่อแล้ว'); }
  });

  // ---------- รายการกลุ่ม ----------
  function renderGroupsList() {
    const list = Groups.getMyGroups();
    const box = el('groups-list');
    box.innerHTML = '';
    if (list.length === 0) {
      box.innerHTML = '<div class="empty-hint">ยังไม่มีกลุ่ม แตะปุ่ม + ด้านล่างเพื่อสร้างกลุ่มใหม่ หรือเข้าร่วมด้วยรหัสที่ได้รับ</div>';
      return;
    }
    list.forEach(g => {
      const div = document.createElement('div');
      div.className = 'group-item';
      div.innerHTML = `
        <div class="avatar">📻</div>
        <div class="info">
          <div class="g-name">${escapeHtml(g.name)}</div>
          <div class="g-role">${g.role === 'admin' ? 'แอดมิน' : 'สมาชิก'} · รหัส ${g.id}</div>
        </div>
        <div class="chevron">›</div>`;
      div.addEventListener('click', () => enterRoom(g));
      box.appendChild(div);
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
  async function enterRoom(g) {
    currentGroup = g;
    pttTarget = 'all';
    el('room-name').textContent = g.name;
    showScreen('screen-room');
    switchTab('chat');

    const infoRes = await Groups.getGroupInfo(g.id).catch(() => null);
    isAdmin = infoRes && infoRes.adminUid === Identity.getUid();

    Chat.listen(g.id, (msgs, isNewIncoming) => {
      renderMessages(msgs);
      if (isNewIncoming) {
        const last = msgs[msgs.length - 1];
        if (last && last.senderUid !== Identity.getUid()) {
          playNotifySound();
        }
      }
    });

    unsubMembers = Groups.listenMembers(g.id, (members) => {
      membersCache = members;
      renderMembers();
    });

    Presence.goOnline(g.id);
    unsubPresence = Presence.listen(g.id, (presence) => {
      presenceCache = presence;
      renderMembers();
      const onlineUids = Object.keys(presence);
      Mesh.syncOnlinePeers(onlineUids).catch(() => {});
      updateRadioStatus();
    });

    await Mesh.start(g.id, Identity.getUid());
    Mesh.onTalking((talkingUids) => {
      const banner = el('onair-banner');
      if (talkingUids.length === 0) { banner.classList.add('hidden'); return; }
      const names = talkingUids.map(uid => nameOf(uid)).join(', ');
      banner.textContent = `🔊 ${names} กำลังพูด`;
      banner.classList.remove('hidden');
    });

    VideoCall.listenForIncoming(g.id, Identity.getUid());
    VideoCall.setUiHandlers({
      onIncoming: handleIncomingCall,
      onAccepted: () => { el('video-status').textContent = 'เชื่อมต่อแล้ว'; },
      onEnded: (reason) => { showScreen('screen-room'); toast(reason === 'declined' ? 'อีกฝ่ายปฏิเสธสาย' : 'สายจบแล้ว'); },
      onRemoteStream: (stream) => { el('remote-video').srcObject = stream; },
      onLocalStream: (stream) => { el('local-video').srcObject = stream; }
    });
  }

  function updateRadioStatus() {
    const onlineCount = Object.keys(presenceCache).length;
    el('room-sub').textContent = `${onlineCount} คนออนไลน์`;
    el('radio-status').textContent = onlineCount <= 1
      ? 'รอเพื่อนร่วมทีมออนไลน์...'
      : `เชื่อมต่อวิทยุกับ ${Mesh.getPeerCount()} คน`;
  }

  function nameOf(uid) {
    const m = membersCache.find(x => x.uid === uid);
    return m ? m.name : (presenceCache[uid] ? presenceCache[uid].name : 'ไม่ทราบชื่อ');
  }

  function leaveRoomCleanup() {
    Chat.stop();
    if (unsubMembers) unsubMembers();
    if (unsubPresence) unsubPresence();
    Presence.goOffline();
    Mesh.stop();
    VideoCall.stopListening();
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
    items.push({ icon: '🚪', label: 'ออกจากกลุ่ม', danger: true, onClick: leaveCurrentGroup });
    openSheet(currentGroup.name, items);
  });

  async function leaveCurrentGroup() {
    if (!confirm('ออกจากกลุ่มนี้ใช่หรือไม่?')) return;
    await Groups.leaveGroup(currentGroup.id);
    leaveRoomCleanup();
    showScreen('screen-groups');
    renderGroupsList();
  }

  // ---------- แท็บล่าง ----------
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  function switchTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    el('tab-' + tab).classList.add('active');
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
      const hasActions = !isMe && (online || isAdmin);
      const div = document.createElement('div');
      div.className = 'member-item' + (hasActions ? ' tappable' : '');
      div.innerHTML = `
        <div class="m-avatar">${initials(m.name)}<span class="dot ${online ? 'online' : ''}"></span></div>
        <div class="m-name">${escapeHtml(m.name)}${isMe ? ' (คุณ)' : ''}
          <div class="m-role">${m.role === 'admin' ? 'แอดมิน' : 'สมาชิก'} · ${online ? 'ออนไลน์' : 'ออฟไลน์'}</div>
        </div>
        ${hasActions ? '<div class="chevron">›</div>' : ''}`;
      if (hasActions) div.addEventListener('click', () => openMemberSheet(m, online));
      box.appendChild(div);
    });
  }

  function openMemberSheet(m, online) {
    const items = [];
    if (online) items.push({ icon: '📹', label: 'วิดีโอคอลหา ' + m.name, onClick: () => startVideoCallTo(m) });
    if (isAdmin) items.push({ icon: '🚫', label: 'นำออกจากกลุ่ม', danger: true, onClick: () => removeMember(m) });
    openSheet(m.name, items);
  }

  async function removeMember(m) {
    if (!confirm(`นำ "${m.name}" ออกจากกลุ่มใช่หรือไม่?`)) return;
    try { await Groups.removeMember(currentGroup.id, m.uid); toast('นำออกจากกลุ่มแล้ว'); }
    catch (e) { toast('ทำรายการไม่สำเร็จ'); }
  }

  // ---------- วิทยุ (PTT) ----------
  el('btn-ptt-target').addEventListener('click', () => {
    const items = [{
      icon: '📢', label: 'ทั้งกลุ่ม', selected: pttTarget === 'all',
      onClick: () => setPttTarget('all', 'ทั้งกลุ่ม', '📢')
    }];
    membersCache.forEach(m => {
      if (m.uid === Identity.getUid()) return;
      items.push({
        icon: '🎧', label: m.name, selected: pttTarget === m.uid,
        onClick: () => setPttTarget(m.uid, m.name, '🎧')
      });
    });
    openSheet('วิทยุหาใคร?', items);
  });
  function setPttTarget(uid, label, icon) {
    pttTarget = uid;
    el('btn-ptt-target').textContent = `${icon} ${label}`;
  }

  const pttBtn = el('btn-ptt');
  function pttStart(e) {
    e.preventDefault();
    pttBtn.classList.add('active');
    Mesh.pttDown(pttTarget);
  }
  function pttEnd(e) {
    e.preventDefault();
    pttBtn.classList.remove('active');
    Mesh.pttUp();
  }
  pttBtn.addEventListener('mousedown', pttStart);
  pttBtn.addEventListener('touchstart', pttStart, { passive: false });
  pttBtn.addEventListener('mouseup', pttEnd);
  pttBtn.addEventListener('mouseleave', pttEnd);
  pttBtn.addEventListener('touchend', pttEnd);
  pttBtn.addEventListener('touchcancel', pttEnd);

  // ---------- วิดีโอคอล ----------
  let pendingIncoming = null;
  function handleIncomingCall(call) {
    pendingIncoming = call;
    el('incoming-call-name').textContent = call.fromName || 'เพื่อนร่วมทีม';
    showModal('modal-incoming-call');
  }
  el('btn-accept-call').addEventListener('click', async () => {
    hideModal('modal-incoming-call');
    if (!pendingIncoming) return;
    showScreen('screen-video');
    el('video-status').textContent = 'กำลังเชื่อมต่อ...';
    await VideoCall.acceptCall(pendingIncoming);
    pendingIncoming = null;
  });
  el('btn-decline-call').addEventListener('click', async () => {
    hideModal('modal-incoming-call');
    if (pendingIncoming) await VideoCall.declineCall(pendingIncoming);
    pendingIncoming = null;
  });

  async function startVideoCallTo(member) {
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
  el('btn-hangup').addEventListener('click', async () => { await VideoCall.hangUp(); showScreen('screen-room'); });

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.addEventListener('beforeunload', () => { Presence.goOffline(); });

  init();
})();
