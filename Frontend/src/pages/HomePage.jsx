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
    <div className="home-page">
      {/* scrolling world map background */}
      <div className="earth-bg"></div>

      {/* top bar */}
      <header className="top-glass-bar">
        <div className="brand-small">Coordinator</div>
        <div className="tagline-top">Find your group in crowded places</div>
        <div className="menu-icon">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </header>

      {/* center content */}
      <main className="home-content">
        <div className="hero-logo">
          <CoordinatorLogo />
        </div>

        <h1 className="hero-title">Coordinator</h1>
        <p className="hero-subtitle">
          Find your group in crowded places
        </p>

        <div className="hero-actions">
          <button
            onClick={() => setShowJoinModal(true)}
            className="action-card join-card"
          >
            <div className="action-icon">👥</div>
            <div className="action-label">Join Room</div>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="action-card create-card"
          >
            <div className="action-icon">＋</div>
            <div className="action-label">Create Room</div>
          </button>
        </div>

        <p className="hero-footer">
          Live location, smart coordination, and a better way to stay connected
        </p>

        {(error || localError) && (
          <div className="home-error">
            {localError || error}
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="modal-backdrop-custom">
          <div className="custom-modal">
            <div className="modal-head">
              <div className="modal-icon">＋</div>
              <h2>Create Room</h2>
              <p>Start a room and invite your group</p>
            </div>

            <form onSubmit={handleCreateRoom}>
              <div className="input-group">
                <label>Your Name</label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    setLocalError("");
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="modal-btn primary"
                >
                  {isLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="modal-backdrop-custom">
          <div className="custom-modal">
            <div className="modal-head">
              <div className="modal-icon">👥</div>
              <h2>Join Room</h2>
              <p>Enter room details to join your group</p>
            </div>

            <form onSubmit={handleJoinRoom}>
              <div className="input-group">
                <label>Room ID</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  autoFocus
                />
              </div>

              <div className="input-group">
                <label>Your Name</label>
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn secondary"
                  onClick={() => {
                    setShowJoinModal(false);
                    setLocalError("");
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="modal-btn primary"
                >
                  {isLoading ? "Joining..." : "Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}