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
  const suppressTripSearchRef = useRef(false);
  const lastSelectedTripQueryRef = useRef("");
  const mapRef = useRef(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
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
    if (roomSettings?.mode !== "trip" || !roomSettings?.targetLocation) return;
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
      console.log(`📍 GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} | Accuracy: ${accuracy?.toFixed(1)}m | Speed: ${speed?.toFixed(1)}m/s | Mode: ${batterySaver ? 'Saver' : 'HighAccuracy'}`);
      handleLocationUpdate(latitude, longitude, accuracy, speed);
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

    if (batterySaver) {
      // 🔋 Battery Saver Mode: Polling position every 20 seconds with low accuracy (allows GPS chip to sleep)
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5000,
      });

      pollIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 5000,
        });
      }, 20000);
    } else {
      // ⚡ High Accuracy Mode: Continuous real-time GPS tracking
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });

      watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
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
                <button 
                  className={`mobile-battery-btn ${batterySaver ? 'active' : ''}`}
                  onClick={() => setBatterySaver(!batterySaver)}
                  title={batterySaver ? "Disable Battery Saver" : "Enable Battery Saver"}
                >
                  {batterySaver ? "🔋" : "🪫"}
                </button>
                {roomSettings?.mode === "trip" && (
                  <button 
                    className="mobile-watch-btn" 
                    onClick={() => setShowWatchPanel(true)}
                  >
                    👁️ {watchers.length > 0 ? `(${watchers.length})` : ''}
                  </button>
                )}
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
            </>
          )}
        </div>

        {/* Account Menu */}
        {showMenu && <AuthMenu />}

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

          {/* Target Navigation Panel */}
          {roomSettings?.targetLocation && targetInfo && (
            <div className={`target-nav-panel ${targetNavPanelOpen ? "" : "collapsed"}`}>
              <div className="target-nav-panel-toggle" onClick={() => setTargetNavPanelOpen(!targetNavPanelOpen)}>
                <span className="control-label">{targetNavPanelOpen ? "▼" : "▶"} Target Navigation</span>
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
              </>
              )}
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
              </div>
            )}

            {roomSettings?.mode === "trip" && (
              <div className="option-item watch-option" onClick={() => { setShowWatchPanel(true); setShowOptions(false); }}>
                <span className="option-label">👁️ Watchers</span>
                <span className="option-value">{watchers.length} watching</span>
              </div>
            )}

            {roomSettings?.mode !== "trip" && (
              <div className="option-item" onClick={() => { handleSetTarget(); setShowOptions(false); }}>
                <span className="option-label">📍 Set Target</span>
                <span className="option-value">{roomSettings?.targetLocation ? "Change" : "Add"}</span>
              </div>
            )}

            {roomSettings?.targetLocation && roomSettings?.mode !== "trip" && (
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

            <div className="option-item" onClick={() => { 
              if (roomSettings?.mode === "trip") {
                setTripQuery("");
                setShowOptions(false);
                setShowTripHeader(false);
              }
              setShowTargetNav(!showTargetNav); 
              setShowOptions(false);
            }}>
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
            showLines={roomSettings?.mode === "crowd" || !!roomSettings?.targetLocation}
            centerOnUsers={true}
            targetLocation={roomSettings?.targetLocation}
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
