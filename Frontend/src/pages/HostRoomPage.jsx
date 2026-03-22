import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import QRCode from "qrcode";

export default function HostRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { currentRoom, user, locations, setLocations, socket, syncRoomLocations, leaveRoom, calculateDistance, formatDistance, setError } = useMap();
  const [qrCode, setQrCode] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [memberList, setMemberList] = useState([]);
  const mapRef = useRef(null);

  const joinUrl = `${window.location.origin}/join/${roomId}`;

  useEffect(() => {
    // Generate QR code
    QRCode.toDataURL(joinUrl, { width: 256, height: 256 })
      .then(setQrCode)
      .catch((err) => console.error("QR generation error:", err));
  }, [roomId]);

  useEffect(() => {
    // Sync locations periodically
    const syncInterval = setInterval(() => {
      syncRoomLocations();
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [syncRoomLocations]);

  // Start location tracking when host enters room
  useEffect(() => {
    if (!currentRoom || !user || !socket) {
      console.log('Waiting for dependencies:', { hasRoom: !!currentRoom, hasUser: !!user, hasSocket: !!socket });
      return;
    }

    console.log('📍 Starting location tracking for host:', user.userId, 'in room:', currentRoom.roomId);

    // Join socket room
    socket.emit("user:join", {
      userId: user.userId,
      roomId: currentRoom.roomId,
    });

    // Geolocation watch for continuous location updates
    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser");
      setError("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('📍 Location updated:', { lat: latitude, lng: longitude });

        // Update local locations state FIRST (for immediate UI update)
        setLocations((prev) => {
          const filtered = prev.filter((loc) => loc.userId !== user.userId);
          const updated = [...filtered, {
            userId: user.userId,
            name: user.name,
            lat: latitude,
            lng: longitude,
            isHost: true,
          }];
          console.log('📍 Updated locations:', updated);
          return updated;
        });

        // Emit location to socket for broadcasting to others
        socket.emit("location:update", {
          userId: user.userId,
          roomId: currentRoom.roomId,
          lat: latitude,
          lng: longitude,
          name: user.name,
        });
      },
      (error) => {
        console.error("Location error:", error);
        let errorMsg = "Unable to get your location.";
        if (error.code === 1) {
          errorMsg = "Location permission denied. Please enable location access.";
        } else if (error.code === 2) {
          errorMsg = "Location unavailable. Please enable GPS.";
        }
        setError(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
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
      const hostLocation = locations.find((loc) => loc.userId === user.userId);
      const updatedMembers = locations.map((loc) => {
        let distance = null;
        if (hostLocation && loc.userId !== user.userId) {
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
          isHost: loc.userId === user.userId,
        };
      });
      setMemberList(updatedMembers);
    }
  }, [locations, user, calculateDistance]);

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
    <div className="h-screen w-full relative bg-gray-100">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 z-[1000] shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">🎯 Group: {roomId}</h1>
            <p className="text-sm opacity-90">
              Host: {user?.name || "You"} • {locations.length} member{locations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowQR(true)}
              className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg hover:bg-white/30 transition text-sm font-medium"
            >
              📱 Show QR
            </button>
            <button
              onClick={handleLeaveRoom}
              className="bg-red-500/80 backdrop-blur-sm px-4 py-2 rounded-lg hover:bg-red-600 transition text-sm font-medium"
            >
              Leave
            </button>
          </div>
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
                  📍 {formatDistance(member.distance)} from you
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
              <p>Waiting for members to join...</p>
              <p className="text-sm mt-1">Share the QR code to invite others!</p>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setShowQR(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
              Share to Join
            </h2>
            <div className="text-center mb-4">
              <p className="text-gray-600 mb-2">Scan QR or enter code:</p>
              <div className="bg-white p-4 rounded-xl shadow-inner mb-4 inline-block">
                {qrCode ? (
                  <img src={qrCode} alt="Join QR Code" className="w-48 h-48" />
                ) : (
                  <div className="w-48 h-48 bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-400">Loading QR...</span>
                  </div>
                )}
              </div>
              <div className="bg-gray-100 px-4 py-2 rounded-lg inline-block">
                <p className="text-xs text-gray-500 mb-1">Group Code</p>
                <p className="text-2xl font-mono font-bold text-purple-600">
                  {roomId}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={copyToClipboard}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:shadow-lg transition font-medium"
              >
                📋 Copy Link
              </button>
              <button
                onClick={() => setShowQR(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-medium"
              >
                Close
              </button>
            </div>
            <div className="mt-4 text-center text-sm text-gray-500">
              <p>Or share this link:</p>
              <p className="text-xs font-mono bg-gray-100 px-2 py-1 rounded mt-1 break-all">
                {joinUrl}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
