import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import AuthMenu from "../components/AuthMenu";

export default function JoinRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { joinRoom, currentRoom, isLoading, error } = useMap();
  const [memberName, setMemberName] = useState("");
  const [roomInfo, setRoomInfo] = useState(null);
  const [localError, setLocalError] = useState("");
  const normalizedRoomId = (roomId || "").toUpperCase();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Fetch room info on mount
  useEffect(() => {
    if (roomId && roomId !== normalizedRoomId) {
      navigate(`/join/${normalizedRoomId}`, { replace: true });
      return;
    }

    const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
    const fetchRoomInfo = async () => {
      try {
        const response = await fetch(`${API_URL}/api/rooms/${normalizedRoomId}`);
        const data = await response.json();
        if (data.success) {
          setRoomInfo(data.room);
        } else {
          setLocalError(data.error || "Room not found");
        }
      } catch (err) {
        setLocalError("Failed to fetch room information");
      }
    };

    fetchRoomInfo();
  }, [roomId, normalizedRoomId, navigate]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!memberName.trim()) {
      setLocalError("Please enter your name");
      return;
    }

    try {
      await joinRoom(normalizedRoomId, memberName.trim());
      navigate(`/room/${normalizedRoomId}`);
    } catch (err) {
      setLocalError(err.message || "Failed to join room");
    }
  };

  return (
    <div className="home-page">
      <div className="earth-bg"></div>
      
      <header className="top-glass-bar">
        <div className="brand-small">Coordinator</div>
        <div className="tagline-top">Find your group in crowded places</div>
        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="menu-icon"
            onClick={() => setShowMenu((prev) => !prev)}
            aria-label="Open account menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          {showMenu && <AuthMenu />}
        </div>
      </header>

      <main className="home-content">
        <div className="custom-modal" style={{ maxWidth: '420px' }}>
          <div className="modal-head">
            <div className="modal-icon">👥</div>
            <h2>Join Group</h2>
            {roomInfo && (
              <p>
                Host: <span style={{ fontWeight: '600' }}>{roomInfo.hostName}</span>
              </p>
            )}
            <div style={{ 
              marginTop: '12px', 
              padding: '8px 16px', 
              background: 'rgba(139, 92, 246, 0.2)', 
              borderRadius: '12px',
              display: 'inline-block'
            }}>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>Group Code</p>
              <p style={{ fontSize: '1.5rem', fontFamily: 'monospace', fontWeight: '700', color: '#8b5cf6' }}>{normalizedRoomId}</p>
            </div>
          </div>

          <form onSubmit={handleJoin}>
            <div className="input-group">
              <label>Your Name</label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Enter your name"
                autoFocus
              />
            </div>

            {(localError || error) && (
              <div className="home-error" style={{ marginBottom: '16px' }}>
                {localError || error}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="modal-btn secondary"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="modal-btn primary"
              >
                {isLoading ? "Joining..." : "Join Group"}
              </button>
            </div>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            <p>📍 Your location will be shared with the group</p>
          </div>
        </div>
      </main>
    </div>
  );
}
