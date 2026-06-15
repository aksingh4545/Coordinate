import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
import SOSOverlay from "../components/SOSOverlay";
import AuthMenu from "../components/AuthMenu";
import { LocationSmoother, GpsAccuracyManager } from "../utils/locationSmoother";
import { placesService } from "../utils/placesService";
import { getAuthHeaders, getAuthUser } from "../utils/authStorage";
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
  const [showWatchPanel, setShowWatchPanel] = useState(false);
  const [watchQrCode, setWatchQrCode] = useState("");
  const [watchers, setWatchers] = useState([]);
  const [memberList, setMemberList] = useState([]);
  const [showOptions, setShowOptions] = useState(false);
  const [showTargetNav, setShowTargetNav] = useState(false);
  const [showTripHeader, setShowTripHeader] = useState(true);
  const [isTargeting, setIsTargeting] = useState(false);
  const [tripQuery, setTripQuery] = useState("");
  const [tripSuggestions, setTripSuggestions] = useState([]);
  const [isTripSearching, setIsTripSearching] = useState(false);
  const [tripSearchError, setTripSearchError] = useState("");
  const [tripPath, setTripPath] = useState([]);
  const [controlsPanelOpen, setControlsPanelOpen] = useState(true);
  const [targetNavPanelOpen, setTargetNavPanelOpen] = useState(true);
  const [savedTripPath, setSavedTripPath] = useState(null);
  const [selectedSavedTrip, setSelectedSavedTrip] = useState(null);
  const [qrModalTab, setQrModalTab] = useState("join");
  const [batterySaver, setBatterySaver] = useState(false);
  const pollIntervalRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripName, setTripName] = useState("");
  const [pendingTrip, setPendingTrip] = useState(null);
  const [waitingForLogin, setWaitingForLogin] = useState(false);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [plannedRoutePoints, setPlannedRoutePoints] = useState([]); // Store calculated route path
  // New mobile UI state
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [isTalkingMobile, setIsTalkingMobile] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const suppressTripSearchRef = useRef(false);
  const lastSelectedTripQueryRef = useRef("");
  const mapRef = useRef(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const warningRef = useRef({ signature: null, sentAt: 0 });
  const locationSmootherRef = useRef(new LocationSmoother({ minAccuracy: 50 }));
  const accuracyManagerRef = useRef(new GpsAccuracyManager());
  
  const decodePolyline = (encoded) => {
    if (!encoded) return [];
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    
    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;
      
      shift = 0;
      result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;
      
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    
    return points;
  };

  const handlePlannedRouteUpdate = (encodedPolyline) => {
    if (!encodedPolyline) {
      setPlannedRoutePoints([]);
      return;
    }
    try {
      const decoded = decodePolyline(encodedPolyline);
      setPlannedRoutePoints(decoded);
    } catch (e) {
      console.log("Error decoding polyline:", e);
    }
  };

  const handleEndTripManually = () => {
    if (roomSettings?.mode !== "trip" || roomSettings?.targetLocation?.lat == null) return;
    if (!currentUserLocation) return;

    tripStateRef.current.completed = true;
    tripStateRef.current.active = false;

    // Use planned route path if available, fallback to walked path, fallback to start-end straight line
    let finalPath = [];
    if (plannedRoutePoints && plannedRoutePoints.length >= 2) {
      finalPath = plannedRoutePoints;
    } else if (tripPathRef.current.length) {
      finalPath = [...tripPathRef.current];
    } else {
      finalPath = [
        tripStateRef.current.startLocation,
        {
          lat: currentUserLocation.lat,
          lng: currentUserLocation.lng,
        }
      ].filter(Boolean);
    }

    setPendingTrip({
      roomId: currentRoom?.roomId,
      startLocation: tripStateRef.current.startLocation || {
        lat: currentUserLocation.lat,
        lng: currentUserLocation.lng,
      },
      endLocation: {
        lat: currentUserLocation.lat,
        lng: currentUserLocation.lng,
      },
      targetLocation: roomSettings.targetLocation,
      startedAt: tripStateRef.current.startedAt || Date.now(),
      endedAt: Date.now(),
      path: finalPath,
    });
    setShowTripModal(true);
  };

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

  const targetInfo = (() => {
    if (roomSettings?.targetLocation?.lat == null) return null;
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

  const currentUserLocation = locations.find((loc) => loc.userId === user?.userId) || null;

  const joinUrl = `${window.location.origin}/join/${roomId}`;
  const watchUrl = `${window.location.origin}/watch/${roomId}`;

  useEffect(() => {
    if (!roomId) return;
    if (!user) return;

    const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

    const restoreRoom = async () => {
      try {
        const response = await fetch(`${API_URL}/api/rooms/${roomId.toUpperCase()}`, {
          headers: { ...getAuthHeaders() },
        });
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
  }, [roomId, user, setCurrentRoom, updateRoomSettings]);

  useEffect(() => {
    // Generate QR code
    QRCode.toDataURL(joinUrl, { width: 256, height: 256 })
      .then(setQrCode)
      .catch((err) => console.error("QR generation error:", err));
  }, [roomId]);

  useEffect(() => {
    // Generate watch QR code
    QRCode.toDataURL(watchUrl, { width: 256, height: 256 })
      .then(setWatchQrCode)
      .catch((err) => console.error("Watch QR generation error:", err));
  }, [roomId]);

  // Fetch watchers periodically
  useEffect(() => {
    if (roomSettings?.mode !== "trip") return;
    
    const fetchWatchers = async () => {
      try {
        const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
        const response = await fetch(`${API_URL}/api/rooms/${roomId.toUpperCase()}`, {
          headers: { ...getAuthHeaders() },
        });
        const data = await response.json();
        if (data.success && data.room.members) {
          const watchersList = data.room.members.filter(m => m.role === "watcher");
          setWatchers(watchersList);
        }
      } catch (err) {
        console.error("Failed to fetch watchers:", err);
      }
    };

    fetchWatchers();
    const interval = setInterval(fetchWatchers, 5000);
    return () => clearInterval(interval);
  }, [roomId, roomSettings?.mode]);

  useEffect(() => {
    // Sync locations periodically - throttled in battery saver mode
    const interval = batterySaver ? 12000 : 3000;
    const syncInterval = setInterval(() => {
      syncRoomLocations();
    }, interval);

    return () => clearInterval(syncInterval);
  }, [syncRoomLocations, batterySaver]);

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
        maximumAge: 5000,
      });

      pollIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 5000,
        });
      }, 20000);
    } else {
      // ⚡ High Accuracy Mode: Continuous real-time GPS tracking (omit redundant getCurrentPosition)
      watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 5000,
      });
    }
  };

  useEffect(() => {
    if (!currentRoom || !user) {
      console.log('Waiting for dependencies:', { hasRoom: !!currentRoom, hasUser: !!user, hasSocket: !!socket });
      return;
    }

    console.log('📍 Starting location tracking for host:', user.userId, 'in room:', currentRoom.roomId, 'BatterySaver:', batterySaver);

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
        console.log("🔒 Host Screen Wake Lock acquired");
        
        wakeLockRef.current.addEventListener("release", () => {
          console.log("🔒 Host Screen Wake Lock was released");
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      console.warn("⚠️ Failed to acquire host wake lock:", err.message);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log("🔒 Host Screen Wake Lock released manually");
      } catch (err) {
        console.error("⚠️ Failed to release host wake lock:", err);
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

      // Use planned route path if available, fallback to walked path, fallback to start-end straight line
      let finalPath = [];
      if (plannedRoutePoints && plannedRoutePoints.length >= 2) {
        finalPath = plannedRoutePoints;
      } else if (tripPathRef.current.length) {
        finalPath = [...tripPathRef.current];
      } else {
        finalPath = [
          tripStateRef.current.startLocation || {
            lat: currentUserLocation.lat,
            lng: currentUserLocation.lng,
          },
          endPoint
        ].filter(Boolean);
      }

      setPendingTrip({
        roomId: currentRoom?.roomId,
        startLocation: tripStateRef.current.startLocation || {
          lat: currentUserLocation.lat,
          lng: currentUserLocation.lng,
        },
        endLocation: {
          lat: currentUserLocation.lat,
          lng: currentUserLocation.lng,
        },
        targetLocation: roomSettings.targetLocation,
        startedAt: tripStateRef.current.startedAt || Date.now(),
        endedAt: Date.now(),
        path: finalPath,
      });
      setShowTripModal(true);
    }
  }, [currentUserLocation, roomSettings, calculateDistance, currentRoom, tripPath, plannedRoutePoints]);

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
        if (roomSettings?.targetLocation?.lat != null) {
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

  // Listen for saved trip click to display on map
  useEffect(() => {
    console.log("HostRoomPage - useEffect mounted, checking state...");
    
    // Check for window.currentSavedTrip first (direct method)
    if (window.currentSavedTrip && window.currentSavedTrip.path) {
      console.log("HostRoomPage - Found currentSavedTrip on mount:", window.currentSavedTrip);
      setSavedTripPath(normalizeTripPath(window.currentSavedTrip.path));
      setSelectedSavedTrip(window.currentSavedTrip);
      window.currentSavedTrip = null;
    }
    
    const handleShowSavedTrip = (event) => {
      console.log("HostRoomPage - EVENT RECEIVED!");
      const trip = event.detail;
      console.log("HostRoomPage - Received showSavedTrip event:", trip);
      console.log("HostRoomPage - Path data:", trip?.path);
      const nextPath = normalizeTripPath(trip?.path);
      if (nextPath) {
        setSavedTripPath(nextPath);
        setSelectedSavedTrip(trip);
        console.log("HostRoomPage - savedTripPath set to:", nextPath);
        // Fit map to show the entire path
        if (mapRef.current && mapRef.current.getMap) {
          setTimeout(() => {
            try {
              const bounds = nextPath.map(p => [p.lat, p.lng]);
              mapRef.current.getMap().fitBounds(bounds, { padding: [50, 50] });
            } catch(e) {
              console.log("HostRoomPage - fitBounds error:", e);
            }
          }, 500);
        }
      }
    };

    window.addEventListener('showSavedTrip', handleShowSavedTrip);
    console.log("HostRoomPage - Event listener added");
    return () => {
      console.log("HostRoomPage - Event listener removed");
      window.removeEventListener('showSavedTrip', handleShowSavedTrip);
    };
  }, []);

  // Clear saved trip path when mode changes away from trip
  useEffect(() => {
    if (roomSettings?.mode !== "trip") {
      setSavedTripPath(null);
      setSelectedSavedTrip(null);
    }
  }, [roomSettings?.mode]);

  // Listen for close menu event
  useEffect(() => {
    const handleCloseMenu = () => {
      console.log("HostRoomPage - Closing menu");
      setShowMenu(false);
    };
    window.addEventListener('closeMenu', handleCloseMenu);
    return () => window.removeEventListener('closeMenu', handleCloseMenu);
  }, []);

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

  const modeLabel = roomSettings?.mode === "tracking"
    ? "Tracking"
    : roomSettings?.mode === "trip"
      ? "Trip"
      : "Crowd";

  const handleSetTarget = () => {
    setIsTargeting(true);
  };

  const handleClearTarget = () => {
    updateRoomSettings({ targetLocation: null, targetLabel: null });
    setIsTargeting(false);
  };

  const handleMapTarget = (latlng) => {
    updateRoomSettings({
      targetLocation: { lat: latlng.lat, lng: latlng.lng },
      targetLabel: "Pinned location",
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
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  // Mobile walkie-talkie handlers
  const handleMobileWalkieStart = () => {
    setIsTalkingMobile(true);
    // Trigger walkie start via custom event
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

        {/* ======= NEW MOBILE UI ======= */}
        {isMobile ? (
          <>
            {/* Mobile Topbar */}
            <div className="mob-topbar">
              <span className="mob-topbar-logo">Coordinator</span>
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
            </div>

            {/* Members Dropdown Panel */}
            {showMembersPanel && (
              <div className="mob-members-panel">
                <div className="mob-members-header">
                  <span className="mob-members-header-icon">👥</span>
                  <span className="mob-members-header-title">Members</span>
                  <span className="mob-members-header-count">{memberList.length}</span>
                </div>
                <div className="mob-members-list">
                  {memberList.map((member) => {
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
                            <div className="mob-member-sub">{formatDistance(member.distance)} away</div>
                          )}
                        </div>
                        {member.isHost && <span className="mob-member-role host">HOST</span>}
                        {isCurrentUser && !member.isHost && <span className="mob-member-role you">YOU</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mob-members-footer">
                  {user?.picture
                    ? <img src={user.picture} alt="" className="mob-profile-avatar" />
                    : <div className="mob-profile-avatar-placeholder">👤</div>
                  }
                  <div className="mob-profile-info">
                    <div className="mob-profile-name">{user?.name || 'Guest'}</div>
                    <div className="mob-profile-role-text">Host</div>
                  </div>
                  <div className="mob-live-dot" title="Live" />
                </div>
              </div>
            )}

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
                      <button
                        key={place.placeId}
                        type="button"
                        className="trip-suggestion"
                        onClick={() => { handleSelectTripPlace(place); }}
                      >
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
                  onClick={() => {
                    if (locations.find(l => l.userId === user?.userId)) {
                      const loc = locations.find(l => l.userId === user?.userId);
                      if (loc?.lat && loc?.lng) {
                        import('../context/MapContext').then(() => {});
                        // trigger SOS through SOSOverlay's startSOSTimer by simulating click on sos-fab-btn
                        document.querySelector('.sos-fab-btn-hidden')?.click();
                      }
                    }
                  }}
                >
                  <span className="mob-sos-label">SOS</span>
                </button>
              )}

              {/* Set Target */}
              {roomSettings?.mode !== "trip" && (
                <button
                  className={`mob-icon-btn tool ${roomSettings?.targetLocation?.lat != null ? 'active' : ''}`}
                  data-tooltip={roomSettings?.targetLocation?.lat != null ? "Clear Target" : "Set Target"}
                  onClick={() => {
                    if (roomSettings?.targetLocation?.lat != null) {
                      handleClearTarget();
                    } else {
                      handleSetTarget();
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                </button>
              )}

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
                    <button
                      className={`mob-share-option ${urlCopied ? 'copied' : ''}`}
                      onClick={() => { copyToClipboard(); setShowSharePanel(false); }}
                    >
                      📋 {urlCopied ? 'Copied!' : 'Copy URL'}
                    </button>
                    <button
                      className="mob-share-option"
                      onClick={() => { setShowQR(true); setShowSharePanel(false); }}
                    >
                      📱 Show QR Code
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

              {/* Trip mode: Watches icon */}
              {roomSettings?.mode === "trip" && (
                <button
                  className="mob-icon-btn watches"
                  data-tooltip={`Watchers (${watchers.length})`}
                  onClick={() => setShowWatchPanel(true)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                  {watchers.length > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -4, background: '#8b5cf6', color: '#fff', fontSize: '0.5rem', fontWeight: 900, borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {watchers.length}
                    </span>
                  )}
                </button>
              )}

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
                {roomSettings?.mode === "trip" && (
                  <>
                    <div className="mob-target-sep" />
                    <button
                      type="button"
                      style={{ background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)', borderRadius: 8, color: '#c4b5fd', fontSize: '0.62rem', fontWeight: 800, padding: '4px 8px', cursor: 'pointer' }}
                      onClick={handleEndTripManually}
                    >
                      🏁 End
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Location error banner (mobile) */}
            {locationStatus !== "active" && locationStatus !== "idle" && (
              <div style={{ position: 'absolute', top: 60, left: 10, right: 10, zIndex: 160, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '8px 12px', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.7rem', color: '#fca5a5', flex: 1 }}>
                  {locationStatus === "prompt" ? "Waiting for GPS..." : locationError || "Location unavailable"}
                </span>
                <button onClick={startLocationTracking} style={{ background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}>
                  Enable
                </button>
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
            {/* Top Bar */}
            <div className="room-topbar">
              <div className="room-topbar-left">
                <span>Group: {roomId}</span>
                <span className="muted">{locations.length} member{locations.length !== 1 ? 's' : ''}</span>
                <span className="room-mode-pill">
                  Mode: {modeLabel}
                </span>
              </div>

              <div className="room-topbar-right">
                {console.log("Mode:", roomSettings?.mode) || null}
                <button 
                  className={`soft-pill-btn battery ${batterySaver ? 'active' : ''}`}
                  onClick={() => setBatterySaver(!batterySaver)}
                  title={batterySaver ? "Disable Battery Saver" : "Enable Battery Saver"}
                >
                  {batterySaver ? "🔋 Saver On" : "🪫 Saver Off"}
                </button>
                {roomSettings?.mode === "trip" && (
                  <button className="soft-pill-btn watch" onClick={() => setShowWatchPanel(true)}>
                    Watchers {watchers.length > 0 ? `(${watchers.length})` : ''}
                  </button>
                )}
                <button className="soft-pill-btn qr" onClick={() => setShowQR(true)}>Show QR</button>
                <button className="soft-pill-btn leave" onClick={handleLeaveRoom}>LEAVE</button>
                <button className="soft-pill-btn account" onClick={() => { console.log("Account button clicked, showMenu:", !showMenu); setShowMenu(!showMenu); }}>
                  {user?.picture ? <img src={user.picture} alt="" className="account-avatar" /> : "👤"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Account Menu (desktop) */}
        {!isMobile && showMenu && <AuthMenu />}

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

        {/* Desktop controls wrapper */}
        {!isMobile && (
          <>
            <div className="panels-wrapper">
              <div className={`room-controls-panel ${controlsPanelOpen ? "" : "collapsed"}`}>
                <div
                  className="controls-panel-toggle"
                  onClick={() => setControlsPanelOpen(!controlsPanelOpen)}
                >
                  <span className="control-label">{controlsPanelOpen ? "▼" : "▶"} Room Controls</span>
                </div>
                {controlsPanelOpen && (
                  <>
                    <div className="control-row">
                      <span className="control-label">Mode</span>
                      <span className="control-hint">{modeLabel}</span>
                    </div>

                    {(roomSettings?.mode === "tracking" || roomSettings?.mode === "trip") && (
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
                        <span className="control-hint">{roomSettings?.mode === "trip" ? "Arrival check range" : "Nearest member rule"}</span>
                      </div>
                    )}

                    {roomSettings?.mode !== "trip" && (
                      <>
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
                      </>
                    )}

                    {roomSettings?.mode === "trip" && (
                      <div className="control-row trip-search">
                        <label className="control-label">Trip Destination</label>
                        <div className="trip-search-row">
                          <input
                            type="text"
                            className="control-input"
                            value={tripQuery}
                            onChange={(e) => setTripQuery(e.target.value)}
                            placeholder="Type a place or address"
                          />
                          <button
                            type="button"
                            className="soft-pill-btn target"
                            onClick={handleTripSearch}
                            disabled={isTripSearching}
                          >
                            {isTripSearching ? "Searching" : "Search"}
                          </button>
                        </div>
                        {tripSearchError && <span className="control-hint">{tripSearchError}</span>}
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

                    <div className="control-divider"></div>

                    <div className="control-row map-row">
                      <span className="control-label">Map</span>
                      <button
                        className={`map-btn ${roomSettings?.mapStyle === "osm" ? "active" : ""}`}
                        onClick={() => updateRoomSettings({ mapStyle: "osm" })}
                      >
                        OSM Standard
                      </button>
                      <button
                        className={`map-btn ${roomSettings?.mapStyle === "satellite" ? "active" : ""}`}
                        onClick={() => updateRoomSettings({ mapStyle: "satellite" })}
                      >
                        Satellite
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Target Navigation Panel */}
              {roomSettings?.targetLocation && targetInfo && (
                <div className={`target-nav-panel ${targetNavPanelOpen ? "" : "collapsed"}`}>
                  <div
                    className="target-nav-panel-toggle"
                    onClick={() => setTargetNavPanelOpen(!targetNavPanelOpen)}
                  >
                    <span className="control-label">
                      {targetNavPanelOpen ? "▼" : "▶"} Target Navigation
                    </span>
                  </div>
                  {targetNavPanelOpen && (
                    <>
                      <div className="target-nav-head">
                        <span className="control-hint">Live direction to destination</span>
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
                      {roomSettings?.mode === "trip" && (
                        <div className="control-row" style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            className="soft-pill-btn target"
                            style={{ width: '100%', padding: '8px 16px', fontSize: '12px' }}
                            onClick={handleEndTripManually}
                          >
                            🏁 End & Save Route
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
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
            onMapClick={handleMapTarget}
            isTargeting={isTargeting}
            roomSettings={roomSettings}
            tripPath={roomSettings?.mode === "trip" ? tripPath : null}
            savedTripPath={savedTripPath}
            onRouteUpdate={handlePlannedRouteUpdate}
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

        {/* QR Code Modal */}
        {showQR && (
          <div className="qr-modal-backdrop" onClick={() => { setShowQR(false); setQrModalTab("join"); }}>
            <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setShowQR(false); setQrModalTab("join"); }}
                className="qr-modal-close"
              >
                ×
              </button>
              
              {roomSettings?.mode === "trip" ? (
                <>
                  <div className="qr-modal-tabs">
                    <button 
                      type="button" 
                      className={`qr-modal-tab ${qrModalTab === "join" ? "active" : ""}`}
                      onClick={() => setQrModalTab("join")}
                    >
                      📱 Join Group
                    </button>
                    <button 
                      type="button" 
                      className={`qr-modal-tab ${qrModalTab === "watch" ? "active" : ""}`}
                      onClick={() => setQrModalTab("watch")}
                    >
                      👁️ Watch Trip
                    </button>
                  </div>

                  {qrModalTab === "join" ? (
                    <>
                      <h2 className="qr-modal-title" style={{ marginTop: '0px', marginBottom: '16px' }}>Share to Join Group</h2>
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
                          📋 Copy Join Link
                        </button>
                        <button
                          onClick={() => { setShowQR(false); setQrModalTab("join"); }}
                          className="qr-btn-secondary"
                        >
                          Close
                        </button>
                      </div>
                      <div className="qr-link-wrap">
                        <p>Or share this link:</p>
                        <p className="qr-link-text">{joinUrl}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="qr-modal-title" style={{ marginTop: '0px', marginBottom: '16px' }}>Share to Watch Trip</h2>
                      <div className="qr-code-wrap">
                        {watchQrCode ? (
                          <img src={watchQrCode} alt="Watch QR Code" />
                        ) : (
                          <div className="qr-loading">Loading QR...</div>
                        )}
                      </div>
                      <div className="qr-room-id">
                        <p className="qr-label">Watch Access</p>
                        <p className="qr-code-text" style={{ fontSize: '1.25rem', letterSpacing: '0px' }}>Live Watcher Link</p>
                      </div>
                      <div className="qr-actions">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(watchUrl);
                            alert("Watch link copied!");
                          }}
                          className="qr-btn-primary"
                        >
                          📋 Copy Watch Link
                        </button>
                        <button
                          onClick={() => { setShowQR(false); setQrModalTab("join"); }}
                          className="qr-btn-secondary"
                        >
                          Close
                        </button>
                      </div>
                      <div className="qr-link-wrap">
                        <p>Or share this watch link:</p>
                        <p className="qr-link-text">{watchUrl}</p>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
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

        {/* Watch Panel - Trip Mode Only */}
        {showWatchPanel && (
          <div className="watcher-panel-backdrop" onClick={() => setShowWatchPanel(false)}>
            <div className="watcher-list-panel" onClick={(event) => event.stopPropagation()}>
              <div className="watcher-list-header">
                <span className="watcher-list-title">Watching Your Trip</span>
                <button
                  className="watcher-list-close"
                  onClick={() => setShowWatchPanel(false)}
                >
                  ×
                </button>
              </div>
            
            {watchers.length > 0 ? (
              <div className="watcher-list">
                {watchers.map((watcher) => (
                  <div key={watcher.userId} className="watcher-list-item">
                    <div className="watcher-avatar">
                      {watcher.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="watcher-name">{watcher.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="watcher-empty">
                No one is watching yet. Share the link below to let people watch your trip.
              </div>
            )}

              <div className="watch-qr-section">
                <span className="watch-qr-label">Share Watch Link</span>
                {watchQrCode && (
                  <img src={watchQrCode} alt="Watch QR Code" className="watch-qr-code" />
                )}
                <button
                  className="watch-link-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(watchUrl);
                    alert("Watch link copied!");
                  }}
                >
                  📋 Copy Watch Link
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
