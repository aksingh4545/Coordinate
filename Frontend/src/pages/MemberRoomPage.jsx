import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
import SOSOverlay from "../components/SOSOverlay";
import { LocationSmoother } from "../utils/locationSmoother";
import { placesService } from "../utils/placesService";
import { getAuthUser } from "../utils/authStorage";
import { getSocketUrl } from "../utils/apiConfig";
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
    members,
    setMembers,
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
  const [isAdjustingLocation, setIsAdjustingLocation] = useState(false);
  const [isTargeting, setIsTargeting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showTargetNav, setShowTargetNav] = useState(false);
  const [showTripHeader, setShowTripHeader] = useState(true);
  const mapRef = useRef(null);
  const [tripQuery, setTripQuery] = useState("");
  const [tripSuggestions, setTripSuggestions] = useState([]);
  const [isTripSearching, setIsTripSearching] = useState(false);
  const [tripSearchError, setTripSearchError] = useState("");
  const [showTripSearch, setShowTripSearch] = useState(true);
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
  const locationSmootherRef = useRef(new LocationSmoother({ minAccuracy: 2500 }));
  const handleLocationUpdateRef = useRef(null);
  // UI states
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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

  const hasRejoinedRef = useRef(false);
  useEffect(() => {
    if (!roomId) return;
    
    if (!user || !user.name) {
      console.log("No user session found, redirecting to join page");
      navigate(`/join/${roomId}`);
      return;
    }

    if (!hasRejoinedRef.current) {
      hasRejoinedRef.current = true;
      joinRoom(roomId.toUpperCase(), user.name).catch((err) => {
        console.error("Failed to rejoin room:", err);
        navigate(`/join/${roomId}`);
      });
    }
  }, [roomId, user?.name, navigate]);

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
    // Sync locations immediately on mount, then periodically - throttled in battery saver mode
    syncRoomLocations();
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

  // Keep callback updated to prevent stale closures in watchPosition/getCurrentPosition
  useEffect(() => {
    handleLocationUpdateRef.current = handleLocationUpdate;
  });

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
      if (handleLocationUpdateRef.current) {
        handleLocationUpdateRef.current(latitude, longitude, accuracy, speed);
      }
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
        // Clear stuck watch session and schedule a retry
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        if (retryTimeoutRef.current === null) {
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null;
            startLocationTracking();
          }, 5000);
        }
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
      // ⚡ High Accuracy Mode: Force browser to perform high-accuracy Wi-Fi/GPS triangulation immediately
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          console.warn("High-accuracy initial fix failed, falling back to standard:", err);
          navigator.geolocation.getCurrentPosition(onSuccess, onError, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 5000,
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );

      watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      });
    }
  };

  const handleLocateMe = () => {
    const myLoc = locations.find(l => l.userId === user?.userId);
    if (myLoc?.lat && myLoc?.lng && mapRef.current?.getMap) {
      mapRef.current.getMap().setView([myLoc.lat, myLoc.lng], 16, { animate: true });
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy, speed } = pos.coords;
          if (handleLocationUpdateRef.current) {
            handleLocationUpdateRef.current(latitude, longitude, accuracy, speed);
          }
          if (mapRef.current?.getMap) {
            mapRef.current.getMap().setView([latitude, longitude], 16, { animate: true });
          }
        },
        (err) => console.warn("Locate me error:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
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
  }, [currentRoom?.roomId, user?.userId, socket, setError, batterySaver]);

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
      const API_URL = getSocketUrl();
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

  const handleMobileTripSearch = async () => {
    if (!tripQuery.trim()) return;
    setIsTripSearching(true);
    setTripSearchError("");
    try {
      const results = await placesService.searchPlaces(
        tripQuery.trim(),
        currentUserLocation,
        2000,
        { cityOnly: false }
      );
      if (results.length > 0) {
        handleSelectTripPlace(results[0]);
        setShowTripSearch(false);
      } else {
        setTripSearchError("No results found");
      }
    } catch (err) {
      setTripSearchError("Search failed");
    } finally {
      setIsTripSearching(false);
    }
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
    if (!user) return;
    const allUsersMap = new Map();
    const hostId = currentRoom?.hostId;

    // 1. Current user
    allUsersMap.set(user.userId, {
      userId: user.userId,
      name: user.name || "Member",
      isHost: user.userId === hostId,
      role: user.userId === hostId ? "host" : (currentRoom?.role || "member"),
      lat: 0,
      lng: 0,
    });

    // 2. Add members from room members state
    if (members && Array.isArray(members)) {
      members.forEach((m) => {
        if (!m || !m.userId) return;
        const isThisHost = m.userId === hostId || m.role === "host" || m.isHost;
        const existing = allUsersMap.get(m.userId) || {};
        allUsersMap.set(m.userId, {
          ...existing,
          ...m,
          name: m.name || existing.name || "Member",
          isHost: isThisHost,
          role: isThisHost ? "host" : (m.role || "member"),
          lat: m.location?.lat ?? existing.lat ?? 0,
          lng: m.location?.lng ?? existing.lng ?? 0,
        });
      });
    }

    // 3. Overlay active locations
    if (locations && Array.isArray(locations)) {
      locations.forEach((loc) => {
        if (!loc || !loc.userId) return;
        const isThisHost = loc.userId === hostId || loc.isHost || allUsersMap.get(loc.userId)?.isHost;
        const existing = allUsersMap.get(loc.userId) || {};
        allUsersMap.set(loc.userId, {
          ...existing,
          ...loc,
          name: loc.name || existing.name || "Member",
          isHost: isThisHost,
          lat: loc.lat ?? existing.lat ?? 0,
          lng: loc.lng ?? existing.lng ?? 0,
        });
      });
    }

    // If host is known from currentRoom but not yet in allUsersMap, ensure host is listed!
    if (hostId && !allUsersMap.has(hostId)) {
      allUsersMap.set(hostId, {
        userId: hostId,
        name: currentRoom.hostName || "Host",
        isHost: true,
        role: "host",
        lat: 0,
        lng: 0,
      });
    }

    const hostEntry = hostId ? allUsersMap.get(hostId) : Array.from(allUsersMap.values()).find(u => u.isHost);
    const hasHostValidLoc = hostEntry && hostEntry.lat !== 0 && hostEntry.lng !== 0;

    const updatedMembers = Array.from(allUsersMap.values()).map((member) => {
      let nearestDistance = null;
      const hasValidLoc = member.lat !== 0 && member.lng !== 0 && member.lat != null && member.lng != null;

      if (hasValidLoc) {
        allUsersMap.forEach((other) => {
          if (other.userId === member.userId) return;
          if (!other.lat || !other.lng || other.lat === 0 || other.lng === 0) return;
          const dist = calculateDistance(member.lat, member.lng, other.lat, other.lng);
          if (nearestDistance === null || dist < nearestDistance) {
            nearestDistance = dist;
          }
        });
      }

      const distanceLabels = [];
      if (nearestDistance !== null) {
        distanceLabels.push(`Nearest ${formatDistance(nearestDistance)}`);
      }
      if (hasValidLoc && roomSettings?.targetLocation?.lat != null) {
        const targetDist = calculateDistance(
          member.lat,
          member.lng,
          roomSettings.targetLocation.lat,
          roomSettings.targetLocation.lng
        );
        distanceLabels.push(`Target ${formatDistance(targetDist)}`);
      }

      let distanceToHost = null;
      if (hasValidLoc && hasHostValidLoc && member.userId !== hostId) {
        distanceToHost = calculateDistance(
          hostEntry.lat,
          hostEntry.lng,
          member.lat,
          member.lng
        );
      }

      return {
        ...member,
        distance: distanceToHost,
        nearestDistance,
        distanceLabels,
        isHost: member.userId === hostId || member.isHost || member.role === "host",
        hasValidLoc,
      };
    });

    setMemberList(updatedMembers);
  }, [locations, members, user, currentRoom, calculateDistance, formatDistance, roomSettings]);

  const handleLeaveRoom = async () => {
    if (window.confirm("Are you sure you want to leave this group?")) {
      await leaveRoom();
      navigate("/");
    }
  };

  const handleMapClick = (latlng) => {
    if (isAdjustingLocation) {
      if (handleLocationUpdateRef.current) {
        handleLocationUpdateRef.current(latlng.lat, latlng.lng, 10, 0);
      }
      setIsAdjustingLocation(false);
      setLocationStatus("active");
      setLocationError("");
    } else if (isTargeting) {
      updateRoomSettings({
        targetLocation: { lat: latlng.lat, lng: latlng.lng },
        targetLabel: "Pinned location",
      });
      setIsTargeting(false);
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

        {/* ======= UNIFIED DESKTOP & MOBILE TOPBAR ======= */}
        <div className="mob-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'auto' }}>
            <span className="mob-topbar-logo">Coordinator</span>
          </div>

          {/* Room chip + dropdown wrapper */}
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
              <span className="mob-room-badge">{memberList.length}</span>
              <div className={`mob-room-arrow ${showMembersPanel ? 'open' : ''}`}>▼</div>
            </div>

            {/* Members Dropdown Panel */}
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
                          {isCurrentUser ? (
                            <div className="mob-member-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span className={`mob-live-dot ${locationStatus === 'active' ? '' : 'inactive'}`} style={{ width: 6, height: 6, margin: 0, boxShadow: locationStatus === 'active' ? '0 0 4px rgba(34,197,94,0.8)' : 'none', animation: locationStatus === 'active' ? 'livePulse 2s ease-in-out infinite' : 'none' }} />
                              <span>{locationStatus === 'active' ? 'Live' : locationStatus === 'prompt' ? 'GPS…' : 'Off'}</span>
                            </div>
                          ) : (
                            member.distance != null ? (
                              <div className="mob-member-sub">{formatDistance(member.distance)} from host</div>
                            ) : (
                              <div className="mob-member-sub" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem' }}>
                                {member.hasValidLoc ? 'Live' : 'Locating GPS…'}
                              </div>
                            )
                          )}
                        </div>
                        {member.isHost && <span className="mob-member-role host">HOST</span>}
                        {isCurrentUser && !member.isHost && <span className="mob-member-role you">YOU</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* User Account Menu Pill */}
          <div className="menu-wrap" style={{ pointerEvents: 'auto', position: 'relative' }}>
            <button
              type="button"
              className="user-pill-btn"
              onClick={() => setShowMenu(prev => !prev)}
              aria-label="Open account menu"
            >
              {user?.picture ? (
                <img className="user-pill-avatar" src={user.picture} alt="" />
              ) : (
                <span className="user-pill-avatar-placeholder">👤</span>
              )}
              <span className="user-pill-name">
                {user ? (user.name?.split(' ')[0] || 'Member') : 'Member'}
              </span>
              <span className="user-pill-arrow">▼</span>
            </button>
            {showMenu && <AuthMenu />}
          </div>
        </div>

        {/* Trip Mode - destination search bar */}
        {roomSettings?.mode === "trip" && (
          showTripSearch ? (
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
                  onClick={handleMobileTripSearch}
                  disabled={isTripSearching}
                >
                  {isTripSearching ? "..." : "Go"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTripSearch(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    padding: '0 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Collapse"
                >
                  ✕
                </button>
              </div>
              {tripSearchError && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', marginTop: 4 }}>{tripSearchError}</div>}
              {tripSuggestions.length > 0 && (
                <div className="trip-suggestions" style={{ marginTop: 6 }}>
                  {tripSuggestions.map((place) => (
                    <button
                      key={place.placeId}
                      type="button"
                      className="trip-suggestion"
                      onClick={() => {
                        handleSelectTripPlace(place);
                        setShowTripSearch(false);
                      }}
                    >
                      <span className="trip-suggestion-name">{place.name}</span>
                      <span className="trip-suggestion-address">{place.address}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              className="mob-trip-search-toggle-btn"
              onClick={() => setShowTripSearch(true)}
              style={{
                position: 'absolute',
                top: '60px',
                left: '10px',
                zIndex: 150,
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(13, 17, 35, 0.85)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                cursor: 'pointer',
                animation: 'panelSlideDown 0.2s ease-out'
              }}
              title="Search Destination"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '20px', height: '20px' }}>
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
          )
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

          {/* Locate Me */}
          <button
            className="mob-icon-btn tool"
            data-tooltip="Locate Me (GPS)"
            onClick={handleLocateMe}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </button>

          {/* Set Target */}
          {roomSettings?.mode !== "trip" && (
            <button
              className={`mob-icon-btn tool ${roomSettings?.targetLocation?.lat != null || isTargeting ? 'active' : ''}`}
              data-tooltip={roomSettings?.targetLocation?.lat != null ? "Clear Target" : isTargeting ? "Click map to set target" : "Set Target (Meeting Point)"}
              onClick={() => {
                if (roomSettings?.targetLocation?.lat != null) {
                  updateRoomSettings({ targetLocation: null, targetLabel: null });
                  setIsTargeting(false);
                } else if (isTargeting) {
                  setIsTargeting(false);
                } else {
                  setIsTargeting(true);
                  setIsAdjustingLocation(false);
                }
              }}
              style={{ color: (roomSettings?.targetLocation?.lat != null || isTargeting) ? '#f59e0b' : undefined }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/>
              </svg>
            </button>
          )}

          {/* Adjust Pin / Laptop location fix */}
          <button
            className={`mob-icon-btn tool ${isAdjustingLocation ? 'active' : ''}`}
            data-tooltip={isAdjustingLocation ? "Click map to set pin" : "Adjust My Pin"}
            onClick={() => {
              setIsAdjustingLocation(v => !v);
              setIsTargeting(false);
            }}
            style={{ color: isAdjustingLocation ? '#38bdf8' : undefined }}
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

        {/* Room Warning Banner (Floating) */}
        {roomWarning && (
          <div
            className="room-warning-banner"
            onClick={clearWarning}
            style={{
              position: 'absolute',
              top: '65px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 250,
              cursor: 'pointer',
            }}
          >
            <span className="warning-title">Warning</span>
            <span className="warning-text">
              {roomWarning.message} ({'>'}{roomWarning.range}m away)
            </span>
            <span className="warning-close">Dismiss</span>
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

        {/* Target Location Setting Banner */}
        {isTargeting && (
          <div style={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '8px 16px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: '0.82rem',
            backdropFilter: 'blur(8px)',
          }}>
            <span>🎯 <b>Click anywhere on map</b> to set group target point</span>
            <button
              onClick={() => setIsTargeting(false)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#fff',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Pin Location Banner */}
        {isAdjustingLocation && (
          <div style={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #38bdf8',
            borderRadius: '12px',
            padding: '8px 16px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: '0.82rem',
            backdropFilter: 'blur(8px)',
          }}>
            <span>📍 <b>Click anywhere on map</b> to set your location pin</span>
            <button
              onClick={() => setIsAdjustingLocation(false)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#fff',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Cancel
            </button>
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
            onMapClick={handleMapClick}
            isTargeting={isTargeting || isAdjustingLocation}
            roomSettings={roomSettings}
            tripPath={roomSettings?.mode === "trip" ? tripPath : null}
            savedTripPath={savedTripPath}
          />
        </div>

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
