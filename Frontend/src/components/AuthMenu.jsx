import { useEffect, useRef, useState } from "react";
import { clearAuthUser, getAuthUser, isAuthTokenExpired, setAuthUser } from "../utils/authStorage";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const decodeJwt = (token) => {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

export default function AuthMenu() {
  const [authUser, setAuthUserState] = useState(getAuthUser);
  const [scriptReady, setScriptReady] = useState(false);
  const [savedTrips, setSavedTrips] = useState([]);
  const buttonRef = useRef(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID) return;

    if (window.google?.accounts?.id) {
      setScriptReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptReady(true);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!CLIENT_ID || !scriptReady || !buttonRef.current || renderedRef.current) return;

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: async (response) => {
        const profile = decodeJwt(response.credential);
        if (!profile) return;

        let serverUser = null;
        try {
          const apiResponse = await fetch(`${API_URL}/api/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: response.credential }),
          });
          if (apiResponse.ok) {
            const data = await apiResponse.json();
            serverUser = data.user || null;
          }
        } catch {
          // keep local profile if backend is unavailable
        }

        const nextUser = {
          id: serverUser?.id || profile.sub,
          name: serverUser?.name || profile.name,
          email: serverUser?.email || profile.email,
          picture: serverUser?.picture || profile.picture,
          idToken: response.credential,
        };
        setAuthUser(nextUser);
        setAuthUserState(nextUser);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
    });

    renderedRef.current = true;
  }, [scriptReady]);

  useEffect(() => {
    console.log("AuthMenu - authUser:", authUser);
    if (!authUser?.idToken) {
      console.log("AuthMenu - No auth token, skipping trip fetch");
      return;
    }

    if (isAuthTokenExpired(authUser.idToken)) {
      clearAuthUser();
      setAuthUserState(null);
      return;
    }
    
    const fetchTrips = async () => {
      try {
        const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
        console.log("AuthMenu - Fetching trips from API...");
        const response = await fetch(`${API_URL}/api/trips`, {
          headers: { Authorization: `Bearer ${authUser.idToken}` }
        });
        const data = await response.json();
        console.log("AuthMenu - Trips API response:", data);
        if (data.success) {
          setSavedTrips(data.trips || []);
        }
      } catch (err) {
        console.error("AuthMenu - Failed to fetch trips:", err);
      }
    };
    
    fetchTrips();
  }, [authUser]);

  const handleTripClick = (trip) => {
    console.log("AuthMenu - Trip clicked:", trip);
    // Store trip for display and close menu
    localStorage.setItem('selectedTrip', JSON.stringify(trip));
    
    // Method 1: Custom event
    const event = new CustomEvent('showSavedTrip', { detail: trip });
    window.dispatchEvent(event);
    console.log("AuthMenu - Event dispatched", event);
    
    // Method 2: Also store globally for direct access
    window.currentSavedTrip = trip;
    console.log("AuthMenu - window.currentSavedTrip set");

    const closeMenuEvent = new CustomEvent('closeMenu');
    window.dispatchEvent(closeMenuEvent);
  };

  const handleLogout = () => {
    clearAuthUser();
    setAuthUserState(null);
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  };

  return (
    <div className="menu-dropdown">
      <div className="menu-title">Account</div>

      {authUser ? (
        <>
          <div className="menu-user">
            {authUser.picture ? (
              <img className="menu-avatar" src={authUser.picture} alt="" />
            ) : (
              <div className="menu-avatar placeholder" />
            )}
            <div className="menu-user-info">
              <div className="menu-user-name">{authUser.name || "Signed in"}</div>
              <div className="menu-user-email">{authUser.email}</div>
            </div>
          </div>
          <button type="button" className="menu-btn" onClick={handleLogout}>
            Log out
          </button>
          {console.log("AuthMenu - savedTrips:", savedTrips) || null}
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
          {savedTrips.length === 0 && authUser && (
            <div className="menu-muted">No saved trips yet</div>
          )}
        </>
      ) : (
        <>
          {CLIENT_ID ? (
            <div className="google-button-wrap" ref={buttonRef} />
          ) : (
            <div className="menu-muted">Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in.</div>
          )}
          <div className="menu-muted">Login is optional. You can continue as guest.</div>
        </>
      )}
    </div>
  );
}
