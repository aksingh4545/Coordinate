import { useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

const createCleanMarkerIcon = (isHost, isCurrentUser, name = "", isWalking = false) => {
  const initial = (name || "?").charAt(0).toUpperCase();
  const accentColor = isCurrentUser ? "#10b981" : isHost ? "#8b5cf6" : "#ec4899";
  const bgGradient = isCurrentUser
    ? "linear-gradient(135deg, #059669, #10b981)"
    : isHost
    ? "linear-gradient(135deg, #6d28d9, #8b5cf6)"
    : "linear-gradient(135deg, #be185d, #ec4899)";

  const glowColor = isCurrentUser
    ? "rgba(16,185,129,0.55)"
    : isHost
    ? "rgba(139,92,246,0.55)"
    : "rgba(236,72,153,0.45)";

  const ringColor = isCurrentUser ? "#10b981" : isHost ? "#8b5cf6" : "#ec4899";
  const animClass = isWalking ? "cmk-walking" : "cmk-idle";

  // Crown svg for host, dot for current user
  const badge = isHost
    ? `<div class="cmk-crown">👑</div>`
    : isCurrentUser
    ? `<div class="cmk-you-dot"></div>`
    : "";

  return new L.DivIcon({
    html: `
      <div class="cmk-root ${animClass}">
        ${badge}
        <div class="cmk-avatar" style="background:${bgGradient}; box-shadow: 0 0 0 2.5px ${ringColor}, 0 4px 14px ${glowColor};">
          <span class="cmk-initial">${initial}</span>
        </div>
        <div class="cmk-tail" style="border-top-color: ${ringColor};"></div>
        <div class="cmk-shadow"></div>
      </div>
    `,
    className: "custom-sticker-marker",
    iconSize: [44, 58],
    iconAnchor: [22, 54],
    popupAnchor: [0, -56],
  });
};

const StickerMarker = ({ position, isHost, isCurrentUser, name, isWalking }) => {
  const markerRef = useRef(null);
  const icon = createCleanMarkerIcon(isHost, isCurrentUser, name, isWalking);

  const roleLabel = isHost && isCurrentUser
    ? "You · Host"
    : isHost
    ? "Host"
    : isCurrentUser
    ? "You"
    : null;

  return (
    <>
      <Marker ref={markerRef} position={position} icon={icon}>
        <Popup>
          <div className="cmk-popup">
            <span className="cmk-popup-name">{name}</span>
            {roleLabel && <span className="cmk-popup-role">{roleLabel}</span>}
          </div>
        </Popup>
      </Marker>

      <style>{`
        .custom-sticker-marker {
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
        }

        /* ===== Root wrapper ===== */
        .cmk-root {
          position: relative;
          width: 44px;
          height: 58px;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform-origin: bottom center;
          will-change: transform;
        }

        /* ===== Avatar circle ===== */
        .cmk-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 2;
          border: 2.5px solid rgba(255,255,255,0.9);
        }

        .cmk-initial {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1;
          letter-spacing: -0.5px;
          user-select: none;
        }

        /* ===== Tail pointer ===== */
        .cmk-tail {
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top-width: 9px;
          border-top-style: solid;
          margin-top: -2px;
          z-index: 2;
          position: relative;
        }

        /* ===== Drop shadow ellipse ===== */
        .cmk-shadow {
          width: 20px;
          height: 5px;
          background: rgba(0,0,0,0.3);
          border-radius: 50%;
          margin-top: 2px;
          z-index: 1;
        }

        /* ===== Crown badge (host) ===== */
        .cmk-crown {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 13px;
          line-height: 1;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
          z-index: 3;
          pointer-events: none;
        }

        /* ===== You dot (current user) ===== */
        .cmk-you-dot {
          position: absolute;
          top: -6px;
          right: 4px;
          width: 9px;
          height: 9px;
          background: #10b981;
          border: 2px solid #fff;
          border-radius: 50%;
          box-shadow: 0 0 6px rgba(16,185,129,0.7);
          z-index: 3;
          animation: youDotPulse 2s ease-in-out infinite;
        }

        @keyframes youDotPulse {
          0%, 100% { box-shadow: 0 0 4px rgba(16,185,129,0.5); }
          50%       { box-shadow: 0 0 10px rgba(16,185,129,0.9); }
        }

        /* ===== Walking animation ===== */
        .cmk-root.cmk-walking .cmk-avatar {
          animation: cmkBobWalk 0.5s ease-in-out infinite alternate;
        }
        .cmk-root.cmk-walking .cmk-shadow {
          animation: cmkShadowWalk 0.5s ease-in-out infinite alternate;
        }

        @keyframes cmkBobWalk {
          from { transform: translateY(0) rotate(-3deg); }
          to   { transform: translateY(-5px) rotate(3deg); }
        }
        @keyframes cmkShadowWalk {
          from { transform: scaleX(1); opacity: 0.35; }
          to   { transform: scaleX(0.7); opacity: 0.12; }
        }

        /* ===== Idle float animation ===== */
        .cmk-root.cmk-idle .cmk-avatar {
          animation: cmkFloat 3s ease-in-out infinite;
        }

        @keyframes cmkFloat {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-4px); }
        }

        /* ===== Popup ===== */
        .cmk-popup {
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          padding: 1px 2px;
        }

        .cmk-popup-name {
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
          font-family: 'Inter', sans-serif;
        }

        .cmk-popup-role {
          font-size: 9px;
          font-weight: 700;
          background: rgba(139,92,246,0.3);
          color: #c4b5fd;
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: 4px;
          padding: 1px 5px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
      `}</style>
    </>
  );
};

export default StickerMarker;
