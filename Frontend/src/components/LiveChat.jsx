import { useState, useEffect, useRef } from "react";
import { useMap } from "../context/MapContext";
import "./LiveChat.css";

export default function LiveChat({ roomId, members, currentUserId, onClose }) {
  const { socket } = useMap();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showMembers, setShowMembers] = useState(true);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
  const [isExpanded, setIsExpanded] = useState(!isMobile);
  const [floatingMessages, setFloatingMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const touchStartYRef = useRef(null);
  const floatingTimeoutsRef = useRef(new Map());

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Request chat history on mount
  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit("chat:history", { roomId }, (response) => {
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
  }, [socket, roomId]);

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

    if (isMobile && newMessages.length > 0) {
      const newFloating = newMessages.map((msg, index) => ({
        ...msg,
        _floatId: msg.id || `${Date.now()}-${index}`,
      }));

      setFloatingMessages((prev) => [...prev, ...newFloating].slice(-5));

      newFloating.forEach((msg) => {
        if (floatingTimeoutsRef.current.has(msg._floatId)) return;
        const timeoutId = setTimeout(() => {
          setFloatingMessages((prev) => prev.filter((item) => item._floatId !== msg._floatId));
          floatingTimeoutsRef.current.delete(msg._floatId);
        }, 4800);
        floatingTimeoutsRef.current.set(msg._floatId, timeoutId);
      });
    }

    prevMessageCountRef.current = messages.length;
  }, [messages, currentUserId]);

  useEffect(() => {
    return () => {
      floatingTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      floatingTimeoutsRef.current.clear();
    };
  }, []);

  // Send text message
  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !roomId || !currentUserId) return;

    const message = {
      text: newMessage.trim(),
    };

    socket.emit("chat:message", { 
      roomId, 
      message,
      userId: currentUserId,
      userName: currentUserName,
    });
    setNewMessage("");
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          socket.emit("chat:voice", {
            roomId,
            audioBlob: base64Audio,
            duration: recordingTime,
            userId: currentUserId,
            userName: currentUserName,
          });
        };

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Unable to access microphone. Please enable permissions.");
    }
  };

  // Stop voice recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  // Play voice message
  const playVoiceMessage = (audioUrl) => {
    const audio = new Audio(audioUrl);
    audio.play();
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

  const getAuthorColor = (name = "") => {
    const colors = ["#f472b6", "#a855f7", "#3b82f6", "#22c55e"];
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash * 31 + name.charCodeAt(i)) % 997;
    }
    return colors[hash % colors.length];
  };

  if (isMobile) {
    return (
      <div className="live-chat-container mobile-overlay">
        <div className="chat-floating-messages">
          {floatingMessages.map((msg, index) => (
            <div
              key={msg._floatId || msg.id}
              className="chat-float-bubble"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <span
                className="chat-floating-author"
                style={{ color: getAuthorColor(msg.userName || "") }}
              >
                {msg.userName || "Unknown"}:
              </span>{" "}
              {msg.type === "voice" ? "Voice message" : msg.text}
            </div>
          ))}
        </div>

        <form className="chat-input-bar" onSubmit={sendTextMessage}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="hi guys"
            className="chat-input-field"
          />
          <button
            type="button"
            className="chat-mic-btn"
            onClick={isRecording ? stopRecording : startRecording}
          >
            🎤
          </button>
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!newMessage.trim()}
          >
            ➤
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className={`live-chat-container bottom-sheet ${isExpanded ? "is-expanded" : "is-collapsed"}`}
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






