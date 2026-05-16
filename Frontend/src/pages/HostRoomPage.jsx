import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
import SOSOverlay from "../components/SOSOverlay";
import { LocationSmoother, GpsAccuracyManager } from "../utils/locationSmoother";
import QRCode from "qrcode";
import "./MemberRoomPage.css";

export default function HostRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
  const {
    currentRoom,
    user,
    locations,
    setLocations,
    socket,
    syncRoomLocations,
    leaveRoom,
    calculateDistance,
    calculateBearing,
    formatBearing,
    estimateEtaMinutes,
    formatDistance,
    setError,
    setCurrentRoom,
    roomSettings,
    updateRoomSettings,
    roomWarning,
    clearWarning,
  } = useMap();
  const [qrCode, setQrCode] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [memberList, setMemberList] = useState([]);
  const [showOptions, setShowOptions] = useState(false);
  const [showTargetNav, setShowTargetNav] = useState(false);
  const [isTargeting, setIsTargeting] = useState(false);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  const mapRef = useRef(null);
  const watchIdRef = useRef(null);
  const warningRef = useRef({ signature: null, sentAt: 0 });
  const locationSmootherRef = useRef(new LocationSmoother({ minAccuracy: 50 }));
  const accuracyManagerRef = useRef(new GpsAccuracyManager());

  const targetInfo = (() => {
    if (!roomSettings?.targetLocation) return null;
    const hostLocation = locations.find((loc) => loc.userId === user?.userId);
    if (!hostLocation) return null;
    const distance = calculateDistance(
      hostLocation.lat,
      hostLocation.lng,
      roomSettings.targetLocation.lat,
      roomSettings.targetLocation.lng
    );
    const bearing = calculateBearing(
      hostLocation.lat,
      hostLocation.lng,
      roomSettings.targetLocation.lat,
      roomSettings.targetLocation.lng
    );
    return {
      distance,
      bearingLabel: formatBearing(bearing),
      etaMinutes: estimateEtaMinutes(distance),
    };
  })();

  const joinUrl = `${window.location.origin}/join/${roomId}`;

  useEffect(() => {
    if (!roomId || currentRoom) return;
    if (!user) return;

    const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

    const restoreRoom = async () => {
      try {
        const response = await fetch(`${API_URL}/api/rooms/${roomId.toUpperCase()}`);
        const data = await response.json();
        if (!data.success) return;

        setCurrentRoom({
          roomId: data.room.roomId,
          hostId: data.room.hostId,
          hostName: data.room.hostName,
          isHost: data.room.hostId === user.userId,
        });

        if (data.room.settings) {
          updateRoomSettings(data.room.settings);
        }
      } catch (err) {
        console.error("Failed to restore room:", err);
      }
    };

    restoreRoom();
  }, [roomId, currentRoom, user, setCurrentRoom, updateRoomSettings]);

  useEffect(() => {
    // Generate QR code
    QRCode.toDataURL(joinUrl, { width: 256, height: 256 })
      .then(setQrCode)
      .catch((err) => console.error("QR generation error:", err));
  }, [roomId]);

  useEffect(() => {
    // Sync locations periodically
    const syncInterval = setInterval(() => {
      syncRoomLocations();
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [syncRoomLocations]);

  // Start location tracking when host enters room
  const handleLocationUpdate = (latitude, longitude, accuracy = null, speed = null) => {
    accuracyManagerRef.current.addReading(accuracy);
    
    const filtered = locationSmootherRef.current.filter(latitude, longitude, accuracy, speed);
    
    if (!filtered) return;

    const { lat, lng } = filtered;
    
    setLocations((prev) => {
      const locs = prev.filter((loc) => loc.userId !== user.userId);
      return [
        ...locs,
        {
          userId: user.userId,
          name: user.name,
          lat: lat,
          lng: lng,
          isHost: true,
          accuracy: accuracy,
        },
      ];
    });

    if (socket) {
      socket.emit("location:update", {
        userId: user.userId,
        roomId: currentRoom.roomId,
        lat: lat,
        lng: lng,
        name: user.name,
        accuracy: accuracy,
      });
    }
  };

  const startLocationTracking = () => {
    if (!currentRoom || !user) {
      setError("Room not joined yet");
      return;
    }

    if (watchIdRef.current !== null) return;

    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Geolocation is not supported by your browser.");
      setError("Geolocation is not supported by your browser");
      return;
    }

    setLocationStatus("prompt");
    setLocationError("");

    const onSuccess = (position) => {
      const { latitude, longitude, accuracy, speed } = position.coords;
      console.log(`📍 GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} | Accuracy: ${accuracy?.toFixed(1)}m | Speed: ${speed?.toFixed(1)}m/s`);
      handleLocationUpdate(latitude, longitude, accuracy, speed);
      setLocationStatus("active");
      setLocationError("");
    };

    const onError = (error) => {
      watchIdRef.current = null;
      let errorMsg = "Unable to get your location.";
      if (error.code === 1) {
        errorMsg = "Location permission denied. Please enable location access.";
      } else if (error.code === 2) {
        errorMsg = "Location unavailable. Please enable GPS.";
      } else if (error.code === 3) {
        errorMsg = "Location request timed out. Try again.";
      }
      setLocationStatus("error");
      setLocationError(errorMsg);
      setError(errorMsg);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 3000,
    });
  };

  useEffect(() => {
    if (!currentRoom || !user) {
      console.log('Waiting for dependencies:', { hasRoom: !!currentRoom, hasUser: !!user, hasSocket: !!socket });
      return;
    }

    console.log('📍 Starting location tracking for host:', user.userId, 'in room:', currentRoom.roomId);

    if (socket) {
      socket.emit("user:join", {
        userId: user.userId,
        roomId: currentRoom.roomId,
      });
    }

    startLocationTracking();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [currentRoom, user, socket, setError]);

  useEffect(() => {
    // Update member list with distances
    if (locations.length > 0 && user) {
      const hostLocation = locations.find((loc) => loc.userId === user.userId);
      const updatedMembers = locations.map((loc) => {
        let nearestDistance = null;
        locations.forEach((other) => {
          if (other.userId === loc.userId) return;
          if (other.lat === 0 || other.lng === 0 || loc.lat === 0 || loc.lng === 0) return;
          const distance = calculateDistance(
            loc.lat,
            loc.lng,
            other.lat,
            other.lng
          );
          if (nearestDistance === null || distance < nearestDistance) {
            nearestDistance = distance;
          }
        });

        const distanceLabels = [];
        if (nearestDistance !== null) {
          distanceLabels.push(`Nearest ${formatDistance(nearestDistance)}`);
        }
        if (roomSettings?.targetLocation) {
          const targetDistance = calculateDistance(
            loc.lat,
            loc.lng,
            roomSettings.targetLocation.lat,
            roomSettings.targetLocation.lng
          );
          distanceLabels.push(`Target ${formatDistance(targetDistance)}`);
        }

        let distanceToHost = null;
        if (hostLocation && loc.userId !== user.userId) {
          distanceToHost = calculateDistance(
            hostLocation.lat,
            hostLocation.lng,
            loc.lat,
            loc.lng
          );
        }

        return {
          ...loc,
          distance: distanceToHost,
          nearestDistance,
          distanceLabels,
          isHost: loc.userId === user.userId,
        };
      });
      setMemberList(updatedMembers);
    }
  }, [locations, user, calculateDistance, formatDistance, roomSettings]);

  useEffect(() => {
    if (!socket || !currentRoom || !user) return;
    if (!roomSettings || roomSettings.mode !== "tracking") return;

    const validLocations = locations.filter(
      (loc) => loc.lat !== 0 && loc.lng !== 0 && loc.lat !== null && loc.lng !== null
    );

    if (validLocations.length < 2) return;

    const range = typeof roomSettings.trackingRange === "number"
      ? roomSettings.trackingRange
      : 30;

    const outOfRange = validLocations.filter((loc) => {
      let nearestDistance = null;
      validLocations.forEach((other) => {
        if (other.userId === loc.userId) return;
        const distance = calculateDistance(
          loc.lat,
          loc.lng,
          other.lat,
          other.lng
        );
        if (nearestDistance === null || distance < nearestDistance) {
          nearestDistance = distance;
        }
      });

      if (nearestDistance === null) return false;
      return nearestDistance > range;
    });

    const outOfRangeIds = outOfRange.map((loc) => loc.userId).sort();
    const signature = outOfRangeIds.length === 0 ? "clear" : outOfRangeIds.join(",");
    const now = Date.now();
    const shouldSend =
      signature !== warningRef.current.signature ||
      now - warningRef.current.sentAt > 10000;

    if (shouldSend) {
      socket.emit("room:warning", {
        roomId: currentRoom.roomId,
        warning: signature === "clear" ? null : {
          message: `Member behind: ${outOfRange.map((loc) => loc.name).join(", ")}`,
          outOfRangeIds,
          range,
          timestamp: now,
        },
      });
      warningRef.current = { signature, sentAt: now };
    }
  }, [locations, roomSettings, socket, currentRoom, user, calculateDistance]);

  const handleRangeChange = (event) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) return;
    updateRoomSettings({ trackingRange: Math.max(5, nextValue) });
  };

  const handleMapStyleChange = (event) => {
    updateRoomSettings({ mapStyle: event.target.value });
  };

  const handleSetTarget = () => {
    setIsTargeting(true);
  };

  const handleClearTarget = () => {
    updateRoomSettings({ targetLocation: null });
    setIsTargeting(false);
  };

  const handleMapTarget = (latlng) => {
    updateRoomSettings({
      targetLocation: { lat: latlng.lat, lng: latlng.lng },
    });
    setIsTargeting(false);
  };

  const handleLeaveRoom = async () => {
    if (window.confirm("Are you sure you want to leave and close this group?")) {
      await leaveRoom();
      navigate("/");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinUrl);
    alert("Join link copied to clipboard!");
  };

  return (
    <div className="room-page">
      <div className="room-earth-bg"></div>
      <div className="room-shell">
        {/* Top Bar - Simple on mobile */}
        <div className={`room-topbar ${isMobile ? 'mobile-compact' : ''}`}>
          {isMobile ? (
            <>
              <div className="mobile-top-left">
                <span className="room-id-display">{roomId}</span>
                <span className="member-count">{locations.length}</span>
              </div>
              <div className="mobile-top-right">
                {roomSettings?.mode && (
                  <span className={`mode-badge ${roomSettings.mode}`}>
                    {roomSettings.mode === "tracking" ? "TRK" : "CRW"}
                  </span>
                )}
                <button className="options-fab" onClick={() => setShowOptions(!showOptions)}>
                  {showOptions ? "✕" : "☰"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="room-topbar-left">
                <span>Group: {roomId}</span>
                <span className="muted">{locations.length} member{locations.length !== 1 ? 's' : ''}</span>
                <span className="room-mode-pill">
                  Mode: {roomSettings?.mode === "tracking" ? "Tracking" : "Crowd"}
                </span>
              </div>

              <div className="room-topbar-right">
                <button className="soft-pill-btn qr" onClick={() => setShowQR(true)}>Show QR</button>
                <button className="soft-pill-btn leave" onClick={handleLeaveRoom}>LEAVE</button>
              </div>
            </>
          )}
        </div>

        {/* Mobile Options Panel */}
        {isMobile && showOptions && (
          <div className="mobile-options-panel">
            {locationStatus !== "active" && (
              <div className="option-item location-option">
                <span className="option-label">Location</span>
                <button className="option-btn enable" onClick={startLocationTracking}>
                  {locationStatus === "prompt" ? "Waiting..." : "Enable"}
                </button>
              </div>
            )}

            <div className="option-item" onClick={() => updateRoomSettings({ mode: roomSettings?.mode === "tracking" ? "crowd" : "tracking" })}>
              <span className="option-label">Mode</span>
              <span className="option-value">{roomSettings?.mode === "tracking" ? "Crowd" : "Tracking"}</span>
            </div>

            <div className="option-item">
              <span className="option-label">Map Style</span>
              <select
                className="option-select"
                value={roomSettings?.mapStyle || "osm"}
                onChange={handleMapStyleChange}
              >
                <option value="osm">Standard</option>
                <option value="satellite">Satellite</option>
              </select>
            </div>

            {roomSettings?.mode === "tracking" && (
              <div className="option-item">
                <span className="option-label">Range</span>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={roomSettings.trackingRange ?? 30}
                  onChange={handleRangeChange}
                  className="option-input"
                />
              </div>
            )}

            <div className="option-item" onClick={() => { handleSetTarget(); setShowOptions(false); }}>
              <span className="option-label">📍 Set Target</span>
              <span className="option-value">{roomSettings?.targetLocation ? "Change" : "Add"}</span>
            </div>

            {roomSettings?.targetLocation && (
              <div className="option-item" onClick={() => { handleClearTarget(); setShowOptions(false); }}>
                <span className="option-label">Clear Target</span>
              </div>
            )}

            {roomWarning && (
              <div className="option-item warning-option" onClick={() => { clearWarning(); setShowOptions(false); }}>
                <span className="option-label">⚠️ Warning</span>
                <span className="option-value">Dismiss</span>
              </div>
            )}

            <div className="option-item" onClick={() => { setShowTargetNav(!showTargetNav); setShowOptions(false); }}>
              <span className="option-label">🧭 Target Nav</span>
              <span className="option-value">{showTargetNav ? "Hide" : "Show"}</span>
            </div>

            <div className="option-item" onClick={() => { setShowQR(true); setShowOptions(false); }}>
              <span className="option-label">📱 Show QR</span>
            </div>



            <div className="option-item leave-option" onClick={handleLeaveRoom}>
              <span className="option-label">Leave Room</span>
            </div>
          </div>
        )}

        {/* Mobile Target Navigation - Toggle */}
        {isMobile && showTargetNav && roomSettings?.targetLocation && targetInfo && (
          <div className="mobile-target-panel">
            <div className="target-item">
              <span className="target-value">📍 {formatDistance(targetInfo.distance)}</span>
            </div>
            <div className="target-item">
              <span className="target-value">🧭 {targetInfo.bearingLabel}</span>
            </div>
            <div className="target-item">
              <span className="target-value">⏱️ {targetInfo.etaMinutes}m</span>
            </div>
          </div>
        )}

        {/* Desktop location banner */}
        {!isMobile && locationStatus !== "active" && (
          <div className="location-banner">
            <span className="location-banner-text">
              {locationStatus === "prompt"
                ? "Waiting for location permission..."
                : "Location is off. Enable to share your position."}
            </span>
            <button type="button" className="location-banner-btn" onClick={startLocationTracking}>
              Enable location
            </button>
            {locationError && <span className="location-banner-error">{locationError}</span>}
          </div>
        )}

        {/* Desktop warning banner */}
        {!isMobile && roomWarning && (
          <div className="room-warning-banner" onClick={clearWarning}>
            <span className="warning-title">Warning</span>
            <span className="warning-text">
              {roomWarning.message} ({'>'}{roomWarning.range}m from nearest member)
            </span>
            <span className="warning-close">Dismiss</span>
          </div>
        )}

        {/* Desktop controls panel */}
        {!isMobile && (
          <div className="room-controls-panel">
            <div className="control-row">
              <span className="control-label">Mode</span>
              <button
                className={`mode-btn ${roomSettings?.mode === "tracking" ? "active" : ""}`}
                onClick={() => updateRoomSettings({ mode: "tracking" })}
              >
                Tracking
              </button>
              <button
                className={`mode-btn ${roomSettings?.mode === "crowd" ? "active" : ""}`}
                onClick={() => updateRoomSettings({ mode: "crowd" })}
              >
                Crowd
              </button>
            </div>

            <div className="control-row">
              <label className="control-label" htmlFor="mapStyle">Map</label>
              <select
                id="mapStyle"
                className="control-input"
                value={roomSettings?.mapStyle || "osm"}
                onChange={handleMapStyleChange}
              >
                <option value="osm">OSM Standard</option>
                <option value="satellite">Satellite</option>
              </select>
            </div>

            {roomSettings?.mode === "tracking" && (
              <div className="control-row">
                <label className="control-label" htmlFor="trackingRange">Range (m)</label>
                <input
                  id="trackingRange"
                  type="number"
                  min={5}
                  max={200}
                  step={1}
                  value={roomSettings.trackingRange ?? 30}
                  onChange={handleRangeChange}
                  className="control-input"
                />
                <span className="control-hint">Nearest member rule</span>
              </div>
            )}

            <div className="control-row">
              <button type="button" className="soft-pill-btn target" onClick={handleSetTarget}>
                Set Target
              </button>
              {roomSettings?.targetLocation && (
                <button type="button" className="soft-pill-btn target-clear" onClick={handleClearTarget}>
                  Clear
                </button>
              )}
            </div>

            {isTargeting && (
              <div className="control-hint">Click on map to place the target pin.</div>
            )}
          </div>
        )}

        {/* Desktop target nav panel */}
        {!isMobile && roomSettings?.targetLocation && targetInfo && (
          <div className="target-nav-panel">
            <div className="target-nav-head glass-card-header">
              <span className="glass-card-title">Target Navigation</span>
              <span className="glass-card-subtitle">Live direction to destination</span>
            </div>
            <div className="target-nav-grid target-nav-desktop">
              <div>
                <div className="target-nav-label">Distance</div>
                <div className="target-nav-value">{formatDistance(targetInfo.distance)}</div>
              </div>
              <div>
                <div className="target-nav-label">Bearing</div>
                <div className="target-nav-value">{targetInfo.bearingLabel}</div>
              </div>
              <div>
                <div className="target-nav-label">ETA</div>
                <div className="target-nav-value">~{targetInfo.etaMinutes} min</div>
              </div>
            </div>
            <div className="target-nav-mini">
              <span>Target</span>
              <span>{formatDistance(targetInfo.distance)}</span>
              <span>{targetInfo.bearingLabel}</span>
              <span>~{targetInfo.etaMinutes} min</span>
            </div>
          </div>
        )}

        {/* Map */}
        <div className="room-map-wrap">
          <MapView
            ref={mapRef}
            locations={locations}
            currentUserId={user?.userId}
            showLines={roomSettings?.mode === "crowd" || !!roomSettings?.targetLocation}
            centerOnUsers={true}
            targetLocation={roomSettings?.targetLocation}
            onMapClick={handleMapTarget}
            isTargeting={isTargeting}
            roomSettings={roomSettings}
          />
        </div>

        {/* Walkie Talkie */}
        {currentRoom && user && (
          <LiveChat
            roomId={roomId}
            members={memberList}
            currentUserId={user?.userId}
          />
        )}

        {/* QR Code Modal */}
        {showQR && (
          <div className="qr-modal-backdrop" onClick={() => setShowQR(false)}>
            <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowQR(false)}
                className="qr-modal-close"
              >
                ×
              </button>
              <h2 className="qr-modal-title">Share to Join</h2>
              <div className="qr-code-wrap">
                {qrCode ? (
                  <img src={qrCode} alt="Join QR Code" />
                ) : (
                  <div className="qr-loading">Loading QR...</div>
                )}
              </div>
              <div className="qr-room-id">
                <p className="qr-label">Group Code</p>
                <p className="qr-code-text">{roomId}</p>
              </div>
              <div className="qr-actions">
                <button
                  onClick={copyToClipboard}
                  className="qr-btn-primary"
                >
                  📋 Copy Link
                </button>
                <button
                  onClick={() => setShowQR(false)}
                  className="qr-btn-secondary"
                >
                  Close
                </button>
              </div>
              <div className="qr-link-wrap">
                <p>Or share this link:</p>
                <p className="qr-link-text">{joinUrl}</p>
              </div>
            </div>
          </div>
        )}

        {/* Emergency SOS Overlay */}
        <SOSOverlay currentLocation={locations.find(loc => loc.userId === user?.userId)} />
      </div>
    </div>
  );
}
