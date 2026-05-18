import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, MapPin } from "lucide-react";
import { useMap } from "../context/useMap";
import placesService from "../utils/placesService";

const SOS_COUNTDOWN_SECONDS = 5;
const locationLabelCache = new Map();

function getLocationKey(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }

  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function useLocationLabel(location) {
  const key = getLocationKey(location);
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const [label, setLabel] = useState("");

  useEffect(() => {
    let isCurrent = true;

    if (!key) {
      setLabel("");
      return () => {
        isCurrent = false;
      };
    }

    const cachedLabel = locationLabelCache.get(key);
    if (cachedLabel) {
      setLabel(cachedLabel);
      return () => {
        isCurrent = false;
      };
    }

    setLabel("Finding location...");

    placesService.reverseGeocode({ lat, lng }).then((resolvedLabel) => {
      if (!isCurrent) return;

      const nextLabel = resolvedLabel || "Location shared on map";
      locationLabelCache.set(key, nextLabel);
      setLabel(nextLabel);
    });

    return () => {
      isCurrent = false;
    };
  }, [key, lat, lng]);

  return label || "Location shared on map";
}

export default function SOSOverlay({ currentLocation }) {
  const {
    emergencySOS,
    incomingSOS,
    sosCountdown,
    isPressingSOS,
    startSOSTimer,
    cancelSOSTimer,
    cancelSOS,
    dismissIncomingSOS,
  } = useMap();
  const emergencyLocationLabel = useLocationLabel(emergencySOS?.location);
  const incomingLocationLabel = useLocationLabel(incomingSOS?.location);

  const handleSOSClick = useCallback(() => {
    if (currentLocation && currentLocation.lat && currentLocation.lng) {
      startSOSTimer(currentLocation);
    } else {
      console.warn("Cannot send SOS - no valid location");
    }
  }, [currentLocation, startSOSTimer]);

  const handleModalClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const countdownProgress = Math.max(
    0,
    Math.min(100, (sosCountdown / SOS_COUNTDOWN_SECONDS) * 100)
  );

  if (isPressingSOS && sosCountdown > 0) {
    return (
      <div className="sos-overlay" onClick={handleModalClick}>
        <div className="sos-modal sos-countdown-modal">
          <div className="sos-status-pill">Emergency SOS</div>
          <div
            className="sos-countdown-ring"
            style={{ "--sos-progress": `${countdownProgress}%` }}
          >
            <div className="sos-ring-core">
              <AlertTriangle size={34} strokeWidth={2.4} />
              <span>{sosCountdown}</span>
            </div>
          </div>
          <h2>Sending SOS Alert</h2>
          <p>Your location will be shared with everyone in this room.</p>
          <button
            className="sos-cancel-btn"
            onClick={(e) => {
              e.stopPropagation();
              cancelSOSTimer();
            }}
          >
            Cancel SOS
          </button>
        </div>
      </div>
    );
  }

  if (emergencySOS && emergencySOS.isLocal) {
    return (
      <div className="sos-overlay sos-active" onClick={handleModalClick}>
        <div className="sos-modal sos-active-modal">
          <div className="sos-alert-icon pulse">
            <AlertTriangle size={42} strokeWidth={2.4} />
          </div>
          <h2>Emergency Active</h2>
          <p>Your SOS has been sent to the room.</p>
          <p className="sos-location">
            <MapPin size={14} strokeWidth={2.4} />
            <span>{emergencyLocationLabel}</span>
          </p>
          <button
            className="sos-cancel-btn"
            onClick={(e) => {
              e.stopPropagation();
              cancelSOS();
            }}
          >
            End SOS
          </button>
        </div>
      </div>
    );
  }

  if (incomingSOS) {
    return (
      <div className="sos-overlay sos-incoming">
        <div className="sos-modal sos-incoming-modal">
          <div className="sos-alert-icon pulse">
            <AlertTriangle size={42} strokeWidth={2.4} />
          </div>
          <h2>Emergency Alert</h2>
          <p className="sos-user-name">{incomingSOS.userName} needs help!</p>
          {incomingSOS.location && (
            <p className="sos-location">
              <MapPin size={14} strokeWidth={2.4} />
              <span>{incomingLocationLabel}</span>
            </p>
          )}
          <button className="sos-dismiss-btn" onClick={dismissIncomingSOS}>
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <button className="sos-fab-btn" onClick={handleSOSClick} title="Emergency SOS">
      <span className="sos-fab-icon">SOS</span>
    </button>
  );
}
