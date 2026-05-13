import { useEffect, useRef, useCallback, useState } from "react";
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

  const [pressProgress, setPressProgress] = useState(0);
  const longPressTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const LONG_PRESS_DURATION = 5000;

  const handlePressStart = useCallback((e) => {
    console.log("🖐️ Press start detected", e.type);
    if (emergencySOS || incomingSOS || isPressingSOS) return;
    
    const target = e.target;
    if (target.closest('.room-topbar') || 
        target.closest('.walkie-fab-container') || 
        target.closest('.room-controls-panel') || 
        target.closest('.mobile-options-panel') || 
        target.closest('.mobile-target-panel') ||
        target.closest('.sos-press-indicator') ||
        target.closest('button') || 
        target.closest('input') || 
        target.closest('select') ||
        target.closest('.leaflet-container')) {
      console.log("🖐️ Press ignored - clicking on UI element");
      return;
    }
    
    e.preventDefault();
    setPressProgress(0);
    const startTime = Date.now();
    console.log("🆘 SOS press started, timer set for 5 seconds");
    
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / LONG_PRESS_DURATION) * 100);
      setPressProgress(progress);
    }, 50);
    
    longPressTimerRef.current = setTimeout(() => {
      clearInterval(progressIntervalRef.current);
      setPressProgress(0);
      console.log("🆘 SOS Timer triggered!");
      if (currentLocation && currentLocation.lat && currentLocation.lng) {
        console.log("🆘 Calling startSOSTimer with location:", currentLocation);
        startSOSTimer(currentLocation);
      } else {
        console.warn("⚠️ SOS cancelled - no valid location");
      }
    }, LONG_PRESS_DURATION);
  }, [emergencySOS, incomingSOS, isPressingSOS, currentLocation, startSOSTimer]);

  const handlePressEnd = useCallback((e) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      console.log("🖐️ SOS press cancelled");
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setPressProgress(0);
  }, []);

  useEffect(() => {
    console.log("📡 SOS event listeners added");
    
    const onMouseDown = (e) => handlePressStart(e);
    const onMouseUp = (e) => handlePressEnd(e);
    const onMouseLeave = (e) => handlePressEnd(e);
    const onTouchStart = (e) => handlePressStart(e);
    const onTouchEnd = (e) => handlePressEnd(e);
    const onTouchCancel = (e) => handlePressEnd(e);

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchCancel);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [handlePressStart, handlePressEnd]);

  // Long Press Progress Indicator
  if (pressProgress > 0 && pressProgress < 100) {
    return (
      <div className="sos-press-indicator">
        <div className="sos-press-circle" style={{ '--progress': `${pressProgress}%` }}>
          <span className="sos-press-text">Hold for SOS</span>
        </div>
      </div>
    );
  }

  // Show a small SOS button as fallback
  if (!emergencySOS && !incomingSOS && !isPressingSOS) {
    return (
      <div className="sos-button-fallback">
        <button 
          className="sos-fab-btn"
          onClick={() => {
            console.log("🆘 SOS button clicked");
            if (currentLocation && currentLocation.lat && currentLocation.lng) {
              startSOSTimer(currentLocation);
            }
          }}
          title="Emergency SOS"
        >
          <span className="sos-fab-icon">🆘</span>
        </button>
      </div>
    );
  }

  // Countdown Cancel Modal
  if (isPressingSOS && sosCountdown > 0) {
    return (
      <div className="sos-overlay">
        <div className="sos-modal">
          <div className="sos-alert-icon">🚨</div>
          <h2>EMERGENCY SOS</h2>
          <p>Sending alert in</p>
          <div className="sos-countdown">{sosCountdown}</div>
          <p>seconds</p>
          <p className="sos-cancel-hint">Release to cancel</p>
          <button 
            className="sos-cancel-btn"
            onClick={cancelSOSTimer}
          >
            Cancel SOS
          </button>
        </div>
      </div>
    );
  }

  // Active SOS Modal (for the person who sent it)
  if (emergencySOS) {
    return (
      <div className="sos-overlay sos-active">
        <div className="sos-modal sos-active-modal">
          <div className="sos-alert-icon pulse">🚨</div>
          <h2>EMERGENCY ACTIVE</h2>
          <p>Your SOS has been sent to all members</p>
          <p className="sos-location">
            Location: {emergencySOS.location?.lat?.toFixed(6)}, {emergencySOS.location?.lng?.toFixed(6)}
          </p>
          <button 
            className="sos-cancel-btn"
            onClick={cancelSOS}
          >
            Cancel SOS
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
              Location: {incomingSOS.location.lat?.toFixed(6)}, {incomingSOS.location.lng?.toFixed(6)}
            </p>
          )}
          <div className="sos-actions">
            <button 
              className="sos-dismiss-btn"
              onClick={dismissIncomingSOS}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}