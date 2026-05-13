import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Circle, useMap as useLeafletMap, useMapEvents } from "react-leaflet";
import { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMap } from "../context/MapContext";

// Component to update map view when locations change
function MapUpdater({ locations, centerOnUsers, allowAutoFollow }) {
  const map = useLeafletMap();

  useEffect(() => {
    const validLocations = locations.filter(
      (loc) => loc.lat !== 0 && loc.lng !== 0 && loc.lat !== null && loc.lng !== null
    );

    if (centerOnUsers && allowAutoFollow && validLocations.length > 0) {
      const sumLat = validLocations.reduce((sum, loc) => sum + loc.lat, 0);
      const sumLng = validLocations.reduce((sum, loc) => sum + loc.lng, 0);
      const center = [sumLat / validLocations.length, sumLng / validLocations.length];
      
      // Fly to the new center smoothly
      map.flyTo(center, map.getZoom() || 15, {
        duration: 1.5,
      });
    }
  }, [locations, centerOnUsers, allowAutoFollow, map]);

  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (event) => {
      if (onMapClick) {
        onMapClick(event.latlng);
      }
    },
  });

  return null;
}

function MapInteractionTracker({ onUserInteracted }) {
  useMapEvents({
    zoomstart: () => onUserInteracted?.(),
    dragstart: () => onUserInteracted?.(),
    movestart: () => onUserInteracted?.(),
  });

  return null;
}

function ZoomHandler({ onZoomChange }) {
  useMapEvents({
    zoomend: (e) => {
      onZoomChange?.(e.target.getZoom());
    },
  });
  return null;
}

// Dynamic marker icons based on zoom level
const createMarkerIcon = (isHost, isCurrentUser, baseSize = 32) => {
  const color = isCurrentUser ? "#10b981" : isHost ? "#8b5cf6" : "#ec4899";
  const halfSize = baseSize / 2;
  const fontSize = Math.round(baseSize * 0.5);

  return new DivIcon({
    html: `
      <div style="
        background-color: ${color};
        width: ${baseSize}px;
        height: ${baseSize}px;
        border-radius: 50%;
        border: ${Math.max(2, baseSize * 0.1)}px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${fontSize}px;
      ">
        ${isCurrentUser ? '📍' : isHost ? '🎯' : '👤'}
      </div>
    `,
    className: "custom-marker",
    iconSize: [baseSize, baseSize],
    iconAnchor: [halfSize, halfSize],
    popupAnchor: [0, -halfSize],
  });
};

const createTargetIcon = (baseSize = 28) => {
  const halfSize = baseSize / 2;
  const fontSize = Math.round(baseSize * 0.5);

  return new DivIcon({
    html: `
      <div style="
        background: #f59e0b;
        width: ${baseSize}px;
        height: ${baseSize}px;
        border-radius: ${Math.round(baseSize * 0.2)}px ${Math.round(baseSize * 0.2)}px ${Math.round(baseSize * 0.5)}px ${Math.round(baseSize * 0.5)}px;
        border: ${Math.max(1.5, baseSize * 0.08)}px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${fontSize}px;
        transform: translateY(-${baseSize * 0.1}px) rotate(45deg);
      ">
        <span style="transform: rotate(-45deg);">📌</span>
      </div>
    `,
    className: "custom-marker",
    iconSize: [baseSize, baseSize],
    iconAnchor: [halfSize, baseSize * 0.85],
    popupAnchor: [0, -baseSize * 0.65],
  });
};

