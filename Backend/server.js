// backend: index.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import QRCode from 'qrcode';
import mongoose from 'mongoose';
import crypto from 'crypto';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

const dbConnect = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/groupdb', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to DB');
  } catch (err) {
    console.error('DB connection error:', err.message);
    process.exit(1); // Exit if DB connection fails
  }
};

dbConnect();

const groupSchema = new mongoose.Schema({
  groupId: String,
  creator: String,
  members: [String],
});

const Group = mongoose.model('Group', groupSchema);

app.post('/api/groups/create', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const groupId = crypto.randomUUID();
  const group = new Group({ groupId, creator: userId, members: [userId] });
  try {
    await group.save();
    const joinUrl = `${groupId}`; // QR contains the groupId as text for scanning
    QRCode.toDataURL(joinUrl, (err, qrCode) => {
      if (err) return res.status(500).json({ error: 'QR generation failed' });
      res.json({ qrCode, groupId });
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.post('/api/groups/join', async (req, res) => {
  const { userId, groupId } = req.body;
  if (!userId || !groupId) return res.status(400).json({ error: 'userId and groupId required' });
  try {
    const group = await Group.findOne({ groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!group.members.includes(userId)) {
      group.members.push(userId);
      await group.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join group' });
  }
});

const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', ({ userId }) => {
    connectedUsers.set(userId, socket.id);
    console.log(`User ${userId} joined with socket ${socket.id}`);
  });

  socket.on('joinGroup', ({ groupId }) => {
    socket.join(groupId);
    console.log(`User joined group ${groupId}`);
  });

  socket.on('location', ({ userId, groupId, lat, lng }) => {
    io.to(groupId).emit('updateLocation', { userId, lat, lng });
  });

  socket.on('disconnect', () => {
    for (let [uId, sId] of connectedUsers.entries()) {
      if (sId === socket.id) {
        connectedUsers.delete(uId);
        console.log(`User ${uId} disconnected`);
        break;
      }
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));