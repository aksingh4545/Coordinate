export default function Navbar({ onJoinClick }) {
  return (
    <nav
      className="absolute top-4 left-1/2 -translate-x-1/2 
                 w-[90%] max-w-3xl px-6 py-2 
                 flex justify-between items-center 
                 rounded-full bg-white/30 backdrop-blur-md 
                 border border-white/20 shadow-md z-[400]"
    >
      <div className="text-gray-700 font-semibold tracking-wider">
        COORDINATOR
      </div>

      <div className="flex gap-6 text-gray-700 font-medium">
        <a href="#" className="hover:text-purple-500 transition">HOME</a>
        <a href="#" className="hover:text-purple-500 transition">MAP</a>
        <button
          onClick={onJoinClick}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1 rounded-full shadow-md hover:scale-105 transition"
        >
          Join Group
        </button>
      </div>
    </nav>
  );
}
