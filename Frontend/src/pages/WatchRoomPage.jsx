import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import MapView from "../components/MapView";
import { useMap } from "../context/useMap";
import "./MemberRoomPage.css";

export default function WatchRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
  const {
    currentRoom,
    locations,
    roomSettings,
    joinRoom,
  } = useMap();

  const [watcherName, setWatcherName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
    const fetchRoomInfo = async () => {
      try {
        const response = await fetch(`${API_URL}/api/rooms/${roomId.toUpperCase()}`);
        const data = await response.json();
        if (data.success) {
          setRoomInfo(data.room);
        }
      } catch (err) {
        console.error("Failed to fetch room info:", err);
      }
    };
    fetchRoomInfo();
  }, [roomId]);

  const handleJoinAsWatcher = async (e) => {
    e.preventDefault();
    if (!watcherName.trim()) return;

    setIsJoining(true);
    try {
      await joinRoom(roomId.toUpperCase(), watcherName.trim(), "watcher");
    } catch (err) {
      alert(err.message || "Failed to join as watcher");
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveRoom = () => {
    if (window.confirm("Are you sure you want to stop watching?")) {
      navigate("/");
    }
  };

  if (!currentRoom) {
    return (
      <div className="home-page">
        <div className="earth-bg"></div>

        <header className="top-glass-bar">
          <div className="brand-small">Coordinator</div>
          <div className="tagline-top">Watch a trip in real-time</div>
        </header>

        <div className="watch-join-container">
          <div className="watch-join-card">
            <div className="watch-join-icon">
              <Eye size={46} strokeWidth={2.2} />
            </div>
            <h2 className="watch-join-title">Watch Trip</h2>
            <p className="watch-join-subtitle">
              {roomInfo ? `Watching ${roomInfo.hostName}'s trip` : "Join to watch host's location"}
            </p>

            <form onSubmit={handleJoinAsWatcher} className="watch-join-form">
              <div className="input-group">
                <label>Your Name</label>
                <input
                  type="text"
                  value={watcherName}
                  onChange={(e) => setWatcherName(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>
              <button
                type="submit"
                className="modal-btn primary"
                disabled={isJoining}
              >
                {isJoining ? "Joining..." : "Join as Watcher"}
              </button>
            </form>

            <div className="watch-join-info">
              <p>As a watcher, you will see the host's location on the map but your location will not be shared.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room-page">
      <div className="room-earth-bg"></div>
      <div className="room-shell">
        <div className={`room-topbar ${isMobile ? "mobile-compact" : ""}`}>
          {isMobile ? (
            <>
              <div className="mobile-top-left">
                <span className="room-id-display">{roomId}</span>
                <span className="member-count">WATCHING</span>
              </div>
              <div className="mobile-top-right">
                <button className="options-fab" onClick={handleLeaveRoom} aria-label="Stop watching">
                  <X size={16} strokeWidth={2.4} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="room-topbar-left">
                <span>Watching: {currentRoom?.hostName || "Trip"}</span>
                <span className="room-mode-pill watch-mode-pill">
                  Watch Mode
                </span>
              </div>

              <div className="room-topbar-right">
                <button className="soft-pill-btn leave" onClick={handleLeaveRoom}>
                  EXIT
                </button>
              </div>
            </>
          )}
        </div>

        {!isMobile && (
          <div className="watch-info-banner">
            <div className="watch-info-icon">
              <Eye size={24} strokeWidth={2.3} />
            </div>
            <div className="watch-info-text">
              <span className="watch-info-title">Watching {currentRoom?.hostName || "Host"}'s Location</span>
              <span className="watch-info-subtitle">You are in watch-only mode. Your location is not shared.</span>
            </div>
          </div>
        )}

        {isMobile && (
          <div className="mobile-watch-info">
            <span>Watching {currentRoom?.hostName || "Host"}'s trip</span>
          </div>
        )}

        <div className="room-map-wrap">
          <MapView
            locations={locations}
            currentUserId={null}
            showLines={false}
            centerOnUsers={true}
            targetLocation={roomSettings?.targetLocation}
            roomSettings={roomSettings}
          />
        </div>
      </div>
    </div>
  );
}
