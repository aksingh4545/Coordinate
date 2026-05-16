import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import io from "socket.io-client";

const MapContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export function MapProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("coordinator_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [currentRoom, setCurrentRoom] = useState(() => {
    const saved = localStorage.getItem("coordinator_current_room");
    return saved ? JSON.parse(saved) : null;
  });
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [roomSettings, setRoomSettings] = useState({
    mode: "crowd",
    trackingRange: 30,
    targetLocation: null,
    targetLabel: null,
    mapStyle: "osm",
  });
  const [roomWarning, setRoomWarning] = useState(null);

  // Emergency SOS State
  const [emergencySOS, setEmergencySOS] = useState(null);
  const [incomingSOS, setIncomingSOS] = useState(null);
  const [sosCountdown, setSOSCountdown] = useState(0);
  const [isPressingSOS, setIsPressingSOS] = useState(false);
  const sosTimerRef = useRef(null);
  const sosCountdownRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on("connect", () => {
      console.log("✅ Socket connected");
      setError(null);
    });

    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setError("Failed to connect to server. Retrying...");
    });

    newSocket.on("location:updated", ({ userId, name, lat, lng }) => {
      console.log('📍 Received location update:', { userId, name, lat, lng });
      setLocations((prev) => {
        const filtered = prev.filter((loc) => loc.userId !== userId);
        const updated = [...filtered, { userId, name, lat, lng }];
        console.log('📍 Updated locations in context:', updated);
        return updated;
      });
    });

    newSocket.on("user:left", ({ userId }) => {
      setLocations((prev) => prev.filter((loc) => loc.userId !== userId));
    });

    newSocket.on("room:settings", (settings) => {
      setRoomSettings(settings);
    });

    newSocket.on("room:warning", (warning) => {
      setRoomWarning(warning);
    });

    // SOS Event Handlers
    newSocket.on("sos:activated", (data) => {
      console.log("🚨 SOS Activated:", data);
      setIncomingSOS(data);
      setLocations((prev) => {
        const filtered = prev.filter((loc) => loc.userId !== data.userId);
        return [...filtered, { 
          ...(data.location && { lat: data.location.lat, lng: data.location.lng }), 
          userId: data.userId, 
          name: data.userName, 
          isSOS: true 
        }];
      });
    });

    newSocket.on("sos:cancelled", (data) => {
      console.log("🚨 SOS Cancelled:", data);
      setIncomingSOS(null);
      setLocations((prev) => {
        const filtered = prev.filter((loc) => !loc.isSOS || loc.userId !== data.userId);
        return filtered;
      });
    });

    newSocket.on("sos:countdown", (data) => {
      setSOSCountdown(data.seconds);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (!currentRoom) {
      localStorage.removeItem("coordinator_current_room");
      return;
    }
    localStorage.setItem("coordinator_current_room", JSON.stringify(currentRoom));
  }, [currentRoom]);

  useEffect(() => {
    if (!socket || !currentRoom || !user) return;

    const joinSocketRoom = () => {
      socket.emit("user:join", {
        userId: user.userId,
        roomId: currentRoom.roomId,
      });
    };

    if (socket.connected) {
      joinSocketRoom();
    }

    socket.on("connect", joinSocketRoom);

    return () => {
      socket.off("connect", joinSocketRoom);
    };
  }, [socket, currentRoom, user]);

  // Generate or get user ID
  const getOrCreateUser = useCallback(() => {
    if (user) return user;

    const newUser = {
      userId: "user_" + Math.random().toString(36).substring(2, 10),
      name: "User",
    };

    try {
      localStorage.setItem("coordinator_user", JSON.stringify(newUser));
    } catch (err) {
      console.error("LocalStorage error:", err);
    }

    setUser(newUser);
    return newUser;
  }, [user]);

  // Create a new room (Host)
  const createRoom = useCallback(async (hostName, mode) => {
    setIsLoading(true);
    setError(null);

    try {
      const currentUser = getOrCreateUser();
      const updatedUser = { ...currentUser, name: hostName };
      setUser(updatedUser);
      localStorage.setItem("coordinator_user", JSON.stringify(updatedUser));

      const response = await fetch(`${SOCKET_URL}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: currentUser.userId,
          hostName,
          mode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create room");
      }

      setCurrentRoom({
        roomId: data.roomId,
        hostId: currentUser.userId,
        hostName,
        isHost: true,
      });

      if (data.settings) {
        setRoomSettings(data.settings);
      }

      // Join socket room
      if (socket) {
        socket.emit("user:join", {
          userId: currentUser.userId,
          roomId: data.roomId,
        });
      }

      setIsLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      throw err;
    }
  }, [socket, getOrCreateUser]);

  // Join an existing room (Member)
  const joinRoom = useCallback(async (roomId, userName) => {
    setIsLoading(true);
    setError(null);

    try {
      const currentUser = getOrCreateUser();
      const updatedUser = { ...currentUser, name: userName };
      setUser(updatedUser);
      localStorage.setItem("coordinator_user", JSON.stringify(updatedUser));

      const response = await fetch(`${SOCKET_URL}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          userId: currentUser.userId,
          userName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to join room");
      }

      setCurrentRoom({
        roomId,
        hostId: data.room.hostId,
        hostName: data.room.hostName,
        isHost: false,
      });

      if (data.room.settings) {
        setRoomSettings(data.room.settings);
      }

      // Join socket room
      if (socket) {
        socket.emit("user:join", {
          userId: currentUser.userId,
          roomId,
        });
      }

      setIsLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      throw err;
    }
  }, [socket, getOrCreateUser]);

  // Update location
  const updateLocation = useCallback((lat, lng) => {
    if (!socket || !currentRoom || !user) return;

    socket.emit("location:update", {
      userId: user.userId,
      roomId: currentRoom.roomId,
      lat,
      lng,
      name: user.name,
    });

    setLocations((prev) => {
      const filtered = prev.filter((loc) => loc.userId !== user.userId);
      return [...filtered, { userId: user.userId, name: user.name, lat, lng }];
    });
  }, [socket, currentRoom, user]);

  // Sync room locations
  const syncRoomLocations = useCallback(() => {
    return new Promise((resolve) => {
      if (!socket || !currentRoom) {
        resolve([]);
        return;
      }

      socket.emit("room:sync", { roomId: currentRoom.roomId }, (response) => {
        if (response.success) {
          setLocations(response.locations);
          if (response.settings) {
            setRoomSettings(response.settings);
          }
          resolve(response.locations);
        } else {
          resolve([]);
        }
      });
    });
  }, [socket, currentRoom]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!currentRoom || !user) return;

    try {
      await fetch(`${SOCKET_URL}/api/rooms/${currentRoom.roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId }),
      });
    } catch (err) {
      console.error("Error leaving room:", err);
    }

    setCurrentRoom(null);
    setLocations([]);
    setRoomSettings({
      mode: "crowd",
      trackingRange: 30,
      targetLocation: null,
      targetLabel: null,
      mapStyle: "osm",
    });
    setRoomWarning(null);
    setEmergencySOS(null);
    setIncomingSOS(null);
  }, [currentRoom, user]);

  const updateRoomSettings = useCallback((partial) => {
    if (!socket || !currentRoom || !user) return;
    const nextSettings = {
      ...roomSettings,
      ...partial,
    };
    setRoomSettings(nextSettings);
    socket.emit("room:settings:update", {
      roomId: currentRoom.roomId,
      userId: user.userId,
      settings: partial,
    });
  }, [socket, currentRoom, user, roomSettings]);

  const clearWarning = useCallback(() => {
    setRoomWarning(null);
  }, []);

  // Emergency SOS Functions
  const startSOSTimer = useCallback((location) => {
    if (!currentRoom || !user) return;
    
    let seconds = 5;
    setIsPressingSOS(true);
    setSOSCountdown(seconds);

    sosCountdownRef.current = setInterval(() => {
      seconds--;
      setSOSCountdown(seconds);
      
      if (socket) {
        socket.emit("sos:countdown", {
          roomId: currentRoom.roomId,
          userId: user.userId,
          seconds: seconds
        });
      }

      if (seconds <= 0) {
        clearInterval(sosCountdownRef.current);
        activateSOS(location);
      }
    }, 1000);

    sosTimerRef.current = sosCountdownRef.current;
  }, [currentRoom, user, socket]);

  const cancelSOSTimer = useCallback(() => {
    if (sosCountdownRef.current) {
      clearInterval(sosCountdownRef.current);
      sosCountdownRef.current = null;
    }
    setIsPressingSOS(false);
    setSOSCountdown(0);
  }, []);

  const activateSOS = useCallback((location) => {
    if (!currentRoom || !user || !socket) return;

    setIsPressingSOS(false);
    setSOSCountdown(0);
    setEmergencySOS({
      userId: user.userId,
      userName: user.name,
      roomId: currentRoom.roomId,
      location: location,
      activatedAt: Date.now()
    });

    socket.emit("sos:activate", {
      roomId: currentRoom.roomId,
      userId: user.userId,
      userName: user.name,
      location: location
    });

    // Trigger device vibration
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }, [currentRoom, user, socket]);

  const cancelSOS = useCallback(() => {
    if (!currentRoom || !user || !socket) return;

    setEmergencySOS(null);

    socket.emit("sos:cancel", {
      roomId: currentRoom.roomId,
      userId: user.userId
    });
  }, [currentRoom, user, socket]);

  const dismissIncomingSOS = useCallback(() => {
    setIncomingSOS(null);
  }, []);

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = useCallback((lat1, lng1, lat2, lng2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }, []);

  const calculateBearing = useCallback((lat1, lng1, lat2, lng2) => {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const λ1 = (lng1 * Math.PI) / 180;
    const λ2 = (lng2 * Math.PI) / 180;

    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360;
  }, []);

  const formatBearing = useCallback((degrees) => {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(degrees / 45) % 8;
    return `${directions[index]} (${Math.round(degrees)}°)`;
  }, []);

  const estimateEtaMinutes = useCallback((meters, speedMps = 1.4) => {
    if (!meters || meters <= 0) return 0;
    return Math.max(1, Math.round((meters / speedMps) / 60));
  }, []);

  // Format distance for display
  const formatDistance = useCallback((meters) => {
    if (meters < 1000) {
      return `${meters.toFixed(1)}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
  }, []);

  const value = {
    user,
    setUser,
    socket,
    currentRoom,
    setCurrentRoom,
    locations,
    setLocations,
    error,
    setError,
    isLoading,
    createRoom,
    joinRoom,
    updateLocation,
    syncRoomLocations,
    leaveRoom,
    calculateDistance,
    calculateBearing,
    formatBearing,
    estimateEtaMinutes,
    formatDistance,
    getOrCreateUser,
    roomSettings,
    updateRoomSettings,
    roomWarning,
    clearWarning,
    // Emergency SOS
    emergencySOS,
    incomingSOS,
    sosCountdown,
    isPressingSOS,
    startSOSTimer,
    cancelSOSTimer,
    activateSOS,
    cancelSOS,
    dismissIncomingSOS,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMap must be used within a MapProvider");
  }
  return context;
}