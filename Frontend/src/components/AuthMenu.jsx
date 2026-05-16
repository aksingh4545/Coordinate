import { useEffect, useRef, useState } from "react";
import { clearAuthUser, getAuthUser, setAuthUser } from "../utils/authStorage";

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
