import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
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
    roomSettings,
    updateRoomSettings,
    roomWarning,
    clearWarning,
  } = useMap();
  const [qrCode, setQrCode] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [memberList, setMemberList] = useState([]);
  const [showChat, setShowChat] = useState(true);
  const [isTargeting, setIsTargeting] = useState(false);
  const mapRef = useRef(null);
  const warningRef = useRef({ signature: null, sentAt: 0 });

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
  useEffect(() => {
    if (!currentRoom || !user || !socket) {
      console.log('Waiting for dependencies:', { hasRoom: !!currentRoom, hasUser: !!user, hasSocket: !!socket });
      return;
    }

    console.log('📍 Starting location tracking for host:', user.userId, 'in room:', currentRoom.roomId);

    // Join socket room
    socket.emit("user:join", {
      userId: user.userId,
      roomId: currentRoom.roomId,
    });

    // Geolocation watch for continuous location updates
    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser");
      setError("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('📍 Location updated:', { lat: latitude, lng: longitude });

        // Update local locations state FIRST (for immediate UI update)
        setLocations((prev) => {
          const filtered = prev.filter((loc) => loc.userId !== user.userId);
          const updated = [...filtered, {
            userId: user.userId,
            name: user.name,
            lat: latitude,
            lng: longitude,
            isHost: true,
          }];
          console.log('📍 Updated locations:', updated);
          return updated;
        });

        // Emit location to socket for broadcasting to others
        socket.emit("location:update", {
          userId: user.userId,
          roomId: currentRoom.roomId,
          lat: latitude,
          lng: longitude,
          name: user.name,
        });
      },
      (error) => {
        console.error("Location error:", error);
        let errorMsg = "Unable to get your location.";
        if (error.code === 1) {
          errorMsg = "Location permission denied. Please enable location access.";
        } else if (error.code === 2) {
          errorMsg = "Location unavailable. Please enable GPS.";
        }
        setError(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [currentRoom, user, socket, setLocations, setError]);

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
        {/* Top Bar */}
        <div className="room-topbar">
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
        </div>

        {isMobile && roomSettings?.mode && (
          <div className="room-mobile-mode">
            <span
              className={`room-mobile-mode-pill ${
                roomSettings.mode === "tracking" ? "tracking" : "crowd"
              }`}
            >
              {roomSettings.mode === "tracking" ? "Tracking" : "Crowd"}
            </span>
          </div>
        )}

        {roomWarning && (
          <div className="room-warning-banner" onClick={clearWarning}>
            <span className="warning-title">Warning</span>
            <span className="warning-text">
              {roomWarning.message} ({'>'}{roomWarning.range}m from nearest member)
            </span>
            <span className="warning-close">Dismiss</span>
          </div>
        )}

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

        {roomSettings?.targetLocation && targetInfo && (
          <div className={`target-nav-panel ${isMobile ? "compact-mobile" : ""}`}>
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

        {/* Live Chat */}
        {showChat && currentRoom && user && (
          <LiveChat
            roomId={roomId}
            members={memberList}
            currentUserId={user?.userId}
            onClose={() => setShowChat(false)}
          />
        )}

        {/* FAB to open chat */}
        {!showChat && (
          <button className="chat-fab" onClick={() => setShowChat(true)}>
            💬
          </button>
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
      </div>
    </div>
  );
}
