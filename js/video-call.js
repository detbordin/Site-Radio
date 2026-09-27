// วิดีโอคอลหาบุคคล (1:1) พร้อมสลับกล้องหน้า/หลัง
const VideoCall = (() => {
  let groupId = null, myUid = null, myName = null;
  let pc = null, localStream = null, sessionId = null, peerUid = null;
  let facingMode = 'user';
  let ringRef = null, rtcBase = null;
  let listeners = [];
  let ui = {
    onIncoming: () => {}, onAccepted: () => {}, onEnded: () => {}, onRemoteStream: () => {}, onLocalStream: () => {}
  };

  function randomId() { return Math.random().toString(36).slice(2, 10); }

  function setUiHandlers(h) { ui = { ...ui, ...h }; }

  function listenForIncoming(gid, uid) {
    groupId = gid; myUid = uid;
    ringRef = rtdb.ref(`calls/${groupId}/${myUid}`);
    const handler = (snap) => {
      const val = snap.val();
      if (val && val.status === 'ringing' && val.sessionId !== sessionId) {
        ui.onIncoming(val); // { from, fromName, sessionId }
      }
      if (val && val.status === 'ended' && sessionId && val.sessionId === sessionId) {
        teardown();
        ui.onEnded();
      }
    };
    ringRef.on('value', handler);
    listeners.push(() => ringRef.off('value', handler));
  }

  function stopListening() {
    listeners.forEach(off => off());
    listeners = [];
  }

  async function getCamStream() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode }
    });
    return stream;
  }

  function buildPc(remoteUid) {
    const p = new RTCPeerConnection(RTC_CONFIG);
    p.ontrack = (e) => ui.onRemoteStream(e.streams[0]);
    return p;
  }

  async function startCall(gid, uid, calleeUid, calleeName) {
    groupId = gid; myUid = uid; peerUid = calleeUid;
    sessionId = randomId();
    localStream = await getCamStream();
    ui.onLocalStream(localStream);

    await rtdb.ref(`calls/${groupId}/${calleeUid}`).set({
      from: myUid, fromName: myName, sessionId, status: 'ringing', ts: Date.now()
    });

    const callStatusRef = rtdb.ref(`calls/${groupId}/${calleeUid}`);
    const handler = async (snap) => {
      const val = snap.val();
      if (!val || val.sessionId !== sessionId) return;
      if (val.status === 'accepted' && !pc) {
        await doOffer(calleeUid);
      } else if (val.status === 'declined' || val.status === 'ended') {
        teardown();
        ui.onEnded('declined');
      }
    };
    callStatusRef.on('value', handler);
    listeners.push(() => callStatusRef.off('value', handler));
  }

  async function doOffer(remoteUid) {
    pc = buildPc(remoteUid);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    rtcBase = rtdb.ref(`rtc/${groupId}/video/${sessionId}`);
    await rtcBase.remove();

    pc.onicecandidate = (e) => {
      if (e.candidate) rtcBase.child(`candidates/${myUid}`).push(e.candidate.toJSON());
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await rtcBase.child('offer').set({ sdp: offer.sdp, type: offer.type });

    const ansHandler = rtcBase.child('answer').on('value', async (snap) => {
      const val = snap.val();
      if (val && pc && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(val));
      }
    });
    const candHandler = rtcBase.child(`candidates/${remoteUid}`).on('child_added', (snap) => {
      pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => {});
    });
    listeners.push(
      () => rtcBase.child('answer').off('value', ansHandler),
      () => rtcBase.child(`candidates/${remoteUid}`).off('child_added', candHandler)
    );
  }

  async function acceptCall(incoming) {
    peerUid = incoming.from;
    sessionId = incoming.sessionId;
    localStream = await getCamStream();
    ui.onLocalStream(localStream);

    await rtdb.ref(`calls/${groupId}/${myUid}`).update({ status: 'accepted' });

    pc = buildPc(peerUid);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    rtcBase = rtdb.ref(`rtc/${groupId}/video/${sessionId}`);

    pc.onicecandidate = (e) => {
      if (e.candidate) rtcBase.child(`candidates/${myUid}`).push(e.candidate.toJSON());
    };

    const offerSnap = await rtcBase.child('offer').get();
    if (offerSnap.exists()) {
      await pc.setRemoteDescription(new RTCSessionDescription(offerSnap.val()));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await rtcBase.child('answer').set({ sdp: answer.sdp, type: answer.type });
    }
    const candHandler = rtcBase.child(`candidates/${peerUid}`).on('child_added', (snap) => {
      pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => {});
    });
    listeners.push(() => rtcBase.child(`candidates/${peerUid}`).off('child_added', candHandler));
  }

  async function declineCall(incoming) {
    await rtdb.ref(`calls/${groupId}/${myUid}`).update({ status: 'declined' });
  }

  async function switchCamera() {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    const newTrack = newStream.getVideoTracks()[0];
    if (pc) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
    }
    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) { localStream.removeTrack(oldTrack); oldTrack.stop(); }
    localStream.addTrack(newTrack);
    ui.onLocalStream(localStream);
  }

  async function hangUp() {
    const gid = groupId, uid = myUid, otherUid = peerUid, sid = sessionId;
    teardown();
    if (gid && otherUid) {
      try { await rtdb.ref(`calls/${gid}/${otherUid}`).update({ status: 'ended', sessionId: sid }); } catch (e) {}
      try { await rtdb.ref(`calls/${gid}/${uid}`).remove(); } catch (e) {}
      try { await rtdb.ref(`rtc/${gid}/video/${sid}`).remove(); } catch (e) {}
    }
  }

  function teardown() {
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    peerUid = null; sessionId = null; rtcBase = null;
  }

  function setMyName(n) { myName = n; }

  return {
    listenForIncoming, stopListening, startCall, acceptCall, declineCall,
    switchCamera, hangUp, setUiHandlers, setMyName
  };
})();
