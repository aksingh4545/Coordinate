import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import CoordinatorLogo from "../assets/CoordinatorLogo";
import AuthMenu from "../components/AuthMenu";
import MapView from "../components/MapView";
import { getAuthUser, isAuthTokenExpired, clearAuthUser } from "../utils/authStorage";
import { LocationSmoother } from "../utils/locationSmoother";

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

const EntryGlyph = ({ mode }) => {
  const isCreate = mode === "create";
  const gradientId = `entryGradient-${mode}`;

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="entry-glyph-svg">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isCreate ? "#60a5fa" : "#8b5cf6"} />
          <stop offset="100%" stopColor={isCreate ? "#22c55e" : "#ec4899"} />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="44" height="44" rx="16" fill={`url(#${gradientId})`} opacity="0.18" />
      <rect x="18" y="18" width="28" height="28" rx="10" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.5" />
      {isCreate ? (
        <>
          <path d="M32 22v20" stroke={`url(#${gradientId})`} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M22 32h20" stroke={`url(#${gradientId})`} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="20" cy="18" r="2" fill="#f9fafb" opacity="0.85" />
          <circle cx="45" cy="21" r="2" fill="#f9fafb" opacity="0.7" />
        </>
      ) : (
        <>
          <path d="M24 32h16" stroke={`url(#${gradientId})`} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M34 24l8 8-8 8" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 22h4v20h-4" fill={`url(#${gradientId})`} opacity="0.9" />
          <circle cx="46" cy="18" r="2" fill="#f9fafb" opacity="0.85" />
          <circle cx="18" cy="46" r="2" fill="#f9fafb" opacity="0.7" />
        </>
      )}
    </svg>
  );
};

const FlowTip = ({ title, text, tone }) => (
  <div className={`flow-tip ${tone}`}>
    <div className="flow-tip-title">{title}</div>
    <div className="flow-tip-text">{text}</div>
  </div>
);

