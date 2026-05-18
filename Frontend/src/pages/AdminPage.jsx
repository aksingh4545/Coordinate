import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminPage.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function AdminPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adminKey, setAdminKey] = useState(localStorage.getItem("adminKey") || "");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Dashboard stats
  const [stats, setStats] = useState({ totalRooms: 0, activeRooms: 0, totalTrips: 0, sosCount: 0, dbConnected: false });
  
  // Rooms
  const [rooms, setRooms] = useState([]);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [roomsPage, setRoomsPage] = useState(0);
  const [roomFilter, setRoomFilter] = useState({ status: "", mode: "" });
  
  // Users
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  
  // Trips
  const [trips, setTrips] = useState([]);
  const [tripsTotal, setTripsTotal] = useState(0);
  const [tripsPage, setTripsPage] = useState(0);
  
  // System
  const [system, setSystem] = useState(null);

  const checkAuth = async () => {
    if (!adminKey) return false;
    try {
      const res = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { "x-admin-key": adminKey }
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  // Test server connectivity on mount
  useEffect(() => {
    fetch(`${API_URL}/api/admin/ping`)
      .then(res => console.log("Server ping:", res.ok))
      .catch(err => console.error("Server not reachable:", err));
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboard();
    }
  }, [isAuthenticated, adminKey]);

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === "dashboard") loadDashboard();
      else if (activeTab === "rooms") loadRooms();
      else if (activeTab === "users") loadUsers();
      else if (activeTab === "trips") loadTrips();
      else if (activeTab === "system") loadSystem();
    }
  }, [isAuthenticated, activeTab, roomsPage, usersPage, tripsPage, roomFilter]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      console.log("Attempting login with key:", adminKey);
      console.log("API URL:", API_URL);
      
      const res = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { 
          "x-admin-key": adminKey,
          "Content-Type": "application/json"
        }
      });
      
      console.log("Response status:", res.status);
      console.log("Response ok:", res.ok);
      
      if (res.ok) {
        localStorage.setItem("adminKey", adminKey);
        setIsAuthenticated(true);
      } else {
        const data = await res.json();
        console.log("Error response:", data);
        setError(data.error || "Invalid admin key");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to connect to server: " + err.message);
    }
    setLoading(false);
  };

  const loadDashboard = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { "x-admin-key": adminKey }
      });
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const loadRooms = async () => {
    try {
      const params = new URLSearchParams({
        limit: 20,
        offset: roomsPage * 20,
        ...(roomFilter.status && { status: roomFilter.status }),
        ...(roomFilter.mode && { mode: roomFilter.mode })
      });
      
      const res = await fetch(`${API_URL}/api/admin/rooms?${params}`, {
        headers: { "x-admin-key": adminKey }
      });
      const data = await res.json();
      if (data.success) {
        setRooms(data.rooms);
        setRoomsTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to load rooms:", err);
    }
  };

  const loadUsers = async () => {
    try {
      const params = new URLSearchParams({
        limit: 20,
        offset: usersPage * 20
      });
      
      const res = await fetch(`${API_URL}/api/admin/users?${params}`, {
        headers: { "x-admin-key": adminKey }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        setUsersTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  const loadTrips = async () => {
    try {
      const params = new URLSearchParams({
        limit: 20,
        offset: tripsPage * 20
      });
      
      const res = await fetch(`${API_URL}/api/admin/trips?${params}`, {
        headers: { "x-admin-key": adminKey }
      });
      const data = await res.json();
      if (data.success) {
        setTrips(data.trips);
        setTripsTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to load trips:", err);
    }
  };

  const loadSystem = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/system`, {
        headers: { "x-admin-key": adminKey }
      });
      const data = await res.json();
      if (data.success) setSystem(data.system);
    } catch (err) {
      console.error("Failed to load system:", err);
    }
  };

  const deleteRoom = async (roomId) => {
    if (!confirm(`Delete room ${roomId}?`)) return;
    
    try {
      const res = await fetch(`${API_URL}/api/admin/rooms/${roomId}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey }
      });
      if (res.ok) {
        loadRooms();
      }
    } catch (err) {
      console.error("Failed to delete room:", err);
    }
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="admin-login-box">
          <h1>🔐 Admin Login</h1>
          <p>Enter your admin key to access the panel</p>
          
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Admin Key"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Checking..." : "Login"}
            </button>
          </form>
          
          {error && <div className="admin-error">{error}</div>}
          
          <button className="back-home" onClick={() => navigate("/")}>
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-sidebar">
        <div className="admin-logo">⚙️ Admin Panel</div>
        <nav className="admin-nav">
          <button 
            className={activeTab === "dashboard" ? "active" : ""}
            onClick={() => setActiveTab("dashboard")}
          >
            📊 Dashboard
          </button>
          <button 
            className={activeTab === "rooms" ? "active" : ""}
            onClick={() => setActiveTab("rooms")}
          >
            🏠 Rooms
          </button>
          <button 
            className={activeTab === "users" ? "active" : ""}
            onClick={() => setActiveTab("users")}
          >
            👥 Users
          </button>
          <button 
            className={activeTab === "trips" ? "active" : ""}
            onClick={() => setActiveTab("trips")}
          >
            🗺️ Trips
          </button>
          <button 
            className={activeTab === "system" ? "active" : ""}
            onClick={() => setActiveTab("system")}
          >
            💻 System
          </button>
        </nav>
        <button className="admin-logout" onClick={() => {
          localStorage.removeItem("adminKey");
          setIsAuthenticated(false);
          setAdminKey("");
        }}>
          🚪 Logout
        </button>
      </div>

      <div className="admin-content">
        <header className="admin-header">
          <h2>
            {activeTab === "dashboard" && "Dashboard Overview"}
            {activeTab === "rooms" && "Room Management"}
            {activeTab === "users" && "User Management"}
            {activeTab === "trips" && "Trips & History"}
            {activeTab === "system" && "System Information"}
          </h2>
        </header>

        <div className="admin-body">
          {/* Dashboard Tab */}
          {activeTab === "dashboard" && (
            <div className="dashboard-grid">
              <div className="stat-card">
                <div className="stat-icon">🏠</div>
                <div className="stat-value">{stats.totalRooms}</div>
                <div className="stat-label">Total Rooms</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-value">{stats.activeRooms}</div>
                <div className="stat-label">Active Rooms</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🗺️</div>
                <div className="stat-value">{stats.totalTrips}</div>
                <div className="stat-label">Total Trips</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🆘</div>
                <div className="stat-value">{stats.sosCount}</div>
                <div className="stat-label">SOS Alerts</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">💾</div>
                <div className="stat-value">{stats.dbConnected ? "✅" : "❌"}</div>
                <div className="stat-label">Database</div>
              </div>
            </div>
          )}

          {/* Rooms Tab */}
          {activeTab === "rooms" && (
            <div className="admin-section">
              <div className="section-filters">
                <select 
                  value={roomFilter.status}
                  onChange={(e) => {
                    setRoomFilter({ ...roomFilter, status: e.target.value });
                    setRoomsPage(0);
                  }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select 
                  value={roomFilter.mode}
                  onChange={(e) => {
                    setRoomFilter({ ...roomFilter, mode: e.target.value });
                    setRoomsPage(0);
                  }}
                >
                  <option value="">All Modes</option>
                  <option value="crowd">Crowd</option>
                  <option value="tracking">Tracking</option>
                  <option value="trip">Trip</option>
                </select>
              </div>

              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room ID</th>
                      <th>Host</th>
                      <th>Mode</th>
                      <th>Members</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map(room => (
                      <tr key={room.roomId}>
                        <td>{room.roomId}</td>
                        <td>{room.hostName || "Unknown"}</td>
                        <td><span className={`mode-badge ${room.settings?.mode}`}>{room.settings?.mode || "crowd"}</span></td>
                        <td>{room.members?.length || 0}</td>
                        <td>{formatDate(room.createdAt)}</td>
                        <td><span className={`status-badge ${room.isActive ? "active" : "inactive"}`}>{room.isActive ? "Active" : "Inactive"}</span></td>
                        <td>
                          <button className="btn-delete" onClick={() => deleteRoom(room.roomId)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button disabled={roomsPage === 0} onClick={() => setRoomsPage(p => p - 1)}>Prev</button>
                <span>Page {roomsPage + 1} of {Math.ceil(roomsTotal / 20)}</span>
                <button disabled={(roomsPage + 1) * 20 >= roomsTotal} onClick={() => setRoomsPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <div className="admin-section">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.googleSub || user.userId}>
                        <td>{user.googleSub || user.userId}</td>
                        <td>{user.name || "Unknown"}</td>
                        <td>{user.email || "N/A"}</td>
                        <td>{formatDate(user.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button disabled={usersPage === 0} onClick={() => setUsersPage(p => p - 1)}>Prev</button>
                <span>Page {usersPage + 1} of {Math.ceil(usersTotal / 20)}</span>
                <button disabled={(usersPage + 1) * 20 >= usersTotal} onClick={() => setUsersPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}

          {/* Trips Tab */}
          {activeTab === "trips" && (
            <div className="admin-section">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Trip Name</th>
                      <th>User</th>
                      <th>Room</th>
                      <th>Path Points</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((trip, i) => (
                      <tr key={i}>
                        <td>{trip.name || "Unnamed Trip"}</td>
                        <td>{trip.userId || "Unknown"}</td>
                        <td>{trip.roomId || "N/A"}</td>
                        <td>{trip.path?.length || 0}</td>
                        <td>{formatDate(trip.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button disabled={tripsPage === 0} onClick={() => setTripsPage(p => p - 1)}>Prev</button>
                <span>Page {tripsPage + 1} of {Math.ceil(tripsTotal / 20)}</span>
                <button disabled={(tripsPage + 1) * 20 >= tripsTotal} onClick={() => setTripsPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}

          {/* System Tab */}
          {activeTab === "system" && system && (
            <div className="admin-section">
              <div className="system-info-grid">
                <div className="info-card">
                  <div className="info-label">Database Status</div>
                  <div className="info-value">{system.dbConnected ? "✅ Connected" : "❌ Disconnected"}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Node.js Version</div>
                  <div className="info-value">{system.nodeVersion}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Server Uptime</div>
                  <div className="info-value">{formatUptime(system.uptime)}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Rooms in Memory</div>
                  <div className="info-value">{system.roomsInMemory}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Users in Memory</div>
                  <div className="info-value">{system.usersInMemory}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Trips in Memory</div>
                  <div className="info-value">{system.tripsInMemory}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}