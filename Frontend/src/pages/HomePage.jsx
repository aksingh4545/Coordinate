import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";
import CoordinatorLogo from "../assets/CoordinatorLogo";

export default function HomePage() {
  const navigate = useNavigate();
  const { createRoom, joinRoom, isLoading, error } = useMap();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [hostName, setHostName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [localError, setLocalError] = useState("");

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!hostName.trim()) {
      setLocalError("Please enter your name");
      return;
    }

    try {
      const data = await createRoom(hostName.trim());
      navigate(`/host/${data.roomId}`);
    } catch (err) {
      setLocalError(err.message || "Failed to create room");
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomId.trim() || !memberName.trim()) {
      setLocalError("Please fill in all fields");
      return;
    }

    try {
      await joinRoom(roomId.trim().toUpperCase(), memberName.trim());
      navigate(`/room/${roomId.trim().toUpperCase()}`);
    } catch (err) {
      setLocalError(err.message || "Failed to join room");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-lg w-full relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-10">
          <div className="mx-auto w-28 h-28 mb-6 animate-float">
            <CoordinatorLogo />
          </div>
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent mb-3">
            Coordinator
          </h1>
          <p className="text-gray-300 text-lg font-light tracking-wide">
            Find your group in crowded places
          </p>
        </div>

        {/* Main Action Cards */}
        <div className="space-y-6">
          <button
            onClick={() => setShowCreateModal(true)}
            className="group w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-5 px-8 rounded-2xl shadow-2xl hover:shadow-purple-500/50 hover:scale-[1.02] transition-all duration-300 font-semibold text-lg border border-white/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-700 to-pink-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative flex items-center justify-center gap-3">
              <span className="text-2xl">🎯</span>
              <span>Create New Group</span>
            </span>
          </button>

          <button
            onClick={() => setShowJoinModal(true)}
            className="group w-full bg-white/10 backdrop-blur-lg text-white py-5 px-8 rounded-2xl shadow-2xl hover:bg-white/20 hover:scale-[1.02] hover:shadow-pink-500/30 transition-all duration-300 font-semibold text-lg border border-white/20 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative flex items-center justify-center gap-3">
              <span className="text-2xl">📱</span>
              <span>Join Existing Group</span>
            </span>
          </button>
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-2">📍</div>
            <p className="text-gray-300 text-xs font-medium">Real-time Location</p>
          </div>
          <div className="text-center p-4 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-2">📊</div>
            <p className="text-gray-300 text-xs font-medium">Distance Tracking</p>
          </div>
          <div className="text-center p-4 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-2">🔗</div>
            <p className="text-gray-300 text-xs font-medium">Visual Map</p>
          </div>
        </div>

        {/* Error Display */}
        {(error || localError) && (
          <div className="mt-6 bg-red-500/20 backdrop-blur-sm border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-center text-sm animate-slide-in">
            <span className="mr-2">⚠️</span>
            {localError || error}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-xs">
            Perfect for events, festivals, and group outings
          </p>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10 animate-slide-in">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🎯</div>
              <h2 className="text-2xl font-bold text-white">
                Create New Group
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Start a group and invite others
              </p>
            </div>
            <form onSubmit={handleCreateRoom}>
              <div className="mb-6">
                <label className="block text-gray-300 mb-2 font-medium text-sm">
                  Your Name (Host)
                </label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setLocalError("");
                  }}
                  className="flex-1 px-4 py-3.5 bg-white/5 text-gray-300 rounded-xl hover:bg-white/10 transition font-medium border border-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    "Create Group"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10 animate-slide-in">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">📱</div>
              <h2 className="text-2xl font-bold text-white">
                Join Group
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Enter the group code to connect
              </p>
            </div>
            <form onSubmit={handleJoinRoom}>
              <div className="mb-5">
                <label className="block text-gray-300 mb-2 font-medium text-sm">
                  Group Code / Room ID
                </label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none font-mono tracking-wider uppercase"
                  autoFocus
                />
              </div>
              <div className="mb-6">
                <label className="block text-gray-300 mb-2 font-medium text-sm">
                  Your Name
                </label>
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setLocalError("");
                  }}
                  className="flex-1 px-4 py-3.5 bg-white/5 text-gray-300 rounded-xl hover:bg-white/10 transition font-medium border border-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Joining...
                    </span>
                  ) : (
                    "Join Group"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global styles for animations */}
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
