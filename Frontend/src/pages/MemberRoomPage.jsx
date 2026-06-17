import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
import SOSOverlay from "../components/SOSOverlay";
import { LocationSmoother } from "../utils/locationSmoother";
import { placesService } from "../utils/placesService";
import { getAuthUser } from "../utils/authStorage";
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
    updateRoomSettings,
    roomWarning,
    clearWarning,
  } = useMap();
  const [memberList, setMemberList] = useState([]);
  const [showOptions, setShowOptions] = useState(false);
  const [showTargetNav, setShowTargetNav] = useState(false);
  const [showTripHeader, setShowTripHeader] = useState(true);
  const mapRef = useRef(null);
  const [tripQuery, setTripQuery] = useState("");
  const [tripSuggestions, setTripSuggestions] = useState([]);
  const [isTripSearching, setIsTripSearching] = useState(false);
  const [tripSearchError, setTripSearchError] = useState("");
  const [tripPath, setTripPath] = useState([]);
  const [savedTripPath, setSavedTripPath] = useState(null);
  const [selectedSavedTrip, setSelectedSavedTrip] = useState(null);
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripName, setTripName] = useState("");
  const [pendingTrip, setPendingTrip] = useState(null);
  const [waitingForLogin, setWaitingForLogin] = useState(false);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  const watchIdRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const [batterySaver, setBatterySaver] = useState(false);
  const pollIntervalRef = useRef(null);
  const wakeLockRef = useRef(null);
  const suppressTripSearchRef = useRef(false);
  const lastSelectedTripQueryRef = useRef("");
  const locationSmootherRef = useRef(new LocationSmoother({ minAccuracy: 50 }));
  // New mobile UI state
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [isTalkingMobile, setIsTalkingMobile] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const tripStateRef = useRef({
    active: false,
    startedAt: null,
    startLocation: null,
    lastPoint: null,
    completed: false,
  });
  const tripPathRef = useRef([]);
  const arrivalThresholdMeters = roomSettings?.trackingRange ?? 50;
  const minTripPointDistance = 8;

  const normalizeTripPath = (path) => {
    if (!Array.isArray(path)) return null;
    const normalized = path
      .map((point) => {
        if (!point) return null;
        if (Array.isArray(point) && point.length >= 2) {
          return { lat: Number(point[0]), lng: Number(point[1]) };
        }
        if (typeof point === "object") {
          const lat = Number(point.lat ?? point.latitude);
          const lng = Number(point.lng ?? point.longitude);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            return { lat, lng };
          }
        }
        return null;
      })
      .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));

    return normalized.length > 1 ? normalized : null;
  };

  useEffect(() => {
    if (!roomId) return;
    
    if (!user || !user.name) {
      console.log("No user session found, redirecting to join page");
      navigate(`/join/${roomId}`);
      return;
    }

    // Always rejoin the room on mount to fetch the latest room details and settings (e.g. active trip mode)
    joinRoom(roomId.toUpperCase(), user.name).catch((err) => {
      console.error("Failed to rejoin room:", err);
      navigate(`/join/${roomId}`);
    });
  }, [roomId, user, joinRoom, navigate]);

  const targetInfo = (() => {
    if (roomSettings?.targetLocation?.lat == null) return null;
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

  const currentUserLocation = locations.find((loc) => loc.userId === user?.userId) || null;

  useEffect(() => {
    // Sync locations periodically - throttled in battery saver mode
    const interval = batterySaver ? 15000 : 8000;
    const syncInterval = setInterval(() => {
      syncRoomLocations();
    }, interval);

    return () => clearInterval(syncInterval);
  }, [syncRoomLocations, batterySaver]);

  // Listen for saved trip click to display on map
  useEffect(() => {
    if (window.currentSavedTrip?.path) {
      setSavedTripPath(normalizeTripPath(window.currentSavedTrip.path));
      setSelectedSavedTrip(window.currentSavedTrip);
      window.currentSavedTrip = null;
    }

    const handleShowSavedTrip = (event) => {
      const trip = event?.detail;
      const nextPath = normalizeTripPath(trip?.path);
      if (!nextPath) return;

      setSavedTripPath(nextPath);
      setSelectedSavedTrip(trip);
      if (mapRef.current && mapRef.current.getMap) {
        setTimeout(() => {
          try {
            const bounds = nextPath.map((p) => [p.lat, p.lng]);
            mapRef.current.getMap().fitBounds(bounds, { padding: [50, 50] });
          } catch (err) {
            console.log("MemberRoomPage - fitBounds error:", err);
          }
        }, 500);
      }
    };

    window.addEventListener('showSavedTrip', handleShowSavedTrip);
    return () => window.removeEventListener('showSavedTrip', handleShowSavedTrip);
  }, []);

  useEffect(() => {
    if (roomSettings?.mode !== "trip") {
      setSavedTripPath(null);
      setSelectedSavedTrip(null);
    }
  }, [roomSettings?.mode]);

  // Start location tracking when member enters room
  const handleLocationUpdate = (latitude, longitude, accuracy = null, speed = null) => {
    const filtered = locationSmootherRef.current.filter(latitude, longitude, accuracy, speed);
    if (!filtered) return;
    const { lat, lng } = filtered;

    setLocations((prev) => {
      const filtered2 = prev.filter((loc) => loc.userId !== user.userId);
      return [
        ...filtered2,
        {
          userId: user.userId,
          name: user.name,
          lat: lat,
          lng: lng,
          isHost: false,
        },
      ];
    });

    if (socket && currentRoom) {
      socket.emit("location:update", {
        userId: user.userId,
        roomId: currentRoom.roomId,
        lat: lat,
        lng: lng,
        name: user.name,
      });
    }
  };

  const startLocationTracking = () => {
    if (!currentRoom || !user) {
      setError("Room not joined yet");
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Geolocation is not supported by your browser.");
      setError("Geolocation is not supported by your browser");
      return;
    }

    // Only set to prompt if we don't have an active tracking session yet
    if (locationStatus !== "active") {
      setLocationStatus("prompt");
    }
    setLocationError("");

    const onSuccess = (position) => {
      const { latitude, longitude, accuracy, speed } = position.coords;
      console.log(`📍 GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} | Accuracy: ${accuracy?.toFixed(1)}m | Speed: ${speed?.toFixed(1)}m/s | Mode: ${batterySaver ? 'Saver' : 'HighAccuracy'}`);
      handleLocationUpdate(latitude, longitude, accuracy, speed);
      setLocationStatus("active");
      setLocationError("");
    };

    const onError = (error) => {
      console.warn(`⚠️ GPS Error (code ${error.code}): ${error.message}`);
      let errorMsg = "Unable to get your location.";
      if (error.code === 1) {
        errorMsg = "Location permission denied. Please enable location access.";
        setLocationStatus("error");
        setLocationError(errorMsg);
        setError(errorMsg);
        return;
      } else if (error.code === 2) {
        errorMsg = "Location unavailable. Please enable GPS.";
      } else if (error.code === 3) {
        errorMsg = "Location request timed out. Retrying...";
      }

      // If we don't have an active session yet, update the status to show warning/prompt
      if (locationStatus !== "active") {
        if (error.code === 2) {
          setLocationStatus("error");
          setLocationError(errorMsg);
          setError(errorMsg);
        } else {
          // Keep the status as prompt ("Waiting for GPS...") during timeouts so the GPS keeps trying natively
          setLocationStatus("prompt");
          setLocationError(errorMsg);
        }
      }
    };

    if (batterySaver) {
      // 🔋 Battery Saver Mode: Polling position every 20 seconds with low accuracy (allows GPS chip to sleep)
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000,
      });

      pollIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 30000,
        });
      }, 20000);
    } else {
      // ⚡ High Accuracy Mode: Get a quick first fix with cached position, then start watchPosition
      // First: try to get a quick cached fix so the status transitions to "active" immediately
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onSuccess(pos);
        },
        () => { /* ignore quick-fix errors, watchPosition will handle */ },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
      // Then: continuous high-accuracy tracking
      watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 60000,
        maximumAge: 3000,
      });
    }
  };

  useEffect(() => {
    if (!currentRoom || !user) return;

    console.log('📍 Starting location tracking for member:', user.userId, 'in room:', currentRoom.roomId, 'BatterySaver:', batterySaver);

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
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [currentRoom, user, socket, setError, batterySaver]);

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        console.log("🔒 Member Screen Wake Lock acquired");
        
        wakeLockRef.current.addEventListener("release", () => {
          console.log("🔒 Member Screen Wake Lock was released");
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      console.warn("⚠️ Failed to acquire member wake lock:", err.message);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log("🔒 Member Screen Wake Lock released manually");
      } catch (err) {
        console.error("⚠️ Failed to release member wake lock:", err);
      }
    }
  };

  useEffect(() => {
    if (!currentRoom) return;

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [currentRoom]);

  const resetTripState = () => {
    tripStateRef.current = {
      active: false,
      startedAt: null,
      startLocation: null,
      lastPoint: null,
      completed: false,
    };
    setTripPath([]);
    tripPathRef.current = [];
    setPendingTrip(null);
    setWaitingForLogin(false);
    setTripName("");
    setShowTripModal(false);
  };

  useEffect(() => {
    if (roomSettings?.mode !== "trip" || roomSettings?.targetLocation?.lat == null) {
      resetTripState();
      return;
    }

    if (!currentUserLocation || currentUserLocation.lat === 0 || currentUserLocation.lng === 0) return;

    if (!tripStateRef.current.active && !tripStateRef.current.completed) {
      tripStateRef.current.active = true;
      tripStateRef.current.startedAt = Date.now();
      tripStateRef.current.startLocation = {
        lat: currentUserLocation.lat,
        lng: currentUserLocation.lng,
      };
      const firstPoint = {
        lat: currentUserLocation.lat,
        lng: currentUserLocation.lng,
        timestamp: Date.now(),
      };
      tripStateRef.current.lastPoint = firstPoint;
      setTripPath([firstPoint]);
      tripPathRef.current = [firstPoint];
    }
  }, [roomSettings?.mode, roomSettings?.targetLocation, currentUserLocation]);

  useEffect(() => {
    if (roomSettings?.mode !== "trip") return;
    if (roomSettings?.targetLocation?.lat == null) return;
    if (!currentUserLocation) return;
    if (!tripStateRef.current.active || tripStateRef.current.completed) return;

    const lastPoint = tripStateRef.current.lastPoint;
    if (!lastPoint) return;

    const distanceFromLast = calculateDistance(
      lastPoint.lat,
      lastPoint.lng,
      currentUserLocation.lat,
      currentUserLocation.lng
    );

    if (distanceFromLast >= minTripPointDistance) {
      const nextPoint = {
        lat: currentUserLocation.lat,
        lng: currentUserLocation.lng,
        timestamp: Date.now(),
      };
      tripStateRef.current.lastPoint = nextPoint;
      setTripPath((prev) => {
        const updated = [...prev, nextPoint];
        tripPathRef.current = updated;
        return updated;
      });
    }

    const distanceToTarget = calculateDistance(
      currentUserLocation.lat,
      currentUserLocation.lng,
      roomSettings.targetLocation.lat,
      roomSettings.targetLocation.lng
    );

    if (distanceToTarget <= arrivalThresholdMeters) {
      tripStateRef.current.completed = true;
      tripStateRef.current.active = false;

      const endPoint = {
        lat: currentUserLocation.lat,
        lng: currentUserLocation.lng,
        timestamp: Date.now(),
      };

      let finalPath = tripPathRef.current.length
        ? [...tripPathRef.current]
        : [tripStateRef.current.startLocation].filter(Boolean);

      const lastSaved = finalPath[finalPath.length - 1];
      if (!lastSaved || calculateDistance(lastSaved.lat, lastSaved.lng, endPoint.lat, endPoint.lng) >= 1) {
        finalPath = [...finalPath, endPoint];
      }

      setPendingTrip({
        roomId: currentRoom?.roomId,
        startLocation: tripStateRef.current.startLocation,
        endLocation: {
          lat: currentUserLocation.lat,
          lng: currentUserLocation.lng,
        },
        targetLocation: roomSettings.targetLocation,
        startedAt: tripStateRef.current.startedAt,
        endedAt: Date.now(),
        path: finalPath,
      });
      setShowTripModal(true);
    }
  }, [currentUserLocation, roomSettings, calculateDistance, currentRoom, tripPath]);

  useEffect(() => {
    if (!waitingForLogin || !pendingTrip) return;

    const checkLogin = () => {
      const authUser = getAuthUser();
      if (authUser?.idToken) {
        saveTripRequest(authUser, pendingTrip, tripName);
      }
    };

    const interval = setInterval(checkLogin, 1500);
    return () => clearInterval(interval);
  }, [waitingForLogin, pendingTrip, tripName]);

  const saveTripRequest = async (tripData, name) => {
    try {
      const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
      const response = await fetch(`${API_URL}/api/trips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          ...tripData,
          tripName: name || "My Trip",
          durationMs: tripData.endedAt - tripData.startedAt,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save trip");
      }

      setShowTripModal(false);
      setWaitingForLogin(false);
      setPendingTrip(null);
      setTripName("");
    } catch (err) {
      console.error("Trip save error:", err);
    }
  };

  const handleTripSave = async () => {
    if (!pendingTrip) return;
    await saveTripRequest(pendingTrip, tripName);
  };

  const runTripSearch = async (query) => {
    if (!query.trim()) {
      setTripSuggestions([]);
      setTripSearchError("");
      return;
    }

    setIsTripSearching(true);
    setTripSearchError("");

    try {
      const results = await placesService.searchPlaces(
        query.trim(),
        currentUserLocation,
        2000,
        { cityOnly: false }
      );
      setTripSuggestions(results);
      if (results.length === 0) {
        setTripSearchError("No results found");
      }
    } catch (err) {
      setTripSearchError("Search failed");
    } finally {
      setIsTripSearching(false);
    }
  };

  const handleTripSearch = async () => {
    await runTripSearch(tripQuery);
  };

  useEffect(() => {
    const trimmed = tripQuery.trim();
    if (!trimmed) {
      setTripSuggestions([]);
      setTripSearchError("");
      lastSelectedTripQueryRef.current = "";
      return;
    }

    if (suppressTripSearchRef.current) {
      suppressTripSearchRef.current = false;
      return;
    }

    if (lastSelectedTripQueryRef.current && trimmed === lastSelectedTripQueryRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      runTripSearch(trimmed);
    }, 350);

    return () => clearTimeout(timer);
  }, [tripQuery]);

  const handleSelectTripPlace = (place) => {
    suppressTripSearchRef.current = true;
    lastSelectedTripQueryRef.current = place.name;
    updateRoomSettings({
      targetLocation: { lat: place.lat, lng: place.lng },
      targetLabel: place.name,
    });
    setTripSuggestions([]);
    setTripSearchError("");
    setTripQuery(place.name);
  };

  const modeLabel = roomSettings?.mode === "tracking"
    ? "Tracking"
    : roomSettings?.mode === "trip"
      ? "Trip"
      : "Crowd";

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
        if (roomSettings?.targetLocation?.lat != null) {
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

  const copyJoinUrl = () => {
    const joinUrl = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(joinUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const handleMobileWalkieStart = () => {
    setIsTalkingMobile(true);
    window.dispatchEvent(new CustomEvent('mobileWalkieStart'));
  };
  const handleMobileWalkieStop = () => {
    setIsTalkingMobile(false);
    window.dispatchEvent(new CustomEvent('mobileWalkieStop'));
  };

  return (
    <div className="room-page">
      <div className="room-earth-bg"></div>
      <div className="room-shell">

        {/* ======= PREMIUM MOBILE UI ======= */}
        {isMobile ? (
          <>
            {/* Mobile Topbar */}
            <div className="mob-topbar">
              <span className="mob-topbar-logo">Coordinator</span>
              <div className="mob-room-dropdown-wrap">
                <div
                  className="mob-topbar-room"
                  onClick={() => {
                    setShowMembersPanel(v => !v);
                    setShowLayersPanel(false);
                    setShowSharePanel(false);
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span className="mob-room-label">Room ID</span>
                    <span className="mob-room-id">{roomId}</span>
                  </div>
                  {roomSettings?.mode && (
                    <span className={`mob-mode-chip ${roomSettings.mode}`}>
                      {roomSettings.mode === "tracking" ? "TRK" : roomSettings.mode === "trip" ? "TRP" : "CRW"}
                    </span>
                  )}
                  <span className="mob-room-badge">{locations.length}</span>
                  <div className={`mob-room-arrow ${showMembersPanel ? 'open' : ''}`}>▼</div>
                </div>

                {/* Members Dropdown Panel — same width as chip */}
                {showMembersPanel && (
                  <div className="mob-members-panel mob-members-panel--docked">
                    <div className="mob-members-header">
                      <span className="mob-members-header-icon">👥</span>
                      <span className="mob-members-header-title">Members</span>
                      <span className="mob-members-header-count">{memberList.length}</span>
                    </div>
                <div className="mob-members-list">
                  {memberList.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', padding: '12px 0' }}>
                      Waiting for members…
                    </div>
                  ) : memberList.map((member) => {
                    const isCurrentUser = member.userId === user?.userId;
                    const avatarClass = member.isHost ? 'host' : isCurrentUser ? 'self' : 'member';
                    return (
                      <div key={member.userId} className="mob-member-item">
                        <div className={`mob-member-avatar ${avatarClass}`}>
                          {(member.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="mob-member-info">
                          <div className="mob-member-name">{member.name}{isCurrentUser ? ' (You)' : ''}</div>
                          {member.distance != null && (
                            <div className="mob-member-sub">{formatDistance(member.distance)} from host</div>
                          )}
                        </div>
                        {member.isHost && <span className="mob-member-role host">HOST</span>}
                        {isCurrentUser && !member.isHost && <span className="mob-member-role you">YOU</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mob-members-footer">
                  <div className="mob-profile-avatar-placeholder">
                    {(user?.name || 'G').charAt(0).toUpperCase()}
                  </div>
                  <div className="mob-profile-info">
                    <div className="mob-profile-name">{user?.name || 'Guest'}</div>
                    <div className="mob-profile-role-text">Member · {locationStatus === 'active' ? '📍 Live' : locationStatus === 'prompt' ? '⏳ GPS…' : '📵 Off'}</div>
                  </div>
                  <div className={`mob-live-dot ${locationStatus === 'active' ? '' : 'inactive'}`} title={locationStatus === 'active' ? 'Live' : 'GPS Inactive'} />
                </div>{/* end mob-members-footer */}
                  </div>{/* end mob-members-panel */}
              )}
              </div>{/* end mob-room-dropdown-wrap */}
            </div>{/* end mob-topbar */}

            {/* Trip Mode - destination search bar */}
            {roomSettings?.mode === "trip" && (
              <div className="mob-trip-bar">
                <div className="mob-trip-bar-row">
                  <input
                    type="text"
                    value={tripQuery}
                    onChange={(e) => setTripQuery(e.target.value)}
                    placeholder="🗺️ Search destination..."
                    className="mob-trip-input"
                  />
                  <button
                    type="button"
                    className="mob-trip-go-btn"
                    onClick={handleTripSearch}
                    disabled={isTripSearching}
                  >
                    {isTripSearching ? "..." : "Go"}
                  </button>
                </div>
                {tripSearchError && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', marginTop: 4 }}>{tripSearchError}</div>}
                {tripSuggestions.length > 0 && (
                  <div className="trip-suggestions" style={{ marginTop: 6 }}>
                    {tripSuggestions.map((place) => (
                      <button key={place.placeId} type="button" className="trip-suggestion" onClick={() => handleSelectTripPlace(place)}>
                        <span className="trip-suggestion-name">{place.name}</span>
                        <span className="trip-suggestion-address">{place.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Left Vertical Icon Toolbar */}
            <div className="mob-icon-toolbar" onClick={() => setShowMembersPanel(false)}>

              {/* SOS */}
              {roomSettings?.mode !== "trip" && (
                <button
                  className="mob-icon-btn sos"
                  data-tooltip="Emergency SOS"
                  onClick={() => document.querySelector('.sos-fab-btn-hidden')?.click()}
                >
                  <span className="mob-sos-label">SOS</span>
                </button>
              )}

              {/* GPS Status Button */}
              <button
                className={`mob-icon-btn tool mob-gps-btn ${locationStatus}`}
                data-tooltip={locationStatus === 'active' ? 'GPS Live' : locationStatus === 'prompt' ? 'Acquiring…' : 'Enable GPS'}
                onClick={locationStatus !== 'active' ? startLocationTracking : undefined}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              </button>

              {/* Layers */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`mob-icon-btn tool ${showLayersPanel ? 'active' : ''}`}
                  data-tooltip="Map Layers"
                  onClick={() => { setShowLayersPanel(v => !v); setShowSharePanel(false); setShowMembersPanel(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
                  </svg>
                </button>
                {showLayersPanel && (
                  <div className="mob-layers-panel">
                    <button
                      className={`mob-layer-option ${(roomSettings?.mapStyle || 'osm') === 'osm' ? 'active' : ''}`}
                      onClick={() => { updateRoomSettings({ mapStyle: 'osm' }); setShowLayersPanel(false); }}
                    >
                      <span className="mob-layer-icon">🗺️</span> Standard
                    </button>
                    <button
                      className={`mob-layer-option ${roomSettings?.mapStyle === 'satellite' ? 'active' : ''}`}
                      onClick={() => { updateRoomSettings({ mapStyle: 'satellite' }); setShowLayersPanel(false); }}
                    >
                      <span className="mob-layer-icon">🛰️</span> Satellite
                    </button>
                  </div>
                )}
              </div>

              {/* Share */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`mob-icon-btn tool ${showSharePanel ? 'active' : ''}`}
                  data-tooltip="Share"
                  onClick={() => { setShowSharePanel(v => !v); setShowLayersPanel(false); setShowMembersPanel(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                  </svg>
                </button>
                {showSharePanel && (
                  <div className="mob-share-panel">
                    <button className={`mob-share-option ${urlCopied ? 'copied' : ''}`} onClick={() => { copyJoinUrl(); setShowSharePanel(false); }}>
                      📋 {urlCopied ? 'Copied!' : 'Copy URL'}
                    </button>
                  </div>
                )}
              </div>

              {/* Battery Saver */}
              <button
                className={`mob-icon-btn tool ${batterySaver ? 'active' : ''}`}
                data-tooltip={batterySaver ? "Saver ON" : "Battery Saver"}
                onClick={() => setBatterySaver(v => !v)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zm-1.67 8h-2v2h-1v-2H9v-1h2V9h1v2h2v1z"/>
                </svg>
              </button>

              <div className="mob-toolbar-sep" />

              {/* Leave */}
              <button
                className="mob-icon-btn leave"
                data-tooltip="Leave Room"
                onClick={handleLeaveRoom}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </button>
            </div>

            {/* GPS acquiring banner - compact */}
            {locationStatus === 'prompt' && (
              <div className="mob-gps-acquiring">
                <span className="mob-gps-spin">⏳</span>
                <span>Acquiring GPS signal…</span>
              </div>
            )}
            {locationStatus === 'error' && (
              <div className="mob-gps-error-bar">
                <span>⚠️ {locationError || 'GPS unavailable'}</span>
                <button onClick={startLocationTracking}>Retry</button>
              </div>
            )}

            {/* Walkie-talkie active badge */}
            {isTalkingMobile && <div className="mob-walkie-talking">🎙️ Transmitting...</div>}

            {/* Target navigation mini bar */}
            {roomSettings?.targetLocation?.lat != null && targetInfo && (
              <div className="mob-target-mini">
                <div className="mob-target-chip">
                  <span className="mob-target-chip-label">Dist</span>
                  <span className="mob-target-chip-val">{formatDistance(targetInfo.distance)}</span>
                </div>
                <div className="mob-target-sep" />
                <div className="mob-target-chip">
                  <span className="mob-target-chip-label">Bear</span>
                  <span className="mob-target-chip-val">{targetInfo.bearingLabel}</span>
                </div>
                <div className="mob-target-sep" />
                <div className="mob-target-chip">
                  <span className="mob-target-chip-label">ETA</span>
                  <span className="mob-target-chip-val">~{targetInfo.etaMinutes}m</span>
                </div>
              </div>
            )}

            {/* Mobile Walkie-Talkie FAB (right bottom) */}
            {roomSettings?.mode !== "trip" && (
              <button
                className={`mob-walkie-fab ${isTalkingMobile ? 'talking' : ''}`}
                onMouseDown={handleMobileWalkieStart}
                onMouseUp={handleMobileWalkieStop}
                onTouchStart={(e) => { e.preventDefault(); handleMobileWalkieStart(); }}
                onTouchEnd={(e) => { e.preventDefault(); handleMobileWalkieStop(); }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
                </svg>
              </button>
            )}

          </>
        ) : (
          /* ======= DESKTOP UI (unchanged) ======= */
          <>
            <div className={`room-topbar`}>
              <div className="room-topbar-left">
                <span>Group: {roomId}</span>
                <span className="muted">{locations.length} member{locations.length !== 1 ? 's' : ''}</span>
                <span className="room-mode-pill">Mode: {modeLabel}</span>
                {(roomSettings?.mode === "tracking" || roomSettings?.mode === "trip") && (
                  <span className="room-range-pill">Range: {roomSettings.trackingRange ?? 30}m</span>
                )}
              </div>
              <div className="room-topbar-right">
                <button
                  className={`soft-pill-btn battery ${batterySaver ? 'active' : ''}`}
                  onClick={() => setBatterySaver(!batterySaver)}
                  title={batterySaver ? "Disable Battery Saver" : "Enable Battery Saver"}
                >
                  {batterySaver ? "🔋 Saver On" : "🪫 Saver Off"}
                </button>
                <button className="soft-pill-btn leave" onClick={handleLeaveRoom}>LEAVE</button>
              </div>
            </div>
          </>
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
            showLines={roomSettings?.mode === "crowd" || roomSettings?.targetLocation?.lat != null}
            centerOnUsers={true}
            targetLocation={roomSettings?.targetLocation?.lat != null ? roomSettings.targetLocation : null}
            roomSettings={roomSettings}
            tripPath={roomSettings?.mode === "trip" ? tripPath : null}
            savedTripPath={savedTripPath}
          />
        </div>

        {/* Members Panel */}
        {!isMobile && memberList.length > 0 && (
          <div className="room-members-panel">
            <div className="room-members-title">Group Members ({memberList.length})</div>
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              {memberList.map((member) => {
                const isCurrentUser = member.userId === user?.userId;
                return (
                  <div key={member.userId + "_" + member.name} className="member-row">
                    <div className="member-left-side">
                      <span className="status-dot live"></span>
                      <div className="member-name-wrap">
                        <span className="member-name">
                          {member.name} {isCurrentUser ? " (You)" : ""}
                        </span>
                        {member.distance !== null && (
                          <span className="member-status-text">
                            {formatDistance(member.distance)} from you
                          </span>
                        )}
                      </div>
                    </div>
                    {member.isHost && <span className="member-role-host">Host</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Walkie Talkie */}
        {currentRoom && user && roomSettings?.mode !== "trip" && (
          <LiveChat
            roomId={roomId}
            members={memberList}
            currentUserId={user?.userId}
          />
        )}

        {showTripModal && pendingTrip && (
          <div className="modal-backdrop-custom">
            <div className="custom-modal">
              <div className="modal-head">
                <div className="modal-icon">🧭</div>
                <h2>Trip Complete</h2>
                <p>Name your trip to save it</p>
              </div>

              <div className="input-group">
                <label>Trip Name</label>
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="Evening Walk"
                />
              </div>

              {waitingForLogin && (
                <div className="home-error">Login required. Use the menu to sign in.</div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn secondary"
                  onClick={() => {
                    setShowTripModal(false);
                    setWaitingForLogin(false);
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="modal-btn primary"
                  onClick={handleTripSave}
                >
                  Save Trip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Saved Trip Floating Badge */}
        {savedTripPath && (
          <div className="active-saved-trip-badge">
            <span className="badge-icon">🧭</span>
            <div className="badge-text">
              <span className="badge-label">Viewing Saved Trip</span>
              <span className="badge-name">{selectedSavedTrip?.tripName || "Unnamed Trip"}</span>
            </div>
            <button 
              className="badge-close-btn" 
              onClick={() => { 
                setSavedTripPath(null); 
                setSelectedSavedTrip(null); 
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Emergency SOS Overlay */}
        {roomSettings?.mode !== "trip" && (
          <SOSOverlay currentLocation={locations.find(loc => loc.userId === user?.userId)} />
        )}
      </div>
    </div>
  );
}
