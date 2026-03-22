import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap as useLeafletMap } from "react-leaflet";
import { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMap } from "../context/MapContext";

// Component to update map view when locations change
function MapUpdater({ locations, centerOnUsers }) {
  const map = useLeafletMap();

  useEffect(() => {
    const validLocations = locations.filter(
      (loc) => loc.lat !== 0 && loc.lng !== 0 && loc.lat !== null && loc.lng !== null
    );

    if (centerOnUsers && validLocations.length > 0) {
      const sumLat = validLocations.reduce((sum, loc) => sum + loc.lat, 0);
      const sumLng = validLocations.reduce((sum, loc) => sum + loc.lng, 0);
      const center = [sumLat / validLocations.length, sumLng / validLocations.length];
      
      // Fly to the new center smoothly
      map.flyTo(center, map.getZoom() || 15, {
        duration: 1.5,
      });
    }
  }, [locations, centerOnUsers, map]);

  return null;
}

// Custom marker icons
const createMarkerIcon = (isHost, isCurrentUser) => {
  const color = isCurrentUser ? "#10b981" : isHost ? "#8b5cf6" : "#ec4899";

  return new DivIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 4px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      ">
        ${isCurrentUser ? '📍' : isHost ? '🎯' : '👤'}
      </div>
    `,
    className: "custom-marker",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
};

const MapView = forwardRef(({ locations, currentUserId, showLines = true, centerOnUsers = true }, ref) => {
  const { calculateDistance, formatDistance } = useMap();
  const mapRef = useRef(null);

  // Debug logging
  console.log('🗺️ MapView received locations:', locations);

  // Expose map methods to parent
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
  }));

  // Filter valid locations
  const validLocations = locations.filter(
    (loc) => loc.lat !== 0 && loc.lng !== 0 && loc.lat !== null && loc.lng !== null
  );

  console.log('🗺️ Valid locations:', validLocations);

  // Generate polylines connecting all users to host
  const hostLocation = validLocations.find((loc) => {
    const member = locations.find((l) => l.userId === loc.userId);
    return member?.isHost;
  });

  const polylines = [];
  
  if (showLines && hostLocation && validLocations.length > 1) {
    validLocations.forEach((loc) => {
      if (loc.userId !== hostLocation.userId) {
        const distance = calculateDistance(
          hostLocation.lat,
          hostLocation.lng,
          loc.lat,
          loc.lng
        );

        polylines.push(
          <Polyline
            key={`line-${loc.userId}`}
            positions={[
              [hostLocation.lat, hostLocation.lng],
              [loc.lat, loc.lng],
            ]}
            color={loc.userId === currentUserId ? "#10b981" : "#8b5cf6"}
            weight={loc.userId === currentUserId ? 4 : 2}
            dashArray={loc.userId === currentUserId ? null : "5, 5"}
            opacity={0.7}
          />
        );

        // Add distance label at midpoint
        const midLat = (hostLocation.lat + loc.lat) / 2;
        const midLng = (hostLocation.lng + loc.lng) / 2;
        
        polylines.push(
          <CircleMarker
            key={`label-${loc.userId}`}
            center={[midLat, midLng]}
            radius={25}
            fillColor="#ffffff"
            color="#6b7280"
            weight={1}
            opacity={1}
            fillOpacity={0.9}
          />
        );

        // Distance text (using a simple marker with text)
        polylines.push(
          <Marker
            key={`dist-${loc.userId}`}
            position={[midLat, midLng]}
            icon={new DivIcon({
              html: `<div style="
                background: white;
                border: 2px solid #6b7280;
                border-radius: 12px;
                padding: 4px 8px;
                font-size: 11px;
                font-weight: bold;
                white-space: nowrap;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              ">${formatDistance(distance)}</div>`,
              className: "distance-label",
              iconSize: [60, 30],
              iconAnchor: [30, 15],
            })}
          />
        );
      }
    });
  }

  // Handle location permission and tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Location is handled by parent component
        console.log("Location updated:", latitude, longitude);
      },
      (error) => {
        console.error("Location error:", error);
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
  }, []);

  return (
    <div className="h-full w-full">
      <MapContainer
        ref={mapRef}
        center={[28.6139, 77.209]}
        zoom={15}
        scrollWheelZoom={true}
        className="h-full w-full z-0"
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Auto-center map on locations */}
        <MapUpdater locations={locations} centerOnUsers={centerOnUsers} />

        {/* Location markers */}
        {validLocations.map((loc) => {
          const isHost = locations.find((l) => l.userId === loc.userId)?.isHost || false;
          const isCurrentUser = loc.userId === currentUserId;

          return (
            <Marker
              key={loc.userId}
              position={[loc.lat, loc.lng]}
              icon={createMarkerIcon(isHost, isCurrentUser)}
            >
              <Popup>
                <div className="text-center">
                  <p className="font-bold text-gray-800">{loc.name}</p>
                  {isHost && <p className="text-xs text-purple-600 font-semibold">🎯 HOST</p>}
                  {isCurrentUser && <p className="text-xs text-green-600 font-semibold">📍 You</p>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Connection lines */}
        {polylines}
      </MapContainer>

      {/* Custom styles */}
      <style>{`
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        
        .distance-label {
          background: transparent !important;
          border: none !important;
        }

        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .leaflet-popup-content {
          margin: 12px;
        }
      `}</style>
    </div>
  );
});

export default MapView;
