import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
import "./MemberRoomPage.css";

export default function MemberRoomPage() {
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
    joinRoom,
    leaveRoom,
    calculateDistance,
    calculateBearing,
    formatBearing,
    estimateEtaMinutes,
    formatDistance,
    setError,
    roomSettings,
    roomWarning,
    clearWarning,
  } = useMap();
  const [memberList, setMemberList] = useState([]);
  const [showChat, setShowChat] = useState(true);
  const mapRef = useRef(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!roomId || currentRoom) return;
    if (!user) return;

    joinRoom(roomId.toUpperCase(), user.name || "User").catch((err) => {
      console.error("Failed to rejoin room:", err);
    });
  }, [roomId, currentRoom, user, joinRoom]);

  const targetInfo = (() => {
    if (!roomSettings?.targetLocation) return null;
    const currentLocation = locations.find((loc) => loc.userId === user?.userId);
    if (!currentLocation) return null;
    const distance = calculateDistance(
      currentLocation.lat,
      currentLocation.lng,
      roomSettings.targetLocation.lat,
      roomSettings.targetLocation.lng
    );
    const bearing = calculateBearing(
      currentLocation.lat,
      currentLocation.lng,
      roomSettings.targetLocation.lat,
      roomSettings.targetLocation.lng
    );
    return {
      distance,
      bearingLabel: formatBearing(bearing),
      etaMinutes: estimateEtaMinutes(distance),
    };
  })();

  useEffect(() => {
    // Sync locations periodically
    const syncInterval = setInterval(() => {
      syncRoomLocations();
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [syncRoomLocations]);

  // Start location tracking when member enters room
  const handleLocationUpdate = (latitude, longitude) => {
    if (socket) {
      socket.emit("location:update", {
        userId: user.userId,
        roomId: currentRoom.roomId,
        lat: latitude,
        lng: longitude,
        name: user.name,
      });
    }

    setLocations((prev) => {
      const filtered = prev.filter((loc) => loc.userId !== user.userId);
      return [
        ...filtered,
        {
          userId: user.userId,
          name: user.name,
          lat: latitude,
          lng: longitude,
          isHost: false,
        },
      ];
    });
  };

  const startLocationTracking = async () => {
    if (!currentRoom || !user || watchIdRef.current !== null) return;

    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Geolocation is not supported by your browser.");
      setError("Geolocation is not supported by your browser");
      return;
    }

    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "denied") {
          setLocationStatus("error");
          setLocationError("Location permission denied. Enable location in browser settings.");
          setError("Location permission denied. Please enable location access.");
          return;
        }
      }
    } catch (err) {
      console.warn("Unable to query geolocation permissions:", err);
    }

    setLocationStatus("prompt");
    setLocationError("");

    const onSuccess = (position) => {
      const { latitude, longitude } = position.coords;
      handleLocationUpdate(latitude, longitude);
      setLocationStatus("active");
      setLocationError("");
    };

    const onError = (error) => {
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

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });

    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  };

  useEffect(() => {
    if (!currentRoom || !user) return;

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
      const hostLocation = locations.find((loc) => loc.userId === currentRoom?.hostId);
      const updatedMembers = locations.map((loc) => {
        let nearestDistance = null;
        locations.forEach((other) => {
          if (other.userId === loc.userId) return;
          if (other.lat === 0 || other.lng === 0 || loc.lat === 0 || loc.lng === 0) return;
          const dist = calculateDistance(
            loc.lat,
            loc.lng,
            other.lat,
            other.lng
          );
          if (nearestDistance === null || dist < nearestDistance) {
            nearestDistance = dist;
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

        let distance = null;
        if (hostLocation && loc.userId !== currentRoom.hostId) {
          distance = calculateDistance(
            hostLocation.lat,
            hostLocation.lng,
            loc.lat,
            loc.lng
          );
        }
        return {
          ...loc,
          distance,
          nearestDistance,
          distanceLabels,
          isHost: loc.userId === currentRoom.hostId,
        };
      });
      setMemberList(updatedMembers);
    }
  }, [locations, user, currentRoom, calculateDistance, formatDistance, roomSettings]);

  const handleLeaveRoom = async () => {
    if (window.confirm("Are you sure you want to leave this group?")) {
      await leaveRoom();
      navigate("/");
    }
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
            {roomSettings?.mode === "tracking" && (
              <span className="room-range-pill">Range: {roomSettings.trackingRange ?? 30}m</span>
            )}
          </div>

          <div className="room-topbar-right">
            <button className="soft-pill-btn leave" onClick={handleLeaveRoom}>LEAVE</button>
          </div>
        </div>

        {locationStatus !== "active" && (
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
      </div>
    </div>
  );
}
