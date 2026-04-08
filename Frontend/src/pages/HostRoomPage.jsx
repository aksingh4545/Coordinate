import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import MapView from "../components/MapView";
import LiveChat from "../components/LiveChat";
import QRCode from "qrcode";
import "./MemberRoomPage.css";

export default function HostRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { currentRoom, user, locations, setLocations, socket, syncRoomLocations, leaveRoom, calculateDistance, formatDistance, setError } = useMap();
  const [qrCode, setQrCode] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [memberList, setMemberList] = useState([]);
  const [showChat, setShowChat] = useState(true);
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
            <button className="soft-pill-btn qr" onClick={() => setShowQR(true)}>Show QR</button>
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

        {/* QR Code Modal */}
        {showQR && (
          <div className="qr-modal-backdrop" onClick={() => setShowQR(false)}>
            <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowQR(false)}
                className="qr-modal-close"
              >
                ×
              </button>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
