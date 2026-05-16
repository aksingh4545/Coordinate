import { useState, useEffect, useRef } from "react";
import { useMap } from "../context/MapContext";
import "./LiveChat.css";

export default function LiveChat({ roomId, members, currentUserId, onClose }) {
  const { socket, currentRoom } = useMap();
  const [isTalking, setIsTalking] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const normalizedRoomId = (currentRoom?.roomId || roomId || "").toUpperCase();
  const mediaStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteAudioRef = useRef(new Map());
  const touchStartYRef = useRef(null);

  const currentUserName = members.find(m => m.userId === currentUserId)?.name || "You";

  const createPeerConnection = (remoteUserId, isSender) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("walkie:ice", {
          toUserId: remoteUserId,
          fromUserId: currentUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      let audioEl = remoteAudioRef.current.get(remoteUserId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        remoteAudioRef.current.set(remoteUserId, audioEl);
      }
      if (event.streams && event.streams[0]) {
        audioEl.srcObject = event.streams[0];
        audioEl.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        cleanupPeer(remoteUserId);
      }
    };

    if (isSender && mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, mediaStreamRef.current);
      });
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  };

  const cleanupPeer = (remoteUserId) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(remoteUserId);
    }
    const audioEl = remoteAudioRef.current.get(remoteUserId);
    if (audioEl) {
      audioEl.srcObject = null;
      remoteAudioRef.current.delete(remoteUserId);
    }
  };

  useEffect(() => {
    if (!socket || !normalizedRoomId) return;

    socket.on("walkie:Speaking", (data) => {
      setActiveSpeaker(data.userId);
    });

    socket.on("walkie:Stopped", () => {
      setActiveSpeaker(null);
    });

    socket.on("walkie:offer", async ({ fromUserId, sdp }) => {
      try {
        let pc = peerConnectionsRef.current.get(fromUserId);
        if (!pc) {
          pc = createPeerConnection(fromUserId, false);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("walkie:answer", {
          toUserId: fromUserId,
          fromUserId: currentUserId,
          sdp: answer,
        });
      } catch (err) {
        console.error("Walkie offer error:", err);
      }
    });

    socket.on("walkie:answer", async ({ fromUserId, sdp }) => {
      try {
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error("Walkie answer error:", err);
      }
    });

    socket.on("walkie:ice", async ({ fromUserId, candidate }) => {
      try {
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (!pc || !candidate) return;
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Walkie ICE error:", err);
      }
    });

    return () => {
      socket.off("walkie:Speaking");
      socket.off("walkie:Stopped");
      socket.off("walkie:offer");
      socket.off("walkie:answer");
      socket.off("walkie:ice");
    };
  }, [socket, normalizedRoomId, currentUserId]);

  const startTalking = async () => {
    try {
      if (!socket || !normalizedRoomId) {
        console.warn("Walkie talkie unavailable: socket or room missing");
        return;
      }

      if (!currentUserId) {
        console.warn("Walkie talkie unavailable: user missing");
        return;
      }

      socket.emit("user:join", {
        userId: currentUserId,
        roomId: normalizedRoomId,
      });

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      
      mediaStreamRef.current = stream;

      socket.emit("walkie:start", {
        roomId: normalizedRoomId,
        userId: currentUserId,
        userName: currentUserName
      });

      const targets = (members || []).filter((m) => m.userId && m.userId !== currentUserId);
      for (const member of targets) {
        const remoteUserId = member.userId;
        let pc = peerConnectionsRef.current.get(remoteUserId);
        if (!pc) {
          pc = createPeerConnection(remoteUserId, true);
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("walkie:offer", {
          toUserId: remoteUserId,
          fromUserId: currentUserId,
          sdp: offer,
        });
      }

      setIsTalking(true);
      monitorVoiceActivity();
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const monitorVoiceActivity = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const checkAudioLevel = () => {
      if (!mediaStreamRef.current) return;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      
      if (average < 10) {
        if (!window.silenceCount) window.silenceCount = 0;
        window.silenceCount++;
        if (window.silenceCount > 5) {
          stopTalking();
          return;
        }
      } else {
        window.silenceCount = 0;
      }

      if (isTalking && mediaStreamRef.current) {
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      }
    };

    checkAudioLevel();
  };

  const stopTalking = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach((_, remoteUserId) => {
      cleanupPeer(remoteUserId);
    });

    window.silenceCount = 0;

    if (socket) {
      socket.emit("walkie:stop", {
        roomId: normalizedRoomId,
        userId: currentUserId
      });
    }

    setIsTalking(false);
    setActiveSpeaker(null);
  };

  useEffect(() => {
    const handleMouseUp = () => {
      if (isTalking) stopTalking();
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isTalking]);

  useEffect(() => {
    return () => stopTalking();
  }, []);

  return (
    <div className="walkie-fab-container">
      {activeSpeaker && (
        <div className="walkie-speaking-badge">
          {activeSpeaker === currentUserId ? "You" : members.find(m => m.userId === activeSpeaker)?.name} is talking...
        </div>
      )}
      
      <button
        className={`ptt-button-fab ${isTalking ? "active" : ""}`}
        onMouseDown={startTalking}
        onMouseUp={stopTalking}
        onTouchStart={(e) => { e.preventDefault(); startTalking(); }}
        onTouchEnd={(e) => { e.preventDefault(); stopTalking(); }}
      >
        <div className="ptt-icon-fab">
          {isTalking ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="mic-active-fab">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
            </svg>
          )}
        </div>
        <span className="ptt-label-fab">
          {isTalking ? "Release" : "Hold to talk"}
        </span>
        {isTalking && <div className="ptt-waves-fab"><span></span><span></span><span></span></div>}
      </button>
    </div>
  );
}