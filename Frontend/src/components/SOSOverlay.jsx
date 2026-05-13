import { useCallback } from "react";
import { useMap } from "../context/MapContext";

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

  const handleSOSClick = useCallback(() => {
    console.log("🆘 SOS button clicked");
    if (currentLocation && currentLocation.lat && currentLocation.lng) {
      startSOSTimer(currentLocation);
    } else {
      console.warn("⚠️ Cannot send SOS - no valid location");
    }
  }, [currentLocation, startSOSTimer]);

  const handleModalClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  // Countdown Cancel Modal
  if (isPressingSOS && sosCountdown > 0) {
    return (
      <div className="sos-overlay" onClick={handleModalClick}>
        <div className="sos-modal">
          <div className="sos-alert-icon">🚨</div>
          <h2>EMERGENCY SOS</h2>
          <p>Sending alert in</p>
          <div className="sos-countdown">{sosCountdown}</div>
          <p>seconds</p>
          <button 
            className="sos-cancel-btn"
            onClick={(e) => { e.stopPropagation(); cancelSOSTimer(); }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Active SOS Modal (for the person who sent it)
  if (emergencySOS && emergencySOS.isLocal) {
    return (
      <div className="sos-overlay sos-active" onClick={handleModalClick}>
        <div className="sos-modal sos-active-modal">
          <div className="sos-alert-icon pulse">🚨</div>
          <h2>EMERGENCY ACTIVE</h2>
          <p>Your SOS has been sent</p>
          <p className="sos-location">
            {emergencySOS.location?.lat?.toFixed(4)}, {emergencySOS.location?.lng?.toFixed(4)}
          </p>
          <button 
            className="sos-cancel-btn"
            onClick={(e) => { e.stopPropagation(); cancelSOS(); }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Incoming SOS Modal (for others in the room)
  if (incomingSOS) {
    return (
      <div className="sos-overlay sos-incoming">
        <div className="sos-modal sos-incoming-modal">
          <div className="sos-alert-icon pulse">🚨</div>
          <h2>EMERGENCY ALERT!</h2>
          <p className="sos-user-name">{incomingSOS.userName} needs help!</p>
          {incomingSOS.location && (
            <p className="sos-location">
              {incomingSOS.location.lat?.toFixed(4)}, {incomingSOS.location.lng?.toFixed(4)}
            </p>
          )}
          <button 
            className="sos-dismiss-btn"
            onClick={dismissIncomingSOS}
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  // SOS Button (always visible when no SOS active)
  return (
    <button 
      className="sos-fab-btn"
      onClick={handleSOSClick}
      title="Emergency SOS"
    >
      <span className="sos-fab-icon">🆘</span>
    </button>
  );
}