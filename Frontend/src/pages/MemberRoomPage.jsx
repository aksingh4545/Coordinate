import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
import "./MemberRoomPage.css";

export default function MemberRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { currentRoom, user, locations, setLocations, socket, syncRoomLocations, leaveRoom, calculateDistance, formatDistance, setError } = useMap();
  const [memberList, setMemberList] = useState([]);
  const [showChat, setShowChat] = useState(true);
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
    <div className="room-page">
      <div className="room-earth-bg"></div>
      <div className="room-shell">
        {/* Top Bar */}
        <div className="room-topbar">
          <div className="room-topbar-left">
            <span>Group: {roomId}</span>
            <span className="muted">{locations.length} member{locations.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="room-topbar-right">
            <button className="soft-pill-btn leave" onClick={handleLeaveRoom}>LEAVE</button>
          </div>
        </div>

        {/* Map */}
        <div className="room-map-wrap">
          <MapView
            ref={mapRef}
            locations={locations}
            currentUserId={user?.userId}
            showLines={true}
            centerOnUsers={true}
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
