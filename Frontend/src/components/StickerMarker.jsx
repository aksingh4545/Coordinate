import { useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

const createCleanMarkerIcon = (isHost, isCurrentUser, name = "", isWalking = false) => {
  const initial = (name || "?").charAt(0).toUpperCase();

  // Host is always Red, all other joining users are Green
  const color = isHost ? "#ef4444" : "#10b981";
  const bgGradient = isHost
    ? "linear-gradient(135deg, #dc2626, #ef4444)"
    : "linear-gradient(135deg, #059669, #10b981)";

  const glowColor = isHost
    ? "rgba(239, 68, 68, 0.35)"
    : "rgba(16, 185, 129, 0.35)";

  const animClass = isWalking ? "cmk-walking" : "cmk-idle";
  const userIndicator = isCurrentUser ? `<div class="cmk-you-dot" title="You"></div>` : "";

  return new L.DivIcon({
    html: `
      <div class="cmk-root ${animClass}">
        ${userIndicator}
        <div class="cmk-avatar" style="background:${bgGradient}; box-shadow: 0 0 0 2px ${color}, 0 3px 8px ${glowColor};">
          <span class="cmk-initial">${initial}</span>
        </div>
        <div class="cmk-tail" style="border-top-color: ${color};"></div>
        <div class="cmk-shadow"></div>
      </div>
    `,
    className: "custom-sticker-marker",
    iconSize: [26, 36],
    iconAnchor: [13, 29],
    popupAnchor: [0, -30],
  });
};

const StickerMarker = ({ position, isHost, isCurrentUser, name, isWalking }) => {
  const markerRef = useRef(null);
  const icon = createCleanMarkerIcon(isHost, isCurrentUser, name, isWalking);

  const roleSuffix = isHost && isCurrentUser
    ? " (You, Host)"
    : isHost
    ? " (Host)"
    : isCurrentUser
    ? " (You)"
    : "";

  return (
    <>
      <Marker ref={markerRef} position={position} icon={icon}>
        <Popup>
          <div className="cmk-popup">
            <span className="cmk-popup-name">{name}{roleSuffix}</span>
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
          width: 26px;
          height: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform-origin: bottom center;
          will-change: transform;
        }

        /* ===== Avatar circle ===== */
        .cmk-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 2;
          border: 2px solid rgba(255,255,255,0.95);
        }

        .cmk-initial {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 11px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1;
          letter-spacing: -0.3px;
          user-select: none;
        }

        /* ===== Tail pointer ===== */
        .cmk-tail {
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top-width: 6px;
          border-top-style: solid;
          margin-top: -1px;
          z-index: 2;
          position: relative;
        }

        /* ===== Drop shadow ellipse ===== */
        .cmk-shadow {
          width: 14px;
          height: 3px;
          background: rgba(0,0,0,0.3);
          border-radius: 50%;
          margin-top: 1px;
          z-index: 1;
        }

        /* ===== You indicator dot ===== */
        .cmk-you-dot {
          position: absolute;
          top: -3px;
          right: 0px;
          width: 7px;
          height: 7px;
          background: #ffffff;
          border: 1.5px solid #2563eb;
          border-radius: 50%;
          box-shadow: 0 0 5px rgba(37,99,235,0.8);
          z-index: 3;
          animation: youDotPulse 2s ease-in-out infinite;
        }

        @keyframes youDotPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 3px rgba(37,99,235,0.5); }
          50%       { transform: scale(1.15); box-shadow: 0 0 7px rgba(37,99,235,0.9); }
        }

        /* ===== Walking animation ===== */
        .cmk-root.cmk-walking .cmk-avatar {
          animation: cmkBobWalk 0.5s ease-in-out infinite alternate;
        }
        .cmk-root.cmk-walking .cmk-shadow {
          animation: cmkShadowWalk 0.5s ease-in-out infinite alternate;
        }

        @keyframes cmkBobWalk {
          from { transform: translateY(0) rotate(-2deg); }
          to   { transform: translateY(-3px) rotate(2deg); }
        }
        @keyframes cmkShadowWalk {
          from { transform: scaleX(1); opacity: 0.35; }
          to   { transform: scaleX(0.7); opacity: 0.15; }
        }

        /* ===== Idle float animation ===== */
        .cmk-root.cmk-idle .cmk-avatar {
          animation: cmkFloat 3s ease-in-out infinite;
        }

        @keyframes cmkFloat {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-2px); }
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
