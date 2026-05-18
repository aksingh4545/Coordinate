import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import CoordinatorLogo from "../assets/CoordinatorLogo";
import AuthMenu from "../components/AuthMenu";
import MapView from "../components/MapView";
import { getAuthUser, isAuthTokenExpired, clearAuthUser } from "../utils/authStorage";

const normalizeTripPath = (path) => {
  if (!path || !Array.isArray(path)) return null;
  return path.map(p => ({
    lat: p.lat ?? p.latitude ?? p.location?.lat ?? 0,
    lng: p.lng ?? p.longitude ?? p.location?.lng ?? 0,
  }));
};

const formatLocation = (location) => {
  if (!location) return "N/A";
  if (typeof location === "string") return location;
  if (location.name) return location.name;
  const lat = location.lat ?? location.latitude;
  const lng = location.lng ?? location.longitude;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  return "N/A";
};

export default function HomePage() {
  const navigate = useNavigate();
  const { createRoom, joinRoom, isLoading, error } = useMap();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [hostName, setHostName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [localError, setLocalError] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const [roomMode, setRoomMode] = useState("crowd");
  const [savedTripPath, setSavedTripPath] = useState(null);
  const [selectedSavedTrip, setSelectedSavedTrip] = useState(null);
  const mapRef = useRef(null);

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

  useEffect(() => {
    const handleShowSavedTrip = (event) => {
      const trip = event.detail;
      const normalized = normalizeTripPath(trip?.path);
      if (normalized && normalized.length >= 2) {
        setSavedTripPath(normalized);
        setSelectedSavedTrip(trip);
        setTimeout(() => {
          if (mapRef.current?.getMap) {
            const bounds = normalized.map(p => [p.lat, p.lng]);
            mapRef.current.getMap().fitBounds(bounds, { padding: [50, 50] });
          }
        }, 100);
      }
    };
    window.addEventListener('showSavedTrip', handleShowSavedTrip);
    return () => window.removeEventListener('showSavedTrip', handleShowSavedTrip);
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!hostName.trim()) {
      setLocalError("Please enter your name");
      return;
    }

    try {
      const data = await createRoom(hostName.trim(), roomMode);
      navigate(`/host/${data.roomId}`);
    } catch (err) {
      setLocalError(err.message || "Failed to create room");
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomId.trim() || !memberName.trim()) {
      setLocalError("Please fill in all fields");
      return;
    }

    try {
      await joinRoom(roomId.trim().toUpperCase(), memberName.trim());
      navigate(`/room/${roomId.trim().toUpperCase()}`);
    } catch (err) {
      setLocalError(err.message || "Failed to join room");
    }
  };

  return (
    <div className="home-page">
      {savedTripPath && (
        <div className="saved-trip-overlay">
          <div className="saved-trip-header">
            <div className="saved-trip-title">{selectedSavedTrip?.tripName || "Saved Trip"}</div>
            <button className="saved-trip-close" onClick={() => { setSavedTripPath(null); setSelectedSavedTrip(null); }}>×</button>
          </div>
          <div className="saved-trip-map">
            <MapView
              ref={mapRef}
              locations={[]}
              currentUserId={null}
              centerOnUsers={false}
              savedTripPath={savedTripPath}
            />
          </div>
          <div className="saved-trip-info">
            <div className="saved-trip-detail">
              <span className="label">From:</span>
              <span>{formatLocation(selectedSavedTrip?.startLocation)}</span>
            </div>
            <div className="saved-trip-detail">
              <span className="label">To:</span>
              <span>{formatLocation(selectedSavedTrip?.endLocation)}</span>
            </div>
            {selectedSavedTrip?.createdAt && (
              <div className="saved-trip-detail">
                <span className="label">Saved:</span>
                <span>{new Date(selectedSavedTrip.createdAt).toLocaleString()}</span>
              </div>
            )}
          </div>
          <div className="saved-trip-actions">
            <button className="modal-btn secondary" onClick={() => { setSavedTripPath(null); setSelectedSavedTrip(null); }}>Close</button>
          </div>
        </div>
      )}
      {/* scrolling world map background */}
      <div className="earth-bg"></div>

      {/* top bar */}
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

      {/* center content */}
      <main className="home-content">
        <div className="hero-logo">
          <CoordinatorLogo />
        </div>

        <h1 className="hero-title">Coordinator</h1>
        <p className="hero-subtitle">
          Find your group in crowded places
        </p>

        <div className="hero-actions">
          <button
            onClick={() => setShowJoinModal(true)}
            className="action-card join-card"
          >
            <div className="action-icon">👥</div>
            <div className="action-label">Join Room</div>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="action-card create-card"
          >
            <div className="action-icon">＋</div>
            <div className="action-label">Create Room</div>
          </button>
        </div>

        <p className="hero-footer">
          Live location, smart coordination, and a better way to stay connected
        </p>

        {(error || localError) && (
          <div className="home-error">
            {localError || error}
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="modal-backdrop-custom">
          <div className="custom-modal">
            <div className="modal-head">
              <div className="modal-icon">＋</div>
              <h2>Create Room</h2>
              <p>Start a room and invite your group</p>
            </div>

            <form onSubmit={handleCreateRoom}>
              <div className="input-group">
                <label>Your Name</label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                />
              </div>

              <div className="input-group">
                <label>Mode</label>
                <select
                  value={roomMode}
                  onChange={(e) => setRoomMode(e.target.value)}
                >
                  <option value="crowd">Crowd</option>
                  <option value="tracking">Tracking</option>
                  <option value="trip">Trip</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    setLocalError("");
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="modal-btn primary"
                >
                  {isLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="modal-backdrop-custom">
          <div className="custom-modal">
            <div className="modal-head">
              <div className="modal-icon">👥</div>
              <h2>Join Room</h2>
              <p>Enter room details to join your group</p>
            </div>

            <form onSubmit={handleJoinRoom}>
              <div className="input-group">
                <label>Room ID</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  autoFocus
                />
              </div>

              <div className="input-group">
                <label>Your Name</label>
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn secondary"
                  onClick={() => {
                    setShowJoinModal(false);
                    setLocalError("");
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="modal-btn primary"
                >
                  {isLoading ? "Joining..." : "Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}