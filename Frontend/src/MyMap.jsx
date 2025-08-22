import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "leaflet";
import io from "socket.io-client";

// Import components
import Navbar from "./components/Navbar";
import AddGroupButton from "./components/AddGroupButton";
import GroupCard from "./components/GroupCard";

// Initialize Socket.IO with reconnection options
const socket = io("http://localhost:5000", {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default function MyMap() {
  const [showGroupCard, setShowGroupCard] = useState(false);
  const [userId, setUserId] = useState(localStorage.getItem("userId") || null);
  const [groupId, setGroupId] = useState(null);
  const [locations, setLocations] = useState({});
  const [qrCode, setQrCode] = useState(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [mapCenter, setMapCenter] = useState([28.6139, 77.209]); // Default center (Delhi)
  const [mapReady, setMapReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState(""); // For user feedback
  const [isLoading, setIsLoading] = useState(true); // For loading state

  // Get user's current location on mount
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
        setLocations((prev) => ({ ...prev, [userId]: [latitude, longitude] }));
        setMapReady(true);
        setIsLoading(false);
      },
      (err) => {
        console.error("Error getting location:", err);
        setErrorMessage("Unable to access location. Using default map center.");
        setMapReady(true);
        setIsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  }, [userId]);

  // Set userId with fallback
  useEffect(() => {
    if (!userId) {
      try {
        const newUserId = "user_" + Math.random().toString(36).substring(2, 9);
        setUserId(newUserId);
        localStorage.setItem("userId", newUserId);
      } catch (err) {
        console.error("Error accessing localStorage:", err);
        setErrorMessage("Storage issue detected. Your session may reset.");
        setUserId("user_" + Math.random().toString(36).substring(2, 9)); // Fallback to transient userId
      }
    }
  }, []);

  // Handle Socket.IO connection errors
  useEffect(() => {
    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setErrorMessage("Failed to connect to server. Retrying...");
    });
    socket.on("reconnect", () => {
      setErrorMessage("");
      if (userId) socket.emit("join", { userId });
      if (groupId) socket.emit("joinGroup", { groupId });
    });
    return () => {
      socket.off("connect_error");
      socket.off("reconnect");
    };
  }, [userId, groupId]);

  // Join socket with userId
  useEffect(() => {
    if (userId) {
      socket.emit("join", { userId });
    }
  }, [userId]);

  // Handle location updates when in a group
  useEffect(() => {
    if (groupId && userId) {
      socket.emit("joinGroup", { groupId });
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          socket.emit("location", {
            userId,
            groupId,
            lat: latitude,
            lng: longitude,
          });
          setLocations((prev) => ({ ...prev, [userId]: [latitude, longitude] }));
        },
        (err) => {
          console.error("Location watch error:", err);
          setErrorMessage("Unable to update location. Please check permissions.");
        },
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [groupId, userId]);

  // Listen for location updates from other users
  useEffect(() => {
    socket.on("updateLocation", ({ userId: uId, lat, lng }) => {
      setLocations((prev) => ({ ...prev, [uId]: [lat, lng] }));
    });
    return () => socket.off("updateLocation");
  }, []);

  // Memoize markers
  const markers = useMemo(
    () =>
      Object.entries(locations).map(([id, geocode]) => ({
        id,
        geocode,
        popup: id === userId ? "You" : id,
      })),
    [locations, userId]
  );

  // Memoize polylines (optional: limit to avoid clutter)
  const polylines = useMemo(
    () =>
      markers.length <= 5 // Limit polylines for up to 5 markers to avoid clutter
        ? markers.flatMap((m1, i) =>
            markers.slice(i + 1).map((m2) => (
              <Polyline
                key={`${m1.id}-${m2.id}`}
                positions={[m1.geocode, m2.geocode]}
                color="blue"
              />
            ))
          )
        : [],
    [markers]
  );

  // Create group and generate QR code with timeout
  const handleCreateGroup = async () => {
    if (!userId) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
      const res = await fetch("http://localhost:5000/api/groups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.qrCode && data.groupId) {
        setQrCode(data.qrCode);
        setGroupId(data.groupId);
        setShowGroupCard(true);
      } else {
        setErrorMessage("Failed to create group: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Error creating group:", err);
      setErrorMessage("Error creating group. Please try again.");
    }
  };

  // Handle join group
  const handleJoinClick = () => setShowJoinModal(true);

  const handleJoin = async () => {
    if (!userId || !joinCode) {
      setErrorMessage("Please enter a valid group code.");
      return;
    }
    try {
      const res = await fetch("http://localhost:5000/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, groupId: joinCode }),
      });
      const data = await res.json();
      if (data.success) {
        setGroupId(joinCode);
        setShowJoinModal(false);
        setJoinCode("");
      } else {
        setErrorMessage("Failed to join group: " + (data.error || "Invalid code"));
      }
    } catch (err) {
      console.error("Error joining group:", err);
      setErrorMessage("Error joining group. Please try again.");
    }
  };

  const closeGroupCard = () => setShowGroupCard(false);

  return (
    <div className="h-screen w-full relative">
      {/* Error Message */}
      {errorMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-[600]">
          {errorMessage}
          <button
            onClick={() => setErrorMessage("")}
            className="ml-2 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navbar */}
      <Navbar onJoinClick={handleJoinClick} />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-[500]">
          <div className="text-white text-lg font-semibold">Loading Map...</div>
        </div>
      )}

      {/* Map */}
      {mapReady && (
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom
          className="h-full w-full z-[100]" // Lower z-index for map
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {markers.map(({ id, geocode, popup }) => (
            <Marker
              key={id}
              position={geocode}
              icon={
                new Icon({
                  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
                  iconSize: [38, 38],
                })
              }
            >
              <Popup>
                <h2>{popup}</h2>
              </Popup>
            </Marker>
          ))}

          {groupId && polylines}
        </MapContainer>
      )}

      {/* Floating Create Group Button */}
      <AddGroupButton onClick={handleCreateGroup} />

      {/* Group Share Card */}
      {showGroupCard && (
        <GroupCard onClose={closeGroupCard} qrCode={qrCode} groupId={groupId} />
      )}

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[500]">
          <div className="bg-purple-400/90 backdrop-blur-md p-6 rounded-2xl shadow-xl w-[320px] text-center">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter Group Code"
              className="border p-2 rounded w-full mb-4 text-gray-700"
            />
            <div className="flex justify-center gap-3">
              <button
                onClick={handleJoin}
                className="bg-pink-500 text-white px-4 py-2 rounded-full shadow-md hover:bg-pink-600 transition"
              >
                Join
              </button>
              <button
                onClick={() => setShowJoinModal(false)}
                className="bg-gray-800 text-white px-4 py-2 rounded-full shadow-md hover:bg-gray-900 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}