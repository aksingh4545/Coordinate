// backend/models/Group.js
import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: String,
  creator: { type: String, ref: 'User' },
  members: [{ type: String, ref: 'User' }],
});

export default mongoose.model('Group', groupSchema);