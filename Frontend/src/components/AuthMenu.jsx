import { useEffect, useState } from "react";
import { getAuthHeaders } from "../utils/authStorage";

export default function AuthMenu() {
  const [guestUser, setGuestUser] = useState(null);
  const [savedTrips, setSavedTrips] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("coordinator_user");
      if (raw) {
        setGuestUser(JSON.parse(raw));
      }
    } catch (err) {
      console.error("Failed to parse guest user info:", err);
    }
  }, []);

  useEffect(() => {
    const fetchTrips = async () => {
      const headers = getAuthHeaders();
      if (!headers.Authorization) return;

      try {
        const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
        const response = await fetch(`${API_URL}/api/trips`, {
          headers
        });
        const data = await response.json();
        if (data.success) {
          setSavedTrips(data.trips || []);
        }
      } catch (err) {
        console.error("AuthMenu - Failed to fetch trips:", err);
      }
    };
    
    fetchTrips();
  }, [guestUser]);

  const handleTripClick = (trip) => {
    localStorage.setItem('selectedTrip', JSON.stringify(trip));
    const event = new CustomEvent('showSavedTrip', { detail: trip });
    window.dispatchEvent(event);
    window.currentSavedTrip = trip;

    const closeMenuEvent = new CustomEvent('closeMenu');
    window.dispatchEvent(closeMenuEvent);
  };

  return (
    <div className="menu-dropdown">
      <div className="menu-title">Profile</div>

      <div className="menu-user">
        <span className="user-pill-avatar-placeholder" style={{ fontSize: '1.5rem', marginRight: '10px' }}>👤</span>
        <div className="menu-user-info">
          <div className="menu-user-name">{guestUser?.name || "Guest User"}</div>
          <div className="menu-user-email" style={{ fontSize: '0.75rem', opacity: 0.6 }}>Guest Profile</div>
        </div>
      </div>

      {savedTrips.length > 0 && (
        <>
          <div className="menu-divider"></div>
          <div className="menu-section-title">Saved Trips ({savedTrips.length})</div>
          <div className="saved-trips-list">
            {savedTrips.map(trip => (
              <div 
                key={trip._id || trip.id} 
                className="saved-trip-item"
                onClick={() => handleTripClick(trip)}
              >
                <div className="saved-trip-name">{trip.tripName}</div>
                <div className="saved-trip-date">
                  {trip.createdAt ? new Date(trip.createdAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {savedTrips.length === 0 && (
        <div className="menu-muted">No saved trips yet</div>
      )}
    </div>
  );
}
