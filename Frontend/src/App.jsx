import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { MapProvider } from "./context/MapContext";
import HomePage from "./pages/HomePage";
import HostRoomPage from "./pages/HostRoomPage";
import JoinRoomPage from "./pages/JoinRoomPage";
import MemberRoomPage from "./pages/MemberRoomPage";

function App() {
  return (
    <Router>
      <MapProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/host/:roomId" element={<HostRoomPage />} />
          <Route path="/join/:roomId" element={<JoinRoomPage />} />
          <Route path="/room/:roomId" element={<MemberRoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MapProvider>
    </Router>
  );
}

export default App;
