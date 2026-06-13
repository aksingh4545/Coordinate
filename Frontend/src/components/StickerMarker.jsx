import { useEffect, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

const getAvatarModel = (isHost, isCurrentUser, name = "") => {
  if (isCurrentUser) return "carla";
  if (isHost) return "eric";
  
  const hash = (name || "").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? "claudia" : "eric";
};

const createStickerIcon = (modelName, isWalking, accentColor) => {
  const animClass = isWalking ? "walking" : "waving";
  
  return new L.DivIcon({
    html: `
      <div class="sticker-marker-wrapper ${animClass}" style="--accent-color: ${accentColor};">
        <img src="/stickers/${modelName}.png" class="sticker-img" alt="${modelName}" />
        <div class="sticker-shadow"></div>
      </div>
    `,
    className: `custom-sticker-marker-${modelName}`,
    iconSize: [60, 60],
    iconAnchor: [30, 50],
    popupAnchor: [0, -50],
  });
};

const StickerMarker = ({ position, isHost, isCurrentUser, name, isWalking }) => {
  const markerRef = useRef(null);
  const modelName = getAvatarModel(isHost, isCurrentUser, name);
  
  // Decide accent color for the sticker outline glow
  const accentColor = isCurrentUser ? "#10b981" : isHost ? "#8b5cf6" : "#ec4899";

  const customIcon = createStickerIcon(modelName, isWalking, accentColor);

  return (
    <>
      <Marker ref={markerRef} position={position} icon={customIcon}>
        <Popup>
          <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold" }}>
            {name} {isCurrentUser ? "📍" : ""} {isHost ? "🎯" : ""}
          </p>
        </Popup>
      </Marker>

      {/* Inject custom scoped animations */}
      <style>{`
        @keyframes sticker-bob-walk {
          0%, 100% {
            transform: translateY(0) rotate(-4deg);
          }
          50% {
            transform: translateY(-10px) rotate(4deg);
          }
        }

        @keyframes sticker-shadow-walk {
          0%, 100% {
            transform: scale(1);
            opacity: 0.45;
          }
          50% {
            transform: scale(0.75);
            opacity: 0.15;
          }
        }

        @keyframes sticker-wave-idle {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          25% {
            transform: translateY(-3px) rotate(-1.5deg);
          }
          75% {
            transform: translateY(-3px) rotate(1.5deg);
          }
        }

        @keyframes sticker-shadow-idle {
          0%, 100% {
            transform: scale(1);
            opacity: 0.45;
          }
          50% {
            transform: scale(0.9);
            opacity: 0.3;
          }
        }

        .sticker-marker-wrapper {
          position: relative;
          width: 60px;
          height: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          transform-origin: bottom center;
        }

        .sticker-img {
          width: 50px;
          height: 50px;
          object-fit: contain;
          z-index: 2;
          filter: drop-shadow(0 0 6px var(--accent-color)) drop-shadow(0 3px 6px rgba(0,0,0,0.4));
          border-radius: 8px;
        }

        .sticker-shadow {
          position: absolute;
          bottom: 2px;
          width: 26px;
          height: 6px;
          background: rgba(0,0,0,0.5);
          border-radius: 50%;
          filter: blur(1.5px);
          z-index: 1;
          transition: all 0.3s ease;
        }

        /* Walking state animations */
        .sticker-marker-wrapper.walking .sticker-img {
          animation: sticker-bob-walk 0.55s infinite ease-in-out;
        }

        .sticker-marker-wrapper.walking .sticker-shadow {
          animation: sticker-shadow-walk 0.55s infinite ease-in-out;
        }

        /* Waving/Idle state animations */
        .sticker-marker-wrapper.waving .sticker-img {
          animation: sticker-wave-idle 2.4s infinite ease-in-out;
        }

        .sticker-marker-wrapper.waving .sticker-shadow {
          animation: sticker-shadow-idle 2.4s infinite ease-in-out;
        }
      `}</style>
    </>
  );
};

export default StickerMarker;
