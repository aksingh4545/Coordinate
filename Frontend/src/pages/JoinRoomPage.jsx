import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMap } from "../context/MapContext";

export default function JoinRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { joinRoom, currentRoom, isLoading, error } = useMap();
  const [memberName, setMemberName] = useState("");
  const [roomInfo, setRoomInfo] = useState(null);
  const [localError, setLocalError] = useState("");

  // Fetch room info on mount
  useEffect(() => {
    const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
    const fetchRoomInfo = async () => {
      try {
        const response = await fetch(`${API_URL}/api/rooms/${roomId}`);
        const data = await response.json();
        if (data.success) {
          setRoomInfo(data.room);
        } else {
          setLocalError(data.error || "Room not found");
        }
      } catch (err) {
        setLocalError("Failed to fetch room information");
      }
    };

    fetchRoomInfo();
  }, [roomId]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!memberName.trim()) {
      setLocalError("Please enter your name");
      return;
    }

    try {
      await joinRoom(roomId, memberName.trim());
      navigate(`/room/${roomId}`);
    } catch (err) {
      setLocalError(err.message || "Failed to join room");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Join Group
          </h1>
          {roomInfo && (
            <p className="text-gray-600 mt-2">
              Host: <span className="font-semibold">{roomInfo.hostName}</span>
            </p>
          )}
          <div className="mt-3 bg-purple-50 inline-block px-4 py-2 rounded-lg">
            <p className="text-sm text-gray-500">Group Code</p>
            <p className="text-2xl font-mono font-bold text-purple-600">{roomId}</p>
          </div>
        </div>

        <form onSubmit={handleJoin}>
          <div className="mb-6">
            <label className="block text-gray-700 mb-2 font-medium">
              Your Name
            </label>
            <input
              type="text"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {(localError || error) && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-center text-sm">
              {localError || error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-medium"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:shadow-lg disabled:opacity-50 transition font-medium"
            >
              {isLoading ? "Joining..." : "Join Group"}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>📍 Your location will be shared with the group</p>
        </div>
      </div>
    </div>
  );
}
