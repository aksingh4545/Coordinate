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
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

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
        setMessages(response.messages);
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

  return (
    <div className="live-chat-container">
      {/* Close Button */}
      {onClose && (
        <button className="close-chat-btn" onClick={onClose}>✕</button>
      )}

      {/* Members Panel - At top inside chat */}
      {showMembers && members.length > 0 && (
        <div className="members-panel">
          <h4 className="members-title">👥 Online ({members.length})</h4>
          <div className="members-list">
            {members.map((member) => (
              <div key={member.userId} className="member-item">
                <div className="member-avatar">
                  {member.isHost ? "🎯" : "👤"}
                </div>
                <span className="member-name">{member.name}</span>
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
      <div className="chat-messages-container" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>💬 Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
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
                    onClick={() => playVoiceMessage(msg.audioUrl)}
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

      {/* Chat Input - Fixed at bottom */}
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
    </div>
  );
}
