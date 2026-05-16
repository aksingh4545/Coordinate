// backend/server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import QRCode from 'qrcode';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { connectDB, getRoomsCollection, isDBConnected } from './db.js';
import placesRoutes from './Routes/places.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
      'https://coordinatev2.vercel.app',
      process.env.FRONTEND_URL,
      /https:\/\/.*\.vercel\.app$/,
      /https:\/\/.*\.onrender\.com$/,
      /https:\/\/.*\.ngrok-free\.dev$/,
    ].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 10e6,
});

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'https://coordinatev2.vercel.app',
    process.env.FRONTEND_URL,
    /https:\/\/.*\.vercel\.app$/,
    /https:\/\/.*\.onrender\.com$/,
    /https:\/\/.*\.ngrok-free\.dev$/,
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json());

// Google Places API routes
app.use('/api/places', placesRoutes);

// Hybrid storage: MongoDB + in-memory cache for real-time Socket.IO operations
const rooms = new Map(); // roomId -> room data (cache)
const userSockets = new Map(); // userId -> socketId
const userRooms = new Map(); // userId -> roomId

function getDefaultRoomSettings() {
  return {
    mode: "crowd",
    trackingRange: 30,
    targetLocation: null,
    mapStyle: "osm",
  };
}

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

// Helper: Safely execute MongoDB operation with fallback
async function safeMongoOperation(operation, fallback) {
  if (!isDBConnected()) {
    return fallback();
  }
  
  try {
    return await operation();
  } catch (err) {
    console.warn('⚠️  MongoDB operation failed, using fallback:', err.message);
    return fallback();
  }
}

