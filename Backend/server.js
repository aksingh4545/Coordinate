// backend/server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import QRCode from 'qrcode';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import twilio from 'twilio';
import { connectDB, getRoomsCollection, getTripsCollection, getUsersCollection, isDBConnected } from './db.js';
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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = (twilioAccountSid && twilioAuthToken)
  ? twilio(twilioAccountSid, twilioAuthToken)
  : null;

// Google Auth - verify ID token and upsert user
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    const payload = await verifyGoogleToken(idToken);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    if (!isDBConnected()) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const usersCollection = getUsersCollection();
    const userDoc = {
      googleSub: payload.sub,
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    };

    await usersCollection.updateOne(
      { googleSub: payload.sub },
      { $set: userDoc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    res.json({
      success: true,
      user: {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
      },
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// In-memory fallback for trips
const tripsMemory = [];

// Save trip route (requires Google ID token)
app.post('/api/trips', requireAuth, async (req, res) => {
  try {
    const payload = req.user;

    if (!isDBConnected()) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const {
      roomId,
      tripName,
      startLocation,
      endLocation,
      targetLocation,
      path,
      startedAt,
      endedAt,
      durationMs,
    } = req.body || {};

    console.log('Saving trip:', { tripName, startLocation, endLocation, path: path?.length });

    if (!tripName || !startLocation || !endLocation || !Array.isArray(path) || path.length < 2) {
      return res.status(400).json({ error: 'Invalid trip data - need tripName, startLocation, endLocation, and path with 2+ points' });
    }

    const doc = {
      userId: payload.sub,
      userEmail: payload.email,
      roomId: (roomId || '').toUpperCase(),
      tripName,
      startLocation,
      endLocation,
      targetLocation: targetLocation || null,
      path,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      endedAt: endedAt ? new Date(endedAt) : new Date(),
      durationMs: typeof durationMs === 'number' ? durationMs : null,
      createdAt: new Date(),
    };

    // Try MongoDB first, fallback to in-memory
    if (isDBConnected()) {
      try {
        const tripsCollection = getTripsCollection();
        if (tripsCollection) {
          const result = await tripsCollection.insertOne(doc);
          console.log('Trip saved to MongoDB:', result.insertedId);
          return res.json({ success: true, tripId: result.insertedId });
        }
      } catch (mongoErr) {
        console.warn('MongoDB write failed, using in-memory fallback:', mongoErr.message);
      }
    }

    // Fallback to in-memory storage
    const tripId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    doc._id = tripId;
    tripsMemory.push(doc);
    console.log('Trip saved to in-memory storage:', tripId);
    res.json({ success: true, tripId: tripId, isMemory: true });
  } catch (err) {
    console.error('Trip save error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to save trip: ' + err.message });
  }
});

// Get user's saved trips
app.get('/api/trips', requireAuth, async (req, res) => {
  try {
    console.log('GET /api/trips - user:', req.user?.sub);
    
    // Always check memory fallback
    const memoryTrips = tripsMemory
      .filter(t => t.userId === req.user.sub)
      .map(t => ({ ...t, _id: undefined }));
    console.log('GET /api/trips - memory trips count:', memoryTrips.length);
    
    if (!isDBConnected()) {
      return res.json({ success: true, trips: memoryTrips });
    }
    
    const tripsCollection = getTripsCollection();
    let trips = [];

    try {
      trips = await tripsCollection
        .find({ userId: req.user.sub })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (err) {
      console.warn('GET /api/trips - sorted query failed, retrying without sort:', err.message);
      trips = await tripsCollection
        .find({ userId: req.user.sub })
        .toArray();
    }

    console.log('GET /api/trips - db trips count:', trips.length, 'path:', trips[0]?.path?.length);
    
    // If no trips in DB, also return memory trips
    const allTrips = trips.length > 0 ? trips : memoryTrips;
    res.json({ success: true, trips: allTrips });
  } catch (err) {
    console.error('GET /api/trips error:', err);
    // Fallback to memory on error
    const memoryTrips = tripsMemory
      .filter(t => t.userId === req.user.sub)
      .map(t => ({ ...t, _id: undefined }));
    res.json({ success: true, trips: memoryTrips });
  }
});

// Get a single trip by ID (public for sharing)
app.get('/api/trips/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    console.log('GET /api/trips/:tripId - ID:', tripId);

    // Check in-memory trips first
    const memoryTrip = tripsMemory.find(t => t._id === tripId);
    if (memoryTrip) {
      console.log('Found trip in-memory:', memoryTrip.tripName);
      return res.json({ success: true, trip: memoryTrip });
    }

    if (isDBConnected()) {
      const tripsCollection = getTripsCollection();
      
      // Try treating tripId as ObjectId if valid, fallback to string matching
      let query = { _id: tripId };
      try {
        const { ObjectId } = await import('mongodb');
        if (ObjectId.isValid(tripId)) {
          query = { _id: new ObjectId(tripId) };
        }
      } catch (objErr) {
        console.warn('MongoDB ObjectId import failed, using string match query');
      }

      const trip = await tripsCollection.findOne(query);
      if (trip) {
        console.log('Found trip in MongoDB:', trip.tripName);
        return res.json({ success: true, trip });
      }
    }

    res.status(404).json({ error: 'Trip not found' });
  } catch (err) {
    console.error('Fetch single trip error:', err);
    res.status(500).json({ error: 'Failed to fetch trip details: ' + err.message });
  }
});

// Get TURN credentials for WebRTC (requires auth)
app.get('/api/turn', requireAuth, async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(503).json({ error: 'TURN not configured' });
    }

    const token = await twilioClient.tokens.create({ ttl: 3600 });
    res.json({ iceServers: token.iceServers || [] });
  } catch (err) {
    console.error('TURN token error:', err.message);
    res.status(500).json({ error: 'Failed to fetch TURN credentials' });
  }
});

