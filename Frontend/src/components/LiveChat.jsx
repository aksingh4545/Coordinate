import { useState, useEffect, useRef } from "react";
import { useMap } from "../context/MapContext";
import "./LiveChat.css";

export default function LiveChat({ roomId, members, currentUserId, onClose }) {
  const { socket } = useMap();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const MAX_RECORDING_SECONDS = 20;
  const [showMembers, setShowMembers] = useState(true);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
  const [isExpanded, setIsExpanded] = useState(!isMobile);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingStartRef = useRef(null);
  const recordingTimeRef = useRef(0);
  const prevMessageCountRef = useRef(0);
  const touchStartYRef = useRef(null);
  const normalizedRoomId = (roomId || "").toUpperCase();
  const pendingVoiceQueueRef = useRef([]);
  const audioUnlockedRef = useRef(false);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Request chat history on mount
  useEffect(() => {
    if (!socket || !normalizedRoomId) return;

    if (currentUserId) {
      socket.emit("user:join", { userId: currentUserId, roomId: normalizedRoomId });
    }

    socket.emit("chat:history", { roomId: normalizedRoomId }, (response) => {
      if (response.success) {
        const historyMessages = response.messages || [];
        prevMessageCountRef.current = historyMessages.length;
        setMessages(historyMessages);
      }
    });

    // Listen for new messages
    socket.on("chat:message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on("chat:voice", (voiceMessage) => {
      setMessages((prev) => [...prev, voiceMessage]);
    });

    return () => {
      socket.off("chat:message");
      socket.off("chat:voice");
    };
  }, [socket, normalizedRoomId, currentUserId]);

  // Notification sound and auto-play for incoming messages
  useEffect(() => {
    if (messages.length <= prevMessageCountRef.current) return;

    const newMessages = messages.slice(prevMessageCountRef.current);
    const hasIncomingFromOthers = newMessages.some(
      (msg) => msg.userId && msg.userId !== currentUserId
    );

    if (hasIncomingFromOthers) {
      playPopSound();
    }

    newMessages.forEach((msg) => {
      if (msg.type === "voice") {
        const audioSource = msg.audioUrl || msg.audioBlob;
        if (audioSource) {
          playVoiceMessage(audioSource);
        }
      }
    });

    prevMessageCountRef.current = messages.length;
  }, [messages, currentUserId]);

  // Send text message
  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !normalizedRoomId || !currentUserId) return;

    const message = {
      text: newMessage.trim(),
    };

    const optimisticMessage = {
      id: `${Date.now()}-${currentUserId}`,
      userId: currentUserId,
      userName: currentUserName,
      text: message.text,
      type: "text",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    socket.emit("chat:message", { 
      roomId: normalizedRoomId, 
      message,
      userId: currentUserId,
      userName: currentUserName,
    });
    setNewMessage("");
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        alert("Voice recording is not supported in this browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const durationSeconds = recordingStartRef.current
          ? Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000))
          : Math.max(1, recordingTimeRef.current || 0);
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          const voiceMessage = {
            id: `${Date.now()}-${currentUserId}`,
            userId: currentUserId,
            userName: currentUserName,
            type: "voice",
            audioUrl: base64Audio,
            duration: durationSeconds,
            timestamp: Date.now(),
          };

          setMessages((prev) => [...prev, voiceMessage]);

          if (socket && normalizedRoomId && currentUserId) {
            socket.emit("chat:voice", {
              roomId: normalizedRoomId,
              audioBlob: base64Audio,
              duration: durationSeconds,
              userId: currentUserId,
              userName: currentUserName,
            });
          }
        };

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        
        setIsRecording(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        recordingStartRef.current = null;
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      recordingStartRef.current = Date.now();

      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const nextValue = prev + 1;
          recordingTimeRef.current = nextValue;
          if (nextValue >= MAX_RECORDING_SECONDS) {
            stopRecording();
          }
          return nextValue;
        });
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Unable to access microphone. Please enable permissions.");
    }
  };

  // Stop voice recording
  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  // Play voice message
  const playVoiceMessage = (audioUrl, { queueOnFail = true } = {}) => {
    const audio = new Audio(audioUrl);
    const playPromise = audio.play();
    if (playPromise && queueOnFail) {
      playPromise.catch(() => {
        pendingVoiceQueueRef.current.push(audioUrl);
      });
    }
  };

  const handleUserGesture = () => {
    if (!audioUnlockedRef.current) {
      audioUnlockedRef.current = true;
    }

    if (pendingVoiceQueueRef.current.length > 0) {
      const queued = [...pendingVoiceQueueRef.current];
      pendingVoiceQueueRef.current = [];
      queued.forEach((audioUrl) => playVoiceMessage(audioUrl, { queueOnFail: false }));
    }
  };

  const playPopSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gainNode.gain.setValueAtTime(0.12, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.15);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.15);

      oscillator.onended = () => {
        context.close();
      };
    } catch (err) {
      console.warn("Unable to play notification sound:", err);
    }
  };

  // Format recording time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const currentUserName = members.find(m => m.userId === currentUserId)?.name || "You";
  const lastMessage = messages[messages.length - 1];
  const lastMessagePreview = lastMessage
    ? lastMessage.type === "voice"
      ? `Voice message (${Math.round(lastMessage.duration)}s)`
      : lastMessage.text
    : "No messages yet";
  const lastMessageAuthor = lastMessage?.userId === currentUserId ? "You" : lastMessage?.userName;

  const handleTouchStart = (event) => {
    touchStartYRef.current = event.touches[0].clientY;
  };

  const handleTouchEnd = (event) => {
    if (touchStartYRef.current === null) return;
    const endY = event.changedTouches[0].clientY;
    const deltaY = endY - touchStartYRef.current;
    touchStartYRef.current = null;

    if (deltaY < -40) {
      setIsExpanded(true);
    } else if (deltaY > 40) {
      setIsExpanded(false);
    }
  };

  return (
    <div
      className={`live-chat-container bottom-sheet ${isExpanded ? "is-expanded" : "is-collapsed"}`}
      onClick={handleUserGesture}
      onTouchStart={handleUserGesture}
    >
      <div
        className="chat-sheet-header"
        onClick={() => !isExpanded && setIsExpanded(true)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="button"
        tabIndex={0}
      >
        <div className="chat-sheet-handle" />
        <div className="chat-sheet-title">
          <span className="chat-sheet-online">Online ({members.length})</span>
          <span className="chat-sheet-preview">
            {lastMessageAuthor ? `${lastMessageAuthor}: ` : ""}{lastMessagePreview}
          </span>
        </div>
        {isExpanded && (
          <button
            type="button"
            className="chat-sheet-close"
            onClick={() => setIsExpanded(false)}
            aria-label="Collapse chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Close Button */}
      {onClose && (
        <button className="close-chat-btn" onClick={onClose}>✕</button>
      )}

      {/* Members Panel - At top inside chat */}
      {isExpanded && showMembers && members.length > 0 && (
        <div className="members-panel">
          <h4 className="members-title">👥 Online ({members.length})</h4>
          <div className="members-list">
            {members.map((member) => (
              <div key={member.userId} className="member-item">
                <div className="member-avatar">
                  {member.isHost ? "🎯" : "👤"}
                </div>
                <div className="member-name-wrap">
                  <span className="member-name">{member.name}</span>
                  {member.distanceLabels && member.distanceLabels.length > 0 && (
                    <span className="member-distance">
                      {member.distanceLabels.join(" | ")}
                    </span>
                  )}
                </div>
                {member.isHost && <span className="member-badge">Host</span>}
                {member.userId === currentUserId && (
                  <span className="member-badge you">You</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Messages */}
      {isExpanded && (
        <div className="chat-messages-container" ref={messagesContainerRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <p>💬 Start the conversation!</p>
            </div>
          ) : (
            messages.slice(-3).map((msg) => (
              <div
                key={msg.id}
                className={`chat-message-bubble ${
                  msg.userId === currentUserId ? "own-message" : "other-message"
                }`}
              >
                <div className="message-header">
                  <span className="message-author">{msg.userName}</span>
                  <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
                </div>

                {msg.type === "text" ? (
                  <div className="message-text">{msg.text}</div>
                ) : msg.type === "voice" ? (
                  <div className="voice-message">
                    <button
                      className="play-voice-btn"
                      onClick={() => playVoiceMessage(msg.audioUrl || msg.audioBlob)}
                    >
                      🎵 Play Voice ({Math.round(msg.duration)}s)
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Chat Input - Fixed at bottom */}
      {isExpanded && (
        <div className="chat-input-container">
          <form onSubmit={sendTextMessage} className="text-input-form">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="chat-text-input"
            />
            <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
              📤
            </button>
          </form>

          <button
            className={`record-btn ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? (
              <>
                🔴 Recording ({formatTime(recordingTime)})
              </>
            ) : (
              <>🎤 Voice</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}






