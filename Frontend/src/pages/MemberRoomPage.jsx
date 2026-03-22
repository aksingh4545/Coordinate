import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";

export default function MemberRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { currentRoom, user, locations, setLocations, socket, syncRoomLocations, leaveRoom, calculateDistance, formatDistance, setError } = useMap();
  const [memberList, setMemberList] = useState([]);
  const mapRef = useRef(null);

  useEffect(() => {
    // Sync locations periodically
    const syncInterval = setInterval(() => {
      syncRoomLocations();
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [syncRoomLocations]);

  // Start location tracking when member enters room
  useEffect(() => {
    if (!currentRoom || !user || !socket) return;

    // Join socket room
    socket.emit("user:join", {
      userId: user.userId,
      roomId: currentRoom.roomId,
    });

    // Geolocation watch for continuous location updates
    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // Emit location to socket
        socket.emit("location:update", {
          userId: user.userId,
          roomId: currentRoom.roomId,
          lat: latitude,
          lng: longitude,
          name: user.name,
        });

        // Update local locations state
        setLocations((prev) => {
          const filtered = prev.filter((loc) => loc.userId !== user.userId);
          return [...filtered, { 
            userId: user.userId, 
            name: user.name, 
            lat: latitude, 
            lng: longitude,
            isHost: false,
          }];
        });
      },
      (error) => {
        console.error("Location error:", error);
        setError("Unable to get your location. Please enable location permissions.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
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
      const hostLocation = locations.find((loc) => loc.userId === currentRoom?.hostId);
      const updatedMembers = locations.map((loc) => {
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
          isHost: loc.userId === currentRoom.hostId,
        };
      });
      setMemberList(updatedMembers);
    }
  }, [locations, user, currentRoom, calculateDistance]);

  const handleLeaveRoom = async () => {
    if (window.confirm("Are you sure you want to leave this group?")) {
      await leaveRoom();
      navigate("/");
    }
  };

  return (
    <div className="h-screen w-full relative bg-gray-100">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 z-[1000] shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">📍 Group: {roomId}</h1>
            <p className="text-sm opacity-90">
              Host: {currentRoom?.hostName} • {locations.length} member{locations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleLeaveRoom}
            className="bg-red-500/80 backdrop-blur-sm px-4 py-2 rounded-lg hover:bg-red-600 transition text-sm font-medium"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Map */}
      <MapView
        ref={mapRef}
        locations={locations}
        currentUserId={user?.userId}
        showLines={true}
        centerOnUsers={true}
      />

      {/* Member List Panel */}
      <div className="absolute top-20 right-4 bg-white rounded-xl shadow-xl p-4 z-[1000] w-72 max-h-[calc(100vh-140px)] overflow-y-auto">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span>👥</span> Group Members
        </h3>
        <div className="space-y-2">
          {memberList.map((member) => (
            <div
              key={member.userId}
              className={`p-3 rounded-lg border-2 ${
                member.isHost
                  ? "bg-purple-50 border-purple-300"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    member.isHost ? "bg-purple-500" : "bg-pink-500"
                  }`} />
                  <span className="font-medium text-gray-800">
                    {member.name}
                  </span>
                </div>
                {member.isHost && (
                  <span className="text-xs bg-purple-500 text-white px-2 py-1 rounded-full">
                    HOST
                  </span>
                )}
              </div>
              {member.distance !== null && (
                <div className="mt-1 text-sm text-gray-600">
                  📍 {formatDistance(member.distance)} from host
                </div>
              )}
              {!member.distance && !member.isHost && (
                <div className="mt-1 text-sm text-gray-400">
                  ⏳ Waiting for location...
                </div>
              )}
            </div>
          ))}
          {memberList.length === 0 && (
            <div className="text-center text-gray-500 py-4">
              <p>Waiting for location data...</p>
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-6 py-3 z-[1000] text-center">
        <p className="text-sm text-gray-700">
          🔵 You are connected • Location updates automatically
        </p>
      </div>
    </div>
  );
}
