import { createContext, useContext, useState, useCallback, useEffect } from "react";
import io from "socket.io-client";

const MapContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export function MapProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("coordinator_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [currentRoom, setCurrentRoom] = useState(null);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

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
  const createRoom = useCallback(async (hostName) => {
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
  }, [currentRoom, user]);

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
    isLoading,
    createRoom,
    joinRoom,
    updateLocation,
    syncRoomLocations,
    leaveRoom,
    calculateDistance,
    formatDistance,
    getOrCreateUser,
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
