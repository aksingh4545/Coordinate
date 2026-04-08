import { useState, useEffect, useRef } from "react";
import { useMap } from "../context/MapContext";

export default function CallModal({ isOpen, onClose, members, currentUserId }) {
  const { socket } = useMap();
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callType, setCallType] = useState("audio"); // 'audio' or 'video'
  const [participants, setParticipants] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const peerConnectionsRef = useRef({});

  // Initialize WebRTC
  const createPeerConnection = (userId) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // Add local stream tracks
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({
        video: callType === "video" && !isVideoOff,
        audio: !isMuted,
      }).then((stream) => {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }).catch((err) => {
        console.error("Error accessing media devices:", err);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      if (remoteVideosRef.current[userId]) {
        remoteVideosRef.current[userId].srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("call:ice-candidate", {
          targetUserId: userId,
          candidate: event.candidate,
        });
      }
    };

    return pc;
  };

  // Start a call
  const startCall = (type = "audio") => {
    setCallType(type);
    setIsInCall(true);
    
    // Notify other members about the call
    socket?.emit("call:start", {
      type,
      members: members.filter((m) => m.userId !== currentUserId).map((m) => m.userId),
    });

    // Create peer connections for all members
    members.forEach((member) => {
      if (member.userId !== currentUserId) {
        const pc = createPeerConnection(member.userId);
        peerConnectionsRef.current[member.userId] = pc;

        // Create and send offer
        pc.createOffer().then((offer) => {
          pc.setLocalDescription(offer);
          socket?.emit("call:offer", {
            targetUserId: member.userId,
            offer,
          });
        });

        setParticipants((prev) => [
          ...prev,
          { userId: member.userId, name: member.name, joined: false },
        ]);
      }
    });
  };

  // End call
  const endCall = () => {
    // Close all peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current = {};

    // Stop local media tracks
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => {
        track.stop();
      });
    }

    socket?.emit("call:end");
    setIsInCall(false);
    setParticipants([]);
    onClose();
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  };

  // Toggle video
  const toggleVideo = () => {
    setIsVideoOff(!isVideoOff);
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getVideoTracks().forEach((track) => {
        track.enabled = !isVideoOff;
      });
    }
  };

  // Send chat message
  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const message = {
      id: Date.now(),
      userId: currentUserId,
      text: newMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, message]);
    socket?.emit("call:chat-message", { message });
    setNewMessage("");
  };

  // Handle socket events
  useEffect(() => {
    if (!socket || !isOpen) return;

    socket.on("call:incoming", ({ fromUserId, type }) => {
      // Show incoming call notification
      const caller = members.find((m) => m.userId === fromUserId);
      if (window.confirm(`${caller?.name} is calling you. Accept?`)) {
        socket.emit("call:accept", { fromUserId });
        const pc = createPeerConnection(fromUserId);
        peerConnectionsRef.current[fromUserId] = pc;
        setIsInCall(true);
        setCallType(type);
      }
    });

    socket.on("call:offer", async ({ fromUserId, offer }) => {
      const pc = peerConnectionsRef.current[fromUserId] || createPeerConnection(fromUserId);
      peerConnectionsRef.current[fromUserId] = pc;
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit("call:answer", {
        targetUserId: fromUserId,
        answer,
      });
    });

    socket.on("call:answer", async ({ fromUserId, answer }) => {
      const pc = peerConnectionsRef.current[fromUserId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("call:ice-candidate", async ({ fromUserId, candidate }) => {
      const pc = peerConnectionsRef.current[fromUserId];
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on("call:chat-message", ({ message }) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on("call:ended", () => {
      endCall();
    });

    return () => {
      socket.off("call:incoming");
      socket.off("call:offer");
      socket.off("call:answer");
      socket.off("call:ice-candidate");
      socket.off("call:chat-message");
      socket.off("call:ended");
    };
  }, [socket, isOpen, members, currentUserId]);

  if (!isOpen) return null;

  return (
    <div className="call-modal-backdrop" onClick={onClose}>
      <div className="call-modal-content" onClick={(e) => e.stopPropagation()}>
        {!isInCall ? (
          // Call start screen
          <div className="call-start-screen">
            <h2>Start a Call</h2>
            <p>Connect with group members</p>
            
            <div className="call-type-buttons">
              <button
                className="call-btn-start audio"
                onClick={() => startCall("audio")}
              >
                <span className="icon">📞</span>
                <span>Audio Call</span>
              </button>
              
              <button
                className="call-btn-start video"
                onClick={() => startCall("video")}
              >
                <span className="icon">📹</span>
                <span>Video Call</span>
              </button>
            </div>

            <div className="call-participants-preview">
              <h3>Participants ({members.length})</h3>
              <div className="participants-list">
                {members.map((member) => (
                  <div key={member.userId} className="participant-item">
                    <div className="participant-avatar">
                      {member.isHost ? "🎯" : "👤"}
                    </div>
                    <span>{member.name}</span>
                    {member.isHost && <span className="host-badge">Host</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Active call screen
          <div className="call-active-screen">
            <div className="call-header">
              <h3>📍 Group Call</h3>
              <div className="call-timer">00:00</div>
            </div>

            <div className="call-body">
              {/* Video grid */}
              <div className="video-grid">
                {/* Local video */}
                <div className="video-item local">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={isVideoOff ? "video-off" : ""}
                  />
                  <div className="video-label">You</div>
                  {isMuted && <div className="mute-indicator">🔇</div>}
                </div>

                {/* Remote videos */}
                {participants.map((participant) => (
                  <div key={participant.userId} className="video-item remote">
                    <video
                      ref={(el) => {
                        if (el) remoteVideosRef.current[participant.userId] = el;
                      }}
                      autoPlay
                      playsInline
                    />
                    <div className="video-label">{participant.name}</div>
                  </div>
                ))}
              </div>

              {/* Chat box */}
              {chatOpen && (
                <div className="call-chat-box">
                  <div className="chat-header">
                    <h4>Chat</h4>
                    <button onClick={() => setChatOpen(false)}>✕</button>
                  </div>
                  <div className="chat-messages">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`chat-message ${
                          msg.userId === currentUserId ? "own" : "other"
                        }`}
                      >
                        <div className="chat-message-text">{msg.text}</div>
                        <div className="chat-message-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <form className="chat-input-form" onSubmit={sendMessage}>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                    />
                    <button type="submit">Send</button>
                  </form>
                </div>
              )}
            </div>

            <div className="call-controls">
              <button
                className={`control-btn ${isMuted ? "active" : ""}`}
                onClick={toggleMute}
              >
                {isMuted ? "🔇" : "🎤"}
              </button>
              
              {callType === "video" && (
                <button
                  className={`control-btn ${isVideoOff ? "active" : ""}`}
                  onClick={toggleVideo}
                >
                  {isVideoOff ? "📹" : "📷"}
                </button>
              )}
              
              <button
                className="control-btn chat"
                onClick={() => setChatOpen(!chatOpen)}
              >
                💬
              </button>
              
              <button className="control-btn end" onClick={endCall}>
                📞
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
