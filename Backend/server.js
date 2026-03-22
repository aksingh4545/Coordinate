// backend/server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import QRCode from 'qrcode';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      process.env.FRONTEND_URL,
      /https:\/\/.*\.vercel\.app$/,
      /https:\/\/.*\.onrender\.com$/,
    ].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// In-memory storage (no database)
const rooms = new Map(); // roomId -> room data
const userSockets = new Map(); // userId -> socketId
const userRooms = new Map(); // userId -> roomId

// Helper: Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// API Routes

// Create a new room (Host)
app.post('/api/rooms/create', async (req, res) => {
  try {
    const { hostId, hostName } = req.body;
    if (!hostId || !hostName) {
      return res.status(400).json({ error: 'hostId and hostName are required' });
    }

    const roomId = crypto.randomUUID().slice(0, 8).toUpperCase();
    const room = {
      roomId,
      hostId,
      hostName,
      members: [],
      createdAt: Date.now(),
      isActive: true,
    };
    rooms.set(roomId, room);

    // Generate QR code with join URL
    const joinUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join/${roomId}`;
    const qrCode = await QRCode.toDataURL(joinUrl);

    res.json({
      success: true,
      roomId,
      qrCode,
      joinUrl
    });
  } catch (err) {
    console.error('Error creating room:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Join a room (Mobile users)
app.post('/api/rooms/join', async (req, res) => {
  try {
    const { roomId, userId, userName } = req.body;
    if (!roomId || !userId || !userName) {
      return res.status(400).json({ error: 'roomId, userId, and userName are required' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.isActive) {
      return res.status(400).json({ error: 'Room is no longer active' });
    }

    // Check if user already in room
    let member = room.members.find(m => m.userId === userId);
    if (member) {
      member.name = userName;
      member.lastUpdate = Date.now();
    } else {
      room.members.push({
        userId,
        name: userName,
        location: { lat: 0, lng: 0 },
        lastUpdate: Date.now(),
      });
    }

    res.json({
      success: true,
      room: {
        roomId: room.roomId,
        hostId: room.hostId,
        hostName: room.hostName,
      }
    });
  } catch (err) {
    console.error('Error joining room:', err);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Get room details
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = rooms.get(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const membersWithLocation = room.members.map(member => ({
      userId: member.userId,
      name: member.name,
      location: member.location,
      lastUpdate: member.lastUpdate,
    }));

    res.json({
      success: true,
      room: {
        roomId: room.roomId,
        hostId: room.hostId,
        hostName: room.hostName,
        members: membersWithLocation,
      }
    });
  } catch (err) {
    console.error('Error fetching room:', err);
    res.status(500).json({ error: 'Failed to fetch room details' });
  }
});

// Leave room
app.post('/api/rooms/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    room.members = room.members.filter(m => m.userId !== userId);
    
    // Delete room if empty and not host
    if (room.members.length === 0) {
      rooms.delete(roomId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error leaving room:', err);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // User joins with their ID
  socket.on('user:join', ({ userId, roomId }) => {
    userSockets.set(userId, socket.id);
    userRooms.set(userId, roomId);
    socket.join(roomId);
    console.log(`User ${userId} joined room ${roomId}`);
  });

  // Update user location
  socket.on('location:update', ({ userId, roomId, lat, lng, name }) => {
    const room = rooms.get(roomId);
    if (room) {
      // Update in memory
      let member = room.members.find(m => m.userId === userId);
      if (member) {
        member.location = { lat, lng };
        member.lastUpdate = Date.now();
        member.name = name;
      } else {
        room.members.push({
          userId,
          name,
          location: { lat, lng },
          lastUpdate: Date.now(),
        });
      }

      // Broadcast to all in room
      io.to(roomId).emit('location:updated', {
        userId,
        name,
        lat,
        lng,
        timestamp: Date.now(),
      });
    }
  });

  // Get all current locations in room
  socket.on('room:sync', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      callback({ error: 'Room not found' });
      return;
    }

    const locations = room.members
      .filter(m => m.location && m.location.lat !== 0 && m.location.lng !== 0)
      .map(m => ({
        userId: m.userId,
        name: m.name,
        lat: m.location.lat,
        lng: m.location.lng,
        isHost: m.userId === room.hostId,
      }));

    callback({ success: true, locations, hostId: room.hostId });
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);

    // Find and remove user
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        const roomId = userRooms.get(userId);

        if (roomId) {
          const room = rooms.get(roomId);
          if (room) {
            // Remove member from room
            room.members = room.members.filter(m => m.userId !== userId);
            
            // Notify others
            io.to(roomId).emit('user:left', { userId });
            
            // Clean up empty room
            if (room.members.length === 0) {
              rooms.delete(roomId);
            }
          }
        }

        userSockets.delete(userId);
        userRooms.delete(userId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`💾 Using in-memory storage (data lost on restart)`);
});
