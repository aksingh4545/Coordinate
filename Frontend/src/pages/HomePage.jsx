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
  const [entryMode, setEntryMode] = useState(null);
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

  // Mobile layout state & features
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 640);
  const [activeHomePanel, setActiveHomePanel] = useState(null); // 'create', 'join', 'layers', or null
  const [mapStyle, setMapStyle] = useState("osm");
  const [userLocation, setUserLocation] = useState(null);
  const locationSmootherRef = useRef(new LocationSmoother({ minAccuracy: 50 }));

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
          centerOnUsers={true}
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

      {isMobile ? (
        <>
          {/* Mobile Topbar */}
          <div className="mob-topbar">
            <span className="mob-topbar-logo" style={{ pointerEvents: 'auto' }}>Coordinator</span>
            <div className="menu-wrap" ref={menuRef} style={{ pointerEvents: 'auto' }}>
              <button
                type="button"
                className="menu-icon"
                onClick={() => setShowMenu((prev) => !prev)}
                aria-label="Open account menu"
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                  cursor: 'pointer'
                }}
              >
                {currentUser?.picture ? (
                  <img src={currentUser.picture} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                ) : (
                  <span style={{ fontSize: '0.8rem' }}>👤</span>
                )}
                <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                  {currentUser ? (currentUser.name?.split(' ')[0] || 'User') : 'Guest'}
                </span>
                <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>▼</span>
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
        </>
      ) : (
        <>
          {/* Desktop Top Bar */}
          <header className="top-glass-bar">
            <div className="brand-small">Coordinator</div>
            <div className="tagline-top">Find your group in crowded places</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setMapStyle('osm')}
                  style={{
                    background: mapStyle === 'osm' ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                    border: mapStyle === 'osm' ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  🗺️ Map
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle('satellite')}
                  style={{
                    background: mapStyle === 'satellite' ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                    border: mapStyle === 'satellite' ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  🛰️ Satellite
                </button>
                <button
                  type="button"
                  onClick={handleLocateMe}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Locate Me"
                >
                  🎯
                </button>
              </div>
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
            </div>
          </header>

          {/* Desktop Floating Shell on top of Map */}
          <main className="home-content">
            <section className="home-shell">
              <div className="home-shell-copy">
                <div className="hero-logo">
                  <CoordinatorLogo />
                </div>

                <div className="home-badge-row">
                  <span className="home-badge">Room-ready coordination</span>
                  <span className="home-badge subtle">Create or join in one place</span>
                </div>

                <h1 className="hero-title hero-title-home">Coordinator</h1>
                <p className="hero-subtitle hero-subtitle-home">
                  A room-first landing page that shows what happens before you enter, while you set up, and after you join.
                </p>

                <div className="home-flow-steps" aria-label="Room flow overview">
                  <FlowTip
                    tone="neutral"
                    title="Before entry"
                    text="Choose the path that fits your group."
                  />
                  <FlowTip
                    tone="create"
                    title="Create room"
                    text="You become the host and get a shareable room code."
                  />
                  <FlowTip
                    tone="join"
                    title="Join room"
                    text="Enter an existing room code and step straight into the group."
                  />
                </div>
              </div>

              <div className="home-shell-panel">
                <div className="home-shell-panel-top">
                  <div>
                    <div className="panel-kicker">Room entry</div>
                    <h2>
                      {entryMode === "create"
                        ? "Create a new room"
                        : entryMode === "join"
                          ? "Join an existing room"
                          : "Pick how you want to start"}
                    </h2>
                  </div>

                  {entryMode && (
                    <button
                      type="button"
                      className="panel-link"
                      onClick={() => {
                        setEntryMode(null);
                        setLocalError("");
                      }}
                    >
                      Back to choices
                    </button>
                  )}
                </div>

                {!entryMode ? (
                  <>
                    <p className="home-shell-panel-copy">
                      The landing page starts as a simple choice screen. Tap one card and the page turns into the matching room form, so users always know what happens next.
                    </p>

                    <div className="entry-choice-grid">
                      <button
                        type="button"
                        className="entry-choice-card create-card"
                        onClick={() => {
                          setEntryMode("create");
                          setLocalError("");
                        }}
                      >
                        <EntryGlyph mode="create" />
                        <div className="entry-choice-copy">
                          <span className="entry-choice-label">Create room</span>
                          <span className="entry-choice-text">Start a room, set the mode, and invite your group.</span>
                        </div>
                        <span className="entry-choice-pill">Host</span>
                      </button>

                      <button
                        type="button"
                        className="entry-choice-card join-card"
                        onClick={() => {
                          setEntryMode("join");
                          setLocalError("");
                        }}
                      >
                        <EntryGlyph mode="join" />
                        <div className="entry-choice-copy">
                          <span className="entry-choice-label">Join room</span>
                          <span className="entry-choice-text">Use a room code to connect and appear on the shared map.</span>
                        </div>
                        <span className="entry-choice-pill">Member</span>
                      </button>
                    </div>

                    <div className="home-shell-footnote">
                      <span>Before: you only choose a path.</span>
                      <span>After: the form adapts to that path and sends you into the right room.</span>
                    </div>
                  </>
                ) : entryMode === "create" ? (
                  <form className="room-form" onSubmit={handleCreateRoom}>
                    <div className="entry-summary-card create-summary">
                      <EntryGlyph mode="create" />
                      <div>
                        <div className="entry-summary-kicker">Host flow</div>
                        <div className="entry-summary-title">You will create the room and get the code.</div>
                        <div className="entry-summary-text">The room opens on the host page after the form is submitted.</div>
                      </div>
                    </div>

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

                    <div className="room-form-hint">
                      <span>After creating, you land in the host room with the map and controls already ready.</span>
                    </div>

                    {(error || localError) && (
                      <div className="home-error">
                        {localError || error}
                      </div>
                    )}

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="modal-btn secondary"
                        onClick={() => {
                          setEntryMode(null);
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
                        {isLoading ? "Creating..." : "Create room"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="room-form" onSubmit={handleJoinRoom}>
                    <div className="entry-summary-card join-summary">
                      <EntryGlyph mode="join" />
                      <div>
                        <div className="entry-summary-kicker">Join flow</div>
                        <div className="entry-summary-title">Enter the room code to step in.</div>
                        <div className="entry-summary-text">You become a member and open the shared room screen after joining.</div>
                      </div>
                    </div>

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

                    <div className="room-form-hint">
                      <span>After joining, the room page shows your group, map, and live location tools.</span>
                    </div>

                    {(error || localError) && (
                      <div className="home-error">
                        {localError || error}
                      </div>
                    )}

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="modal-btn secondary"
                        onClick={() => {
                          setEntryMode(null);
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
                        {isLoading ? "Joining..." : "Join room"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {(error || localError) && !entryMode && (
                <div className="home-error home-error-wide">
                  {localError || error}
                </div>
              )}

              <p className="hero-footer hero-footer-home">
                Live location, smart coordination, and a room UI that makes the next step obvious.
              </p>
            </section>
          </main>
        </>
      )}
    </div>
  );
}