// Hybrid storage: MongoDB + in-memory cache for real-time Socket.IO operations
const rooms = new Map(); // roomId -> room data (cache)
const userSockets = new Map(); // userId -> socketId
const userRooms = new Map(); // userId -> roomId
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function getDefaultRoomSettings(mode = "crowd") {
  return {
    mode,
    trackingRange: 30,
    targetLocation: null,
    targetLabel: null,
    mapStyle: "osm",
  };
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    req.user = {
      sub: idToken || 'guest-user-' + Math.random().toString(36).substring(2, 10),
      name: 'Guest User',
      email: 'guest@example.com'
    };
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    req.user = {
      sub: 'guest-user-' + Math.random().toString(36).substring(2, 10),
      name: 'Guest User',
      email: 'guest@example.com'
    };
    return next();
  }
}

async function verifyGoogleToken(idToken) {
  return null;
}

// Google Places API routes (protected)
app.use('/api/places', requireAuth, placesRoutes);

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

// Create a new room (Host) - requires auth
app.post('/api/rooms/create', requireAuth, async (req, res) => {
  try {
    const { hostId, hostName, mode } = req.body;
    if (!hostId || !hostName) {
      return res.status(400).json({ error: 'hostId and hostName are required' });
    }

    const normalizedMode = ["crowd", "tracking", "trip"].includes(mode) ? mode : "crowd";

    const roomId = crypto.randomUUID().slice(0, 8).toUpperCase();
    const room = {
      roomId,
      hostId,
      hostName,
      members: [
        {
          userId: hostId,
          name: hostName,
          role: 'host',
          location: { lat: 0, lng: 0 },
          lastUpdate: Date.now(),
        }
      ],
      createdAt: Date.now(),
      isActive: true,
      settings: getDefaultRoomSettings(normalizedMode),
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
    const { userId, userName, role } = req.body;
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

    const isTripMode = room.settings?.mode === 'trip';
    const normalizedRole = isTripMode && userId !== room.hostId ? 'watcher' : 'member';
    const requestedRole = role === 'watcher' && isTripMode ? 'watcher' : normalizedRole;

    // Check if user already in room
    let memberIndex = room.members.findIndex(m => m.userId === userId);
    if (memberIndex !== -1) {
      room.members[memberIndex].name = userName;
      room.members[memberIndex].role = room.members[memberIndex].role || requestedRole;
      room.members[memberIndex].lastUpdate = Date.now();
    } else {
      room.members.push({
        userId,
        name: userName,
        role: requestedRole,
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
        role: requestedRole,
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
      role: member.role || 'member',
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
    const normalizedRoomId = (roomId || "").toUpperCase();

    let room = rooms.get(normalizedRoomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    room.members = room.members.filter(m => m.userId !== userId);
    
    // Delete room if empty
    if (room.members.length === 0) {
      await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          await roomsCollection.deleteOne({ roomId: normalizedRoomId });
        },
        () => console.log('💾 Deleted room from in-memory storage')
      );
      rooms.delete(normalizedRoomId);
    } else {
      // Update in MongoDB (with safe fallback)
      await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          await roomsCollection.updateOne(
            { roomId: normalizedRoomId },
            { $set: { members: room.members } }
          );
        },
        () => console.log('💾 Updated room in in-memory storage')
      );
      // Update cache
      rooms.set(normalizedRoomId, room);
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
    const normalizedRoomId = (roomId || "").toUpperCase();
    if (!normalizedRoomId) return;
    userSockets.set(userId, socket.id);
    userRooms.set(userId, normalizedRoomId);
    socket.join(normalizedRoomId);
    console.log(`User ${userId} joined room ${normalizedRoomId}`);
  });

  // Update user location
  socket.on('location:update', async ({ userId, roomId, lat, lng, name }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    let room = rooms.get(normalizedRoomId);
    if (room) {
      // Update in cache
      let member = room.members.find(m => m.userId === userId);
      if (member && member.role === 'watcher') {
        return;
      }
      if (member) {
        member.location = { lat, lng };
        member.lastUpdate = Date.now();
        member.name = name;
      } else {
        room.members.push({
          userId,
          name,
          role: userId === room.hostId ? 'host' : 'member',
          location: { lat, lng },
          lastUpdate: Date.now(),
        });
      }

      // Update MongoDB asynchronously (don't wait)
      if (isDBConnected()) {
        const roomsCollection = getRoomsCollection();
        roomsCollection.updateOne(
          { roomId: normalizedRoomId },
          { $set: { members: room.members } }
        ).catch(err => console.error('Error updating location in DB:', err.message));
      }

      // Update cache
      rooms.set(normalizedRoomId, room);

      // Broadcast to all in room
      io.to(normalizedRoomId).emit('location:updated', {
        userId,
        name,
        lat,
        lng,
        isHost: userId === room.hostId,
        timestamp: Date.now(),
      });
    }
  });

  // Get all current locations in room
  socket.on('room:sync', async ({ roomId }, callback) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    let room = rooms.get(normalizedRoomId);
    
    // If not in cache, fetch from MongoDB
    if (!room) {
      room = await safeMongoOperation(
        async () => {
          const roomsCollection = getRoomsCollection();
          const foundRoom = await roomsCollection.findOne({ roomId: normalizedRoomId });
          if (foundRoom) {
            rooms.set(normalizedRoomId, foundRoom);
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
    const normalizedRoomId = (roomId || "").toUpperCase();
    let room = rooms.get(normalizedRoomId);
    if (!room) return;
    const isHost = userId === room.hostId;
    const isTripMode = room.settings?.mode === 'trip';

    if (settings && Object.prototype.hasOwnProperty.call(settings, 'mode')) {
      delete settings.mode;
    }

    if (!isHost) {
      if (!isTripMode) return;
      const allowedKeys = ['targetLocation', 'targetLabel'];
      const incomingKeys = Object.keys(settings || {});
      const hasInvalid = incomingKeys.some(key => !allowedKeys.includes(key));
      if (hasInvalid) return;
    }

    const nextSettings = {
      ...(room.settings || getDefaultRoomSettings()),
      ...settings,
    };

    if (typeof nextSettings.trackingRange === 'number' && nextSettings.trackingRange < 5) {
      nextSettings.trackingRange = 5;
    }

    room.settings = nextSettings;
    rooms.set(normalizedRoomId, room);

    if (isDBConnected()) {
      const roomsCollection = getRoomsCollection();
      roomsCollection.updateOne(
        { roomId: normalizedRoomId },
        { $set: { settings: room.settings } }
      ).catch(err => console.error('Error updating settings in DB:', err.message));
    }

    io.to(normalizedRoomId).emit('room:settings', room.settings);
  });

  socket.on('room:warning', ({ roomId, warning }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    if (!rooms.get(normalizedRoomId)) return;
    io.to(normalizedRoomId).emit('room:warning', warning);
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

  socket.on('walkie:offer', ({ toUserId, fromUserId, sdp }) => {
    const targetSocketId = userSockets.get(toUserId);
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('walkie:offer', { fromUserId, sdp });
  });

  socket.on('walkie:answer', ({ toUserId, fromUserId, sdp }) => {
    const targetSocketId = userSockets.get(toUserId);
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('walkie:answer', { fromUserId, sdp });
  });

  socket.on('walkie:ice', ({ toUserId, fromUserId, candidate }) => {
    const targetSocketId = userSockets.get(toUserId);
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('walkie:ice', { fromUserId, candidate });
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

    // Find and clean up user socket/room mapping
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        userRooms.delete(userId);
        break;
      }
    }
  });
});

// ===================== ADMIN API ===================
// Test endpoint - no auth required
app.get('/api/admin/ping', (req, res) => {
  res.json({ message: 'Admin API is working' });
});

// Admin auth middleware (simple key-based)
const requireAdminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  const validKey = process.env.ADMIN_KEY || 'admin_secret_key_2024';
  
  console.log('Admin auth check:', { received: adminKey, expected: validKey });
  
  if (adminKey !== validKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get admin dashboard stats
app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    let roomList = Array.from(rooms.values());
    
    // Include DB rooms
    if (isDBConnected()) {
      try {
        const roomsCollection = getRoomsCollection();
        if (roomsCollection) {
          const dbRooms = await roomsCollection.find({}).toArray();
          const existingIds = new Set(roomList.map(r => r.roomId));
          dbRooms.forEach(r => {
            if (!existingIds.has(r.roomId)) {
              roomList.push(r);
            }
          });
        }
      } catch (e) {}
    }
    
    const activeRooms = roomList.filter(r => r.isActive).length;
    
    res.json({
      success: true,
      stats: {
        totalRooms: roomList.length,
        activeRooms,
        totalTrips: tripsMemory.length,
        sosCount: 0,
        dbConnected: isDBConnected()
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get all rooms for admin
app.get('/api/admin/rooms', requireAdminAuth, async (req, res) => {
  try {
    const { status, mode, limit = 50, offset = 0 } = req.query;
    
    let roomList = [];
    
    // First try in-memory
    roomList = Array.from(rooms.values());
    console.log('In-memory rooms:', roomList.length);
    
    // If DB connected, get from database too
    if (isDBConnected()) {
      try {
        const roomsCollection = getRoomsCollection();
        if (roomsCollection) {
          const dbRooms = await roomsCollection.find({}).toArray();
          console.log('DB rooms:', dbRooms.length);
          // Merge with in-memory (avoid duplicates)
          const existingIds = new Set(roomList.map(r => r.roomId));
          dbRooms.forEach(r => {
            if (!existingIds.has(r.roomId)) {
              roomList.push(r);
            }
          });
        }
      } catch (e) {
        console.log('Error fetching DB rooms:', e.message);
      }
    }
    
    if (status === 'active') {
      roomList = roomList.filter(r => r.isActive);
    } else if (status === 'inactive') {
      roomList = roomList.filter(r => !r.isActive);
    }
    
    if (mode) {
      roomList = roomList.filter(r => r.settings?.mode === mode);
    }
    
    const total = roomList.length;
    roomList = roomList.slice(Number(offset), Number(offset) + Number(limit));
    
    res.json({
      success: true,
      rooms: roomList,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('Admin rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Get room details
app.get('/api/admin/rooms/:roomId', requireAdminAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = rooms.get(roomId.toUpperCase());
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({ success: true, room });
  } catch (err) {
    console.error('Admin room detail error:', err);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// Delete/close room
app.delete('/api/admin/rooms/:roomId', requireAdminAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const normalizedRoomId = roomId.toUpperCase();
    
    rooms.delete(normalizedRoomId);
    
    const roomSocket = io.sockets.adapter.rooms.get(normalizedRoomId);
    if (roomSocket) {
      roomSocket.forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) socket.leave(normalizedRoomId);
      });
    }
    
    res.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    console.error('Admin delete room error:', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Get all users
app.get('/api/admin/users', requireAdminAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    let userList = [];
    let total = 0;
    
    const dbConnected = isDBConnected();
    console.log('Fetching users, db connected:', dbConnected);
    
    if (!dbConnected) {
      return res.json({
        success: true,
        users: [],
        total: 0,
        limit: Number(limit),
        offset: Number(offset),
        message: 'Database not connected - showing in-memory only'
      });
    }
    
    const usersCollection = getUsersCollection();
    if (usersCollection) {
      userList = await usersCollection.find({}).toArray();
      console.log('Found users:', userList.length);
      total = userList.length;
      userList = userList.slice(Number(offset), Number(offset) + Number(limit));
    }
    
    res.json({
      success: true,
      users: userList,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all trips
app.get('/api/admin/trips', requireAdminAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const tripList = [...tripsMemory];
    const total = tripList.length;
    const sliced = tripList.slice(Number(offset), Number(offset) + Number(limit));
    
    res.json({
      success: true,
      trips: sliced,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('Admin trips error:', err);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// Get system info
app.get('/api/admin/system', requireAdminAuth, async (req, res) => {
  try {
    let usersCount = 0;
    const usersCollection = getUsersCollection();
    if (usersCollection) {
      const allUsers = await usersCollection.find({}).toArray();
      usersCount = allUsers.length;
    }
    
    res.json({
      success: true,
      system: {
        dbConnected: isDBConnected(),
        nodeVersion: process.version,
        uptime: process.uptime(),
        roomsInMemory: rooms.size,
        usersInDb: usersCount,
        tripsInMemory: tripsMemory.length
      }
    });
  } catch (err) {
    console.error('Admin system error:', err);
    res.status(500).json({ error: 'Failed to fetch system info' });
  }
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
