export default function CoordinatorLogo() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Outer circle */}
      <circle cx="50" cy="50" r="45" fill="url(#gradient1)" opacity="0.2" />
      
      {/* Connection lines */}
      <line x1="50" y1="50" x2="30" y2="30" stroke="#8b5cf6" strokeWidth="3" opacity="0.6" />
      <line x1="50" y1="50" x2="70" y2="30" stroke="#ec4899" strokeWidth="3" opacity="0.6" />
      <line x1="50" y1="50" x2="50" y2="75" stroke="#10b981" strokeWidth="3" opacity="0.6" />
      
      {/* Center point (Host) */}
      <circle cx="50" cy="50" r="12" fill="url(#gradient2)" />
      <circle cx="50" cy="50" r="6" fill="white" />
      
      {/* Satellite points (Members) */}
      <circle cx="30" cy="30" r="8" fill="#8b5cf6" />
      <circle cx="70" cy="30" r="8" fill="#ec4899" />
      <circle cx="50" cy="75" r="8" fill="#10b981" />
      
      {/* Gradients */}
      <defs>
        <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}
