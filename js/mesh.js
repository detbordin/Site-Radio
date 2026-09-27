// วิทยุสื่อสาร (Push-to-talk) - เชื่อมต่อแบบ mesh กับทุกคนที่ออนไลน์ในกลุ่ม
// เลือกพูดคนเดียวหรือพูดทั้งกลุ่มได้ โดยเปิด/ปิดแทร็กเสียงเฉพาะคู่ที่ต้องการ
const Mesh = (() => {
  let groupId = null;
  let myUid = null;
  let localStream = null;
  let peers = {}; // uid -> { pc, sendTrack, audioEl, analyser, talking }
  let onOnAirChange = () => {};

  async function ensureLocalStream() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    return localStream;
  }

  function cleanupPeer(uid) {
    const p = peers[uid];
    if (!p) return;
    try { p.pc.close(); } catch (e) {}
    if (p.audioEl) { p.audioEl.srcObject = null; p.audioEl.remove(); }
    if (p.rtdbHandlers) p.rtdbHandlers.forEach(off => off());
    delete peers[uid];
  }

  async function createPeerAsCaller(uid) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const sendTrack = localStream.getAudioTracks()[0].clone();
    sendTrack.enabled = false;
    pc.addTrack(sendTrack, localStream);
    setupCommon(uid, pc, sendTrack);

    const key = pairKey(myUid, uid);
    const base = rtdb.ref(`rtc/${groupId}/ptt/${key}`);
    await base.remove();

    pc.onicecandidate = (e) => {
      if (e.candidate) base.child(`candidates/${myUid}`).push(e.candidate.toJSON());
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await base.child('offer').set({ sdp: offer.sdp, type: offer.type, from: myUid });

    const offAnswer = base.child('answer').on('value', async (snap) => {
      const val = snap.val();
      if (val && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(val));
      }
    });
    const offCand = base.child(`candidates/${uid}`).on('child_added', (snap) => {
      pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => {});
    });
    peers[uid].rtdbHandlers = [
      () => base.child('answer').off('value', offAnswer),
      () => base.child(`candidates/${uid}`).off('child_added', offCand)
    ];
  }

  async function createPeerAsCallee(uid) {
    const key = pairKey(myUid, uid);
    const base = rtdb.ref(`rtc/${groupId}/ptt/${key}`);
    // ฝั่งนี้อาจมาถึงก่อนที่อีกฝั่ง (ผู้โทร) จะเขียน offer ทัน จึงลองรออีกสักครู่แทนที่จะยอมแพ้ทันที
    let offerSnap = await base.child('offer').get();
    for (let tries = 0; !offerSnap.exists() && tries < 6; tries++) {
      await new Promise(r => setTimeout(r, 400));
      offerSnap = await base.child('offer').get();
    }
    if (!offerSnap.exists()) return;
    const offerVal = offerSnap.val();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const sendTrack = localStream.getAudioTracks()[0].clone();
    sendTrack.enabled = false;
    pc.addTrack(sendTrack, localStream);
    setupCommon(uid, pc, sendTrack);

    pc.onicecandidate = (e) => {
      if (e.candidate) base.child(`candidates/${myUid}`).push(e.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offerVal));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await base.child('answer').set({ sdp: answer.sdp, type: answer.type, from: myUid });

    const offCand = base.child(`candidates/${uid}`).on('child_added', (snap) => {
      pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => {});
    });
    peers[uid].rtdbHandlers = [
      () => base.child(`candidates/${uid}`).off('child_added', offCand)
    ];
  }

  function setupCommon(uid, pc, sendTrack) {
    peers[uid] = { pc, sendTrack, audioEl: null, talking: false };
    pc.ontrack = (e) => {
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.srcObject = e.streams[0];
      document.body.appendChild(audioEl);
      peers[uid].audioEl = audioEl;
      watchVolume(uid, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      // เชื่อมต่อล้มเหลว (มักเกิดจาก NAT/เครือข่ายมือถือ) - ล้างทิ้งเพื่อให้รอบ sync ถัดไป
      // (ตั้งเวลาไว้ทุก ๆ ไม่กี่วินาทีใน app.js) เชื่อมต่อใหม่ให้อัตโนมัติ
      if (['failed', 'closed'].includes(pc.connectionState)) {
        cleanupPeer(uid);
      }
    };
  }

  function watchVolume(uid, stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let releaseTimer = null;
      setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const p = peers[uid];
        if (!p) return;
        const loud = avg > 12;
        if (loud) {
          // กำลังพูดอยู่ (หรือพูดต่อ) - ยกเลิกตัวจับเวลาที่จะตัดสถานะทิ้ง
          if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
          if (!p.talking) { p.talking = true; onOnAirChange(getTalkingList()); }
        } else if (p.talking && !releaseTimer) {
          // เงียบไปชั่วขณะ (เช่น เว้นจังหวะพูด) - รอสักครู่ก่อนตัดสินว่าเลิกพูดแล้วจริง ๆ
          // กันไม่ให้ชื่อ/แถบคนพูดกระพริบถี่ ๆ ตามจังหวะเสียงพูด
          releaseTimer = setTimeout(() => {
            releaseTimer = null;
            const p2 = peers[uid];
            if (p2 && p2.talking) { p2.talking = false; onOnAirChange(getTalkingList()); }
          }, 700);
        }
      }, 200);
    } catch (e) {}
  }

  function getTalkingList() {
    return Object.keys(peers).filter(uid => peers[uid].talking);
  }

  async function syncOnlinePeers(onlineUids) {
    if (!localStream) return;
    const wanted = new Set(onlineUids.filter(u => u !== myUid));
    // ปิดการเชื่อมต่อกับคนที่ออฟไลน์ไปแล้ว
    for (const uid of Object.keys(peers)) {
      if (!wanted.has(uid)) cleanupPeer(uid);
    }
    // เปิดการเชื่อมต่อใหม่กับคนที่เพิ่งออนไลน์
    for (const uid of wanted) {
      if (peers[uid]) continue;
      if (myUid < uid) await createPeerAsCaller(uid);
      else await createPeerAsCallee(uid);
    }
  }

  async function start(gid, uid, onlineUidsCb) {
    groupId = gid; myUid = uid;
    await ensureLocalStream();
  }

  function stop() {
    Object.keys(peers).forEach(cleanupPeer);
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    groupId = null;
  }

  // target: 'all' หรือ uid ของคนที่ต้องการวิทยุหา
  function pttDown(target) {
    Object.entries(peers).forEach(([uid, p]) => {
      if (target === 'all' || uid === target) p.sendTrack.enabled = true;
    });
  }
  function pttUp() {
    Object.values(peers).forEach(p => { p.sendTrack.enabled = false; });
  }

  function onTalking(cb) { onOnAirChange = cb; }
  function getPeerCount() { return Object.keys(peers).length; }

  return { start, stop, syncOnlinePeers, pttDown, pttUp, onTalking, getPeerCount };
})();