export default function HomePage() {
  const navigate = useNavigate();
  const { createRoom, joinRoom, isLoading, error } = useMap();
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

  // Layout state & features (unified mobile & desktop view)
  const [activeHomePanel, setActiveHomePanel] = useState(null); // 'create', 'join', 'layers', or null
  const [mapStyle, setMapStyle] = useState("osm");
  const [userLocation, setUserLocation] = useState(null);
  const [hasCenteredMap, setHasCenteredMap] = useState(false);
  const locationSmootherRef = useRef(new LocationSmoother({ minAccuracy: 50 }));

  useEffect(() => {
    if (!navigator.geolocation) return;
    
    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const smoothed = locationSmootherRef.current.filter(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.coords.speed
        );
        setUserLocation(smoothed);
      },
      (err) => console.log("Initial geolocation error:", err),
      { enableHighAccuracy: true, timeout: 5000 }
    );

    // Watch position
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const smoothed = locationSmootherRef.current.filter(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.coords.speed
        );
        setUserLocation(smoothed);
      },
      (err) => console.log("Watch geolocation error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (userLocation && !hasCenteredMap && mapRef.current?.getMap) {
      mapRef.current.getMap().setView([userLocation.lat, userLocation.lng], 15);
      setHasCenteredMap(true);
    }
  }, [userLocation, hasCenteredMap]);

  // Prefill the user's name if logged in
  useEffect(() => {
    const auth = getAuthUser();
    if (auth?.name) {
      setHostName(auth.name);
      setMemberName(auth.name);
    }
  }, []);

  const handleLocateMe = () => {
    if (userLocation && mapRef.current?.getMap) {
      mapRef.current.getMap().setView([userLocation.lat, userLocation.lng], 15);
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const smoothed = locationSmootherRef.current.filter(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy,
            pos.coords.speed
          );
          setUserLocation(smoothed);
          if (mapRef.current?.getMap) {
            mapRef.current.getMap().setView([smoothed.lat, smoothed.lng], 15);
          }
        },
        (err) => console.log("Locate error:", err),
        { enableHighAccuracy: true }
      );
    }
  };

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tripId = params.get("tripId");
    if (!tripId) return;

    const fetchSharedTrip = async () => {
      try {
        const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
        console.log("Fetching shared trip:", tripId);
        const response = await fetch(`${API_URL}/api/trips/${tripId}`);
        const data = await response.json();
        
        if (data.success && data.trip) {
          const trip = data.trip;
          const normalized = normalizeTripPath(trip.path);
          if (normalized && normalized.length >= 2) {
            setSavedTripPath(normalized);
            setSelectedSavedTrip(trip);
            setTimeout(() => {
              if (mapRef.current?.getMap) {
                const bounds = normalized.map(p => [p.lat, p.lng]);
                mapRef.current.getMap().fitBounds(bounds, { padding: [50, 50] });
              }
            }, 500);
          }
        }
      } catch (err) {
        console.error("Failed to load shared trip:", err);
      }
    };

    fetchSharedTrip();
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setLocalError("");
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
    setLocalError("");
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

  const currentUser = getAuthUser();

  return (
    <div className="home-page" style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
      
      {/* Interactive Map Background */}
      <div className="home-map-container">
        <MapView
          ref={mapRef}
          locations={userLocation ? [{
            userId: currentUser?.id || 'temp-user',
            name: currentUser?.name || 'You',
            lat: userLocation.lat,
            lng: userLocation.lng,
          }] : []}
          currentUserId={currentUser?.id || 'temp-user'}
          centerOnUsers={false}
          roomSettings={{ mapStyle }}
        />
      </div>

      {savedTripPath && (
        <div className="saved-trip-overlay" style={{ zIndex: 300 }}>
          <div className="saved-trip-header">
            <div className="saved-trip-title">{selectedSavedTrip?.tripName || "Saved Trip"}</div>
            <button className="saved-trip-close" onClick={() => { setSavedTripPath(null); setSelectedSavedTrip(null); }}>×</button>
          </div>
          <div className="saved-trip-map">
            <MapView
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
            <button 
              className="modal-btn primary" 
              onClick={() => {
                const tripId = selectedSavedTrip?._id || selectedSavedTrip?.id;
                const shareUrl = `${window.location.origin}/?tripId=${tripId}`;
                navigator.clipboard.writeText(shareUrl);
                alert("Trip share link copied to clipboard!");
              }}
            >
              🔗 Copy Share Link
            </button>
            <button className="modal-btn secondary" onClick={() => { setSavedTripPath(null); setSelectedSavedTrip(null); }}>Close</button>
          </div>
        </div>
      )}

      {/* Topbar (Unified for Desktop and Mobile) */}
      <div className="mob-topbar">
        <span className="mob-topbar-logo" style={{ pointerEvents: 'auto' }}>Coordinator</span>
        <div className="menu-wrap" ref={menuRef} style={{ pointerEvents: 'auto' }}>
          <button
            type="button"
            className="user-pill-btn"
            onClick={() => setShowMenu((prev) => !prev)}
            aria-label="Open account menu"
          >
            {currentUser?.picture ? (
              <img className="user-pill-avatar" src={currentUser.picture} alt="" />
            ) : (
              <span className="user-pill-avatar-placeholder">👤</span>
            )}
            <span className="user-pill-name">
              {currentUser ? (currentUser.name?.split(' ')[0] || 'User') : 'Guest'}
            </span>
            <span className="user-pill-arrow">▼</span>
          </button>
          {showMenu && <AuthMenu />}
        </div>
      </div>

      {/* Left Vertical Icon Toolbar */}
      <div className="mob-icon-toolbar">
        
        {/* Create Room */}
        <button
          type="button"
          className={`mob-icon-btn tool ${activeHomePanel === 'create' ? 'active' : ''}`}
          onClick={() => {
            setActiveHomePanel(prev => prev === 'create' ? null : 'create');
            setLocalError("");
          }}
          data-tooltip="Create Room"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>

        {/* Join Room */}
        <button
          type="button"
          className={`mob-icon-btn tool ${activeHomePanel === 'join' ? 'active' : ''}`}
          onClick={() => {
            setActiveHomePanel(prev => prev === 'join' ? null : 'join');
            setLocalError("");
          }}
          data-tooltip="Join Room"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M10 17l5-5-5-5v10zM19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
          </svg>
        </button>

        {/* Map Style / Layers */}
        <button
          type="button"
          className={`mob-icon-btn tool ${activeHomePanel === 'layers' ? 'active' : ''}`}
          onClick={() => {
            setActiveHomePanel(prev => prev === 'layers' ? null : 'layers');
          }}
          data-tooltip="Layers"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
          </svg>
        </button>

        {/* Center on Me (Locate GPS) */}
        <button
          type="button"
          className="mob-icon-btn tool"
          onClick={handleLocateMe}
          data-tooltip="Locate Me"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
        </button>

      </div>

      {/* Create Room Form Panel */}
      {activeHomePanel === "create" && (
        <div className="mob-members-panel mob-home-panel">
          <div className="mob-members-header">
            <span className="mob-members-header-icon">➕</span>
            <span className="mob-members-header-title">Create Room</span>
            <button type="button" className="mob-panel-close-btn" onClick={() => setActiveHomePanel(null)}>×</button>
          </div>
          <form className="mob-panel-form" onSubmit={handleCreateRoom}>
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
              <label>Room Mode</label>
              <select
                value={roomMode}
                onChange={(e) => setRoomMode(e.target.value)}
              >
                <option value="crowd">Crowd</option>
                <option value="tracking">Tracking</option>
                <option value="trip">Trip</option>
              </select>
            </div>
            {(error || localError) && (
              <div className="home-error" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                {localError || error}
              </div>
            )}
            <button type="submit" disabled={isLoading} className="mob-panel-submit-btn create">
              {isLoading ? "Creating..." : "Create Room"}
            </button>
          </form>
        </div>
      )}

      {/* Join Room Form Panel */}
      {activeHomePanel === "join" && (
        <div className="mob-members-panel mob-home-panel">
          <div className="mob-members-header">
            <span className="mob-members-header-icon">🔑</span>
            <span className="mob-members-header-title">Join Room</span>
            <button type="button" className="mob-panel-close-btn" onClick={() => setActiveHomePanel(null)}>×</button>
          </div>
          <form className="mob-panel-form" onSubmit={handleJoinRoom}>
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
            {(error || localError) && (
              <div className="home-error" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                {localError || error}
              </div>
            )}
            <button type="submit" disabled={isLoading} className="mob-panel-submit-btn join">
              {isLoading ? "Joining..." : "Join Room"}
            </button>
          </form>
        </div>
      )}

      {/* Layers Selection Panel */}
      {activeHomePanel === "layers" && (
        <div className="mob-members-panel mob-home-panel mob-layers-panel-dropdown">
          <div className="mob-members-header">
            <span className="mob-members-header-icon">🗺️</span>
            <span className="mob-members-header-title">Map Layers</span>
            <button type="button" className="mob-panel-close-btn" onClick={() => setActiveHomePanel(null)}>×</button>
          </div>
          <div className="mob-layers-content" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className={`mob-layer-option ${mapStyle === 'osm' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: mapStyle === 'osm' ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                border: mapStyle === 'osm' ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                fontSize: '0.85rem'
              }}
              onClick={() => { setMapStyle('osm'); setActiveHomePanel(null); }}
            >
              <span className="mob-layer-icon">🗺️</span> Standard Map
            </button>
            <button
              type="button"
              className={`mob-layer-option ${mapStyle === 'satellite' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: mapStyle === 'satellite' ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                border: mapStyle === 'satellite' ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                fontSize: '0.85rem'
              }}
              onClick={() => { setMapStyle('satellite'); setActiveHomePanel(null); }}
            >
              <span className="mob-layer-icon">🛰️</span> Satellite Map
            </button>
          </div>
        </div>
      )}
    </div>
  );
}