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
  const suppressTripSearchRef = useRef(false);
  const lastSelectedTripQueryRef = useRef("");
  const locationSmootherRef = useRef(new LocationSmoother());
  const tripStateRef = useRef({
    active: false,
    startedAt: null,
    startLocation: null,
    lastPoint: null,
    completed: false,
  });
  const tripPathRef = useRef([]);
  const arrivalThresholdMeters = 50;
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

  const currentUserLocation = locations.find((loc) => loc.userId === user?.userId) || null;

  useEffect(() => {
    // Sync locations periodically
    const syncInterval = setInterval(() => {
      syncRoomLocations();
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [syncRoomLocations]);

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
    const { lat, lng } = locationSmootherRef.current.filter(latitude, longitude, accuracy, speed);

    if (socket) {
      socket.emit("location:update", {
        userId: user.userId,
        roomId: currentRoom.roomId,
        lat: lat,
        lng: lng,
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
          lat: lat,
          lng: lng,
          isHost: false,
        },
      ];
    });
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
      // Validate freshness to block mobile browser stale cached readings
      if (position.timestamp && Date.now() - position.timestamp > 15000) {
        console.log("⚠️ Stale GPS reading cached by browser, ignoring");
        return;
      }
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

    // Get immediate position first (before starting to watch)
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    // Then start continuous watching (strictly fresh, no cached locations allowed)
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
    if (roomSettings?.mode !== "trip" || !roomSettings?.targetLocation) {
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
    if (!roomSettings?.targetLocation) return;
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

  const saveTripRequest = async (authUser, tripData, name) => {
    if (!authUser?.idToken) return;

    try {
      const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
      const response = await fetch(`${API_URL}/api/trips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authUser.idToken}`,
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
    const authUser = getAuthUser();
    if (!authUser?.idToken) {
      setWaitingForLogin(true);
      return;
    }
    await saveTripRequest(authUser, pendingTrip, tripName);
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
                    {roomSettings.mode === "tracking" ? "TRK" : roomSettings.mode === "trip" ? "TRP" : "CRW"}
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
                  Mode: {modeLabel}
                </span>
                {roomSettings?.mode === "tracking" && (
                  <span className="room-range-pill">Range: {roomSettings.trackingRange ?? 30}m</span>
                )}
              </div>
              <div className="room-topbar-right">
                <button className="soft-pill-btn leave" onClick={handleLeaveRoom}>LEAVE</button>
              </div>
            </>
          )}
        </div>

        {isMobile && roomSettings?.mode === "trip" && showTripHeader && (
          <div className="trip-header-overlay">
            <div className="trip-header-row">
              <input
                type="text"
                value={tripQuery}
                onChange={(e) => setTripQuery(e.target.value)}
                placeholder="Search destination"
                className="trip-header-input"
              />
              <button
                type="button"
                className="trip-header-btn"
                onClick={handleTripSearch}
                disabled={isTripSearching}
              >
                {isTripSearching ? "..." : "Go"}
              </button>
            </div>
            {tripSearchError && <div className="trip-header-hint">{tripSearchError}</div>}
            {tripSuggestions.length > 0 && (
              <div className="trip-suggestions">
                {tripSuggestions.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    className="trip-suggestion"
                    onClick={() => handleSelectTripPlace(place)}
                  >
                    <span className="trip-suggestion-name">{place.name}</span>
                    <span className="trip-suggestion-address">{place.address}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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

            <div className="option-item">
              <span className="option-label">Mode</span>
              <span className="option-value">{modeLabel}</span>
            </div>

            {roomSettings?.mode === "trip" && (
              <div className="option-item trip-search">
                <span className="option-label">Trip Destination</span>
                <div className="trip-search-row">
                  <input
                    type="text"
                    className="option-input"
                    value={tripQuery}
                    onChange={(e) => setTripQuery(e.target.value)}
                    placeholder="Type a place or address"
                  />
                  <button
                    type="button"
                    className="option-btn"
                    onClick={handleTripSearch}
                    disabled={isTripSearching}
                  >
                    {isTripSearching ? "..." : "Go"}
                  </button>
                </div>
                {tripSearchError && <span className="option-hint">{tripSearchError}</span>}
                {tripSuggestions.length > 0 && (
                  <div className="trip-suggestions">
                    {tripSuggestions.map((place) => (
                      <button
                        key={place.placeId}
                        type="button"
                        className="trip-suggestion"
                        onClick={() => handleSelectTripPlace(place)}
                      >
                        <span className="trip-suggestion-name">{place.name}</span>
                        <span className="trip-suggestion-address">{place.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {roomWarning && (
              <div className="option-item warning-option" onClick={() => { clearWarning(); setShowOptions(false); }}>
                <span className="option-label">⚠️ Warning</span>
                <span className="option-value">Dismiss</span>
              </div>
            )}
            <div className="option-item" onClick={() => { 
              if (roomSettings?.mode === "trip") {
                setTripQuery("");
                setShowOptions(false);
                setShowTripHeader(false);
              }
              setShowTargetNav(!showTargetNav); 
              setShowOptions(false);
            }}>
              <span className="option-label">📍 Target Nav</span>
              <span className="option-value">{showTargetNav ? "Hide" : "Show"}</span>
            </div>

            <div className="option-item leave-option" onClick={() => { handleLeaveRoom(); setShowOptions(false); }}>
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
