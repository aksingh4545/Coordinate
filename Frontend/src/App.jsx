import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { MapProvider } from "./context/MapContext";
import HomePage from "./pages/HomePage";
import HostRoomPage from "./pages/HostRoomPage";
import JoinRoomPage from "./pages/JoinRoomPage";
import MemberRoomPage from "./pages/MemberRoomPage";
import WatchRoomPage from "./pages/WatchRoomPage";
import AdminPage from "./pages/AdminPage";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Router>
      <MapProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/host/:roomId"
            element={(
              <ProtectedRoute>
                <HostRoomPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/join/:roomId"
            element={(
              <ProtectedRoute>
                <JoinRoomPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/room/:roomId"
            element={(
              <ProtectedRoute>
                <MemberRoomPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/watch/:roomId"
            element={(
              <ProtectedRoute>
                <WatchRoomPage />
              </ProtectedRoute>
            )}
          />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MapProvider>
    </Router>
  );
}

export default App;
