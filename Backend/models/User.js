// backend/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  location: {
    lat: Number,
    lng: Number,
  },
});

export default mongoose.model('User', userSchema);