const MapView = forwardRef(({
  locations,
  currentUserId,
  showLines = true,
  centerOnUsers = true,
  targetLocation = null,
  onMapClick = null,
  isTargeting = false,
  roomSettings = null,
}, ref) => {
  const { calculateDistance, formatDistance } = useMap();
  const mapRef = useRef(null);
  const targetLines = [];
  const rangeCircles = [];
  const [allowAutoFollow, setAllowAutoFollow] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(15);

  // Calculate marker size based on zoom level
  // Smaller when zoomed in, larger when zoomed out
  const getMarkerSize = (zoom) => {
    const baseSize = 32;
    const referenceZoom = 15;
    const scaleFactor = 0.85;
    let size = baseSize * Math.pow(scaleFactor, zoom - referenceZoom);
    return Math.max(14, Math.min(Math.round(size), 44));
  };

  const markerSize = getMarkerSize(zoomLevel);

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
  const activeUserLocation = validLocations.find((loc) => loc.userId === currentUserId) || hostLocation;

  const polylines = [];
  
  if (targetLocation) {
    if (roomSettings?.mode === "tracking" && activeUserLocation) {
      const directDistance = calculateDistance(
        activeUserLocation.lat,
        activeUserLocation.lng,
        targetLocation.lat,
        targetLocation.lng
      );

      polylines.push(
        <Polyline
          key="tracking-direct-path"
          positions={[
            [activeUserLocation.lat, activeUserLocation.lng],
            [targetLocation.lat, targetLocation.lng],
          ]}
          color="#22c55e"
          weight={5}
          opacity={0.9}
          dashArray="10, 8"
        />
      );

      const midLat = (activeUserLocation.lat + targetLocation.lat) / 2;
      const midLng = (activeUserLocation.lng + targetLocation.lng) / 2;

      polylines.push(
        <Marker
          key="tracking-direct-distance"
          position={[midLat, midLng]}
          icon={new DivIcon({
            html: `<div style="
              background: rgba(17, 24, 39, 0.88);
              border: 2px solid #22c55e;
              border-radius: 12px;
              padding: 4px 8px;
              font-size: 11px;
              font-weight: bold;
              white-space: nowrap;
              color: #ffffff;
              box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            ">${formatDistance(directDistance)}</div>`,
            className: "distance-label",
            iconSize: [60, 30],
            iconAnchor: [30, 15],
          })}
        />
      );
    }

    validLocations.forEach((loc) => {
      const distance = calculateDistance(
        targetLocation.lat,
        targetLocation.lng,
        loc.lat,
        loc.lng
      );

      polylines.push(
        <Polyline
          key={`target-line-${loc.userId}`}
          positions={[
            [targetLocation.lat, targetLocation.lng],
            [loc.lat, loc.lng],
          ]}
          color="#f59e0b"
          weight={loc.userId === currentUserId ? 4 : 2}
          dashArray="8, 8"
          opacity={0.75}
        />
      );

      const midLat = (targetLocation.lat + loc.lat) / 2;
      const midLng = (targetLocation.lng + loc.lng) / 2;

      polylines.push(
        <Marker
          key={`target-dist-${loc.userId}`}
          position={[midLat, midLng]}
          icon={new DivIcon({
            html: `<div style="
              background: rgba(255, 255, 255, 0.96);
              border: 2px solid #f59e0b;
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
    });
  } else if (showLines && hostLocation && validLocations.length > 1) {
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

  if (targetLocation && validLocations.length > 0) {
    targetLines.push(
      <CircleMarker
        key="target-anchor"
        center={[targetLocation.lat, targetLocation.lng]}
        radius={12}
        pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.2, weight: 2 }}
      />
    );
  }

  if (centerOnUsers && roomSettings?.mode === "tracking") {
    validLocations.forEach((loc) => {
      rangeCircles.push(
        <Circle
          key={`range-${loc.userId}`}
          center={[loc.lat, loc.lng]}
          radius={roomSettings?.trackingRange ?? 30}
          pathOptions={{
            color: loc.userId === currentUserId ? "#10b981" : "#f59e0b",
            fillColor: loc.userId === currentUserId ? "#10b981" : "#f59e0b",
            fillOpacity: 0.08,
            weight: 1,
          }}
        />
      );
    });
  }

  const mapStyle = roomSettings?.mapStyle || "osm";
  const tileLayers = {
    osm: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    },
  };
  const activeTile = tileLayers[mapStyle] || tileLayers.osm;

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
        <TileLayer url={activeTile.url} attribution={activeTile.attribution} />

        {/* Auto-center map on locations */}
        <MapInteractionTracker onUserInteracted={() => setAllowAutoFollow(false)} />
        <MapUpdater locations={locations} centerOnUsers={centerOnUsers} allowAutoFollow={allowAutoFollow} />
        <ZoomHandler onZoomChange={setZoomLevel} />

        <MapClickHandler onMapClick={onMapClick ? (latlng) => {
          if (isTargeting) {
            onMapClick(latlng);
          }
        } : null} />

        {/* Location markers */}
        {validLocations.map((loc) => {
          const isHost = locations.find((l) => l.userId === loc.userId)?.isHost || false;
          const isCurrentUser = loc.userId === currentUserId;

          return (
            <Marker
              key={loc.userId}
              position={[loc.lat, loc.lng]}
              icon={createMarkerIcon(isHost, isCurrentUser, markerSize)}
            >
              <Popup>
                <p><b>{loc.name}</b> {isCurrentUser ? '📍' : ''} {isHost ? '🎯' : ''}</p>
              </Popup>
            </Marker>
          );
        })}

        {targetLocation && (
          <Marker
            position={[targetLocation.lat, targetLocation.lng]}
            icon={createTargetIcon(markerSize)}
          >
            <Popup>
              <p>📌 Target</p>
            </Popup>
          </Marker>
        )}

        {rangeCircles}

        {/* Connection lines */}
        {polylines}
        {targetLines}
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
          border-radius: 8px !important;
          background: rgba(15, 15, 35, 0.92) !important;
          backdrop-filter: blur(8px);
          padding: 4px 8px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }

        .leaflet-popup-content {
          margin: 0 !important;
          padding: 4px 6px !important;
          line-height: 1.2 !important;
          font-size: 11px !important;
          width: auto !important;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ffffff;
        }

        .leaflet-popup-content p {
          margin: 0 !important;
          padding: 0 !important;
          font-size: 11px !important;
          color: #ffffff !important;
        }

        .leaflet-popup-tip-container {
          display: none !important;
        }

        .leaflet-popup-close-button {
          display: none !important;
        }

        .leaflet-container a.leaflet-popup-content-wrapper {
          min-width: 60px;
        }

        .leaflet-marker-icon {
          transition: transform 0.5s ease-out, left 0.5s ease-out, top 0.5s ease-out !important;
        }

        .custom-marker {
          transition: transform 0.5s ease-out !important;
        }
      `}</style>
    </div>
  );
});

export default MapView;
