import { useEffect, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

const getAvatarModel = (isHost, isCurrentUser, name = "") => {
  return "me";
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
    className: `custom-sticker-marker custom-sticker-marker-${modelName}`,
    iconSize: [40, 40],
    iconAnchor: [20, 38],
    popupAnchor: [0, -38],
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
        .custom-sticker-marker {
          background: transparent !important;
          border: none !important;
        }

        @keyframes sticker-bob-walk {
          0%, 100% {
            transform: translateY(0) rotate(-4deg);
          }
          50% {
            transform: translateY(-6px) rotate(4deg);
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
            transform: translateY(-2px) rotate(-1deg);
          }
          75% {
            transform: translateY(-2px) rotate(1deg);
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
          width: 40px;
          height: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          transform-origin: bottom center;
          will-change: transform;
        }

        .sticker-img {
          width: 32px;
          height: 32px;
          object-fit: contain;
          z-index: 2;
          border: 2px solid var(--accent-color);
          box-shadow: 0 2px 4px rgba(0,0,0,0.35);
          border-radius: 6px;
          will-change: transform;
        }

        .sticker-shadow {
          position: absolute;
          bottom: 0px;
          width: 18px;
          height: 4px;
          background: rgba(0,0,0,0.45);
          border-radius: 50%;
          z-index: 1;
          will-change: transform, scale, opacity;
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