async function getRoomFromCacheOrDb(roomId) {
  let room = rooms.get(roomId);
  if (room) return room;

  room = await safeMongoOperation(
    async () => {
      const roomsCollection = getRoomsCollection();
      const foundRoom = await roomsCollection.findOne({ roomId });
      if (foundRoom) {
        rooms.set(roomId, foundRoom);
      }
      return foundRoom;
    },
    () => null
  );

  return room;
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
      settings: getDefaultRoomSettings(),
    };

    // Save to MongoDB (with safe fallback)
    await safeMongoOperation(
      async () => {
        const roomsCollection = getRoomsCollection();
        await roomsCollection.insertOne(room);
      },
      () => {
        console.log('💾 Saving room to in-memory storage');
      }
    );
    
    // Add to cache
    rooms.set(roomId, room);

    // Generate QR code with join URL
    const joinUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join/${roomId}`;
    const qrCode = await QRCode.toDataURL(joinUrl);

    res.json({
      success: true,
      roomId,
      qrCode,
      joinUrl,
      settings: room.settings,
    });
  } catch (err) {
    console.error('Error creating room:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Join a room (Mobile users)
app.post('/api/rooms/join', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const roomId = (req.body.roomId || "").toUpperCase();
    if (!roomId || !userId || !userName) {
      return res.status(400).json({ error: 'roomId, userId, and userName are required' });
    }

    let room = rooms.get(roomId);
    
    // If not in cache, try MongoDB
    if (!room) {
      room = await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          const foundRoom = await roomsCollection.findOne({ roomId });
          if (foundRoom) {
            rooms.set(roomId, foundRoom);
          }
          return foundRoom;
        },
        () => null
      );
    }
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.isActive) {
      return res.status(400).json({ error: 'Room is no longer active' });
    }

    // Check if user already in room
    let memberIndex = room.members.findIndex(m => m.userId === userId);
    if (memberIndex !== -1) {
      room.members[memberIndex].name = userName;
      room.members[memberIndex].lastUpdate = Date.now();
    } else {
      room.members.push({
        userId,
        name: userName,
        location: { lat: 0, lng: 0 },
        lastUpdate: Date.now(),
      });
    }

    // Update MongoDB (with safe fallback)
    await safeMongoOperation(
      async () => {
        const roomsCollection = getRoomsCollection();
        await roomsCollection.updateOne(
          { roomId },
          { $set: { members: room.members } }
        );
      },
      () => console.log('💾 Updated room in in-memory storage')
    );

    // Update cache
    rooms.set(roomId, room);

    res.json({
      success: true,
      room: {
        roomId: room.roomId,
        hostId: room.hostId,
        hostName: room.hostName,
        settings: room.settings || getDefaultRoomSettings(),
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
    const roomId = (req.params.roomId || "").toUpperCase();
    let room = rooms.get(roomId);
    
    // If not in cache, try MongoDB
    if (!room) {
      room = await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          const foundRoom = await roomsCollection.findOne({ roomId });
          if (foundRoom) {
            rooms.set(roomId, foundRoom);
          }
          return foundRoom;
        },
        () => null
      );
    }

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
        settings: room.settings || getDefaultRoomSettings(),
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

    let room = rooms.get(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    room.members = room.members.filter(m => m.userId !== userId);
    
    // Delete room if empty
    if (room.members.length === 0) {
      await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          await roomsCollection.deleteOne({ roomId });
        },
        () => console.log('💾 Deleted room from in-memory storage')
      );
      rooms.delete(roomId);
    } else {
      // Update in MongoDB (with safe fallback)
      await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          await roomsCollection.updateOne(
            { roomId },
            { $set: { members: room.members } }
          );
        },
        () => console.log('💾 Updated room in in-memory storage')
      );
      // Update cache
      rooms.set(roomId, room);
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
  socket.on('location:update', async ({ userId, roomId, lat, lng, name }) => {
    let room = rooms.get(roomId);
    if (room) {
      // Update in cache
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

      // Update MongoDB asynchronously (don't wait)
      if (isDBConnected()) {
        const roomsCollection = getRoomsCollection();
        roomsCollection.updateOne(
          { roomId },
          { $set: { members: room.members } }
        ).catch(err => console.error('Error updating location in DB:', err.message));
      }

      // Update cache
      rooms.set(roomId, room);

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
  socket.on('room:sync', async ({ roomId }, callback) => {
    let room = rooms.get(roomId);
    
    // If not in cache, fetch from MongoDB
    if (!room) {
      room = await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          const foundRoom = await roomsCollection.findOne({ roomId });
          if (foundRoom) {
            rooms.set(roomId, foundRoom);
          }
          return foundRoom;
        },
        () => null
      );
    }
    
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

    callback({
      success: true,
      locations,
      hostId: room.hostId,
      settings: room.settings || getDefaultRoomSettings(),
    });
  });

  socket.on('room:settings:update', async ({ roomId, userId, settings }) => {
    let room = rooms.get(roomId);
    if (!room) return;
    if (userId !== room.hostId) return;

    const nextSettings = {
      ...(room.settings || getDefaultRoomSettings()),
      ...settings,
    };

    if (typeof nextSettings.trackingRange === 'number' && nextSettings.trackingRange < 5) {
      nextSettings.trackingRange = 5;
    }

    room.settings = nextSettings;
    rooms.set(roomId, room);

    if (isDBConnected()) {
      const roomsCollection = getRoomsCollection();
      roomsCollection.updateOne(
        { roomId },
        { $set: { settings: room.settings } }
      ).catch(err => console.error('Error updating settings in DB:', err.message));
    }

    io.to(roomId).emit('room:settings', room.settings);
  });

  socket.on('room:warning', ({ roomId, warning }) => {
    if (!rooms.get(roomId)) return;
    io.to(roomId).emit('room:warning', warning);
  });

  // ===== WALKIE-TALKIE HANDLERS =====

  // User starts talking (push-to-talk)
  socket.on('walkie:start', ({ roomId, userId, userName }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    console.log(`📻 ${userName} started talking in room ${normalizedRoomId}`);
    
    // Broadcast to all others in the room
    socket.to(normalizedRoomId).emit('walkie:Speaking', {
      userId,
      userName,
      roomId: normalizedRoomId
    });
  });

// User stops talking
  socket.on('walkie:stop', ({ roomId, userId }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    console.log(`📻 User ${userId} stopped talking in room ${normalizedRoomId}`);

    // Broadcast to all others in the room
    socket.to(normalizedRoomId).emit('walkie:Stopped', {
      userId,
      roomId: normalizedRoomId
    });
  });

  // ===== EMERGENCY SOS HANDLERS =====

  socket.on('sos:activate', ({ roomId, userId, userName, location }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    console.log(`🚨 SOS ACTIVATED by ${userName} in room ${normalizedRoomId}`);

    io.to(normalizedRoomId).emit('sos:activated', {
      userId,
      userName,
      roomId: normalizedRoomId,
      location: location,
      activatedAt: Date.now()
    });
  });

  socket.on('sos:cancel', ({ roomId, userId }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    console.log(`🚨 SOS CANCELLED by user ${userId} in room ${normalizedRoomId}`);

    io.to(normalizedRoomId).emit('sos:cancelled', {
      userId,
      roomId: normalizedRoomId
    });
  });

  socket.on('sos:countdown', ({ roomId, userId, seconds }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    socket.to(normalizedRoomId).emit('sos:countdown', {
      userId,
      roomId: normalizedRoomId,
      seconds
    });
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);

    // Find and remove user
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        const roomId = userRooms.get(userId);

        if (roomId) {
          let room = rooms.get(roomId);
          
          if (room) {
            // Remove member from cache
            room.members = room.members.filter(m => m.userId !== userId);
            
            // Update MongoDB (with safe fallback)
            if (room.members.length === 0) {
              await safeMongoOperation(
                async () => {
                  const roomsCollection = getRoomsCollection();
                  await roomsCollection.deleteOne({ roomId });
                },
                () => console.log('💾 Deleted room from in-memory storage')
              );
              rooms.delete(roomId);
            } else {
              await safeMongoOperation(
                async () => {
                  const roomsCollection = getRoomsCollection();
                  await roomsCollection.updateOne(
                    { roomId },
                    { $set: { members: room.members } }
                  );
                },
                () => console.log('💾 Updated room in in-memory storage')
              );
              rooms.set(roomId, room);
            }
            
            // Notify others
            io.to(roomId).emit('user:left', { userId });
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

// Start server with MongoDB connection
async function startServer() {
  try {
    await connectDB();
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      if (isDBConnected()) {
        console.log(`💾 Using MongoDB for persistent storage`);
      } else {
        console.log(`⚠️  Using in-memory storage (data lost on restart)`);
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
