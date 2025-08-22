// backend/routes/group.js
import express from 'express';
import QRcode from 'qrcode';
import Group from '../models/Group.js';
import User from '../models/User.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  const { creatorId, groupName, userName } = req.body;
  try {
    let user = await User.findById(creatorId);
    if (!user) {
      user = new User({ _id: creatorId, name: userName });
      await user.save();
    } else if (userName && user.name !== userName) {
      user.name = userName;
      await user.save();
    }
    const group = new Group({ name: groupName, creator: creatorId, members: [creatorId] });
    await group.save();
    res.json({ groupId: group._id });
  } catch (error) {
    res.status(500).json({ error: 'Error creating group' });
  }
});

router.post('/join', async (req, res) => {
  const { groupId, userId, name: userName } = req.body;
  try {
    let user = await User.findById(userId);
    if (!user) {
      user = new User({ _id: userId, name: userName });
      await user.save();
    } else if (userName && user.name !== userName) {
      user.name = userName;
      await user.save();
    }
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!group.members.includes(userId)) {
      group.members.push(userId);
      await group.save();
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error joining group' });
  }
});

router.get('/:groupId/members', async (req, res) => {
  const { groupId } = req.params;
  try {
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = await User.find({ _id: { $in: group.members } });
    res.json(
      members.map((u) => ({
        userId: u._id,
        name: u.name,
        position: u.location ? [u.location.lat, u.location.lng] : null,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Error fetching members' });
  }
});

router.get('/qr/:groupId', (req, res) => {
  const { groupId } = req.params;
  const url = `http://localhost:5173/join/${groupId}`;
  QRcode.toDataURL(url, (err, dataUrl) => {
    if (err) return res.status(500).json({ error: 'QR generation error' });
    res.json({ qr: dataUrl });
  });
});

export default router;