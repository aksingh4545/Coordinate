// backend/db.js
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.warn('⚠️  MONGODB_URI is not set in environment variables');
  console.warn('   Will use in-memory storage (data lost on restart)');
}

let client;
let db;
let roomsCollection;
let isConnected = false;

export async function connectDB() {
  if (!uri) {
    console.log('💾 Using in-memory storage (no MongoDB URI provided)');
    return null;
  }

  try {
    console.log('🔄 Connecting to MongoDB...');
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    
    await client.connect();
    
    // Test the connection
    await client.db().admin().ping();
    
    db = client.db('coordinate');
    roomsCollection = db.collection('rooms');
    
    // Create indexes for better performance
    try {
      await roomsCollection.createIndex({ roomId: 1 }, { unique: true });
      await roomsCollection.createIndex({ 'members.userId': 1 });
    } catch (indexErr) {
      console.warn('⚠️  Index creation failed (non-critical):', indexErr.message);
    }
    
    isConnected = true;
    console.log('✅ MongoDB Connected Successfully');
    return db;
  } catch (err) {
    console.error('❌ MongoDB Connection Failed:', err.message);
    console.warn('⚠️  Will use in-memory storage instead');
    isConnected = false;
    return null;
  }
}

export function getDB() {
  return db;
}

export function getRoomsCollection() {
  if (!isConnected || !roomsCollection) {
    return null;
  }
  return roomsCollection;
}

export function isDBConnected() {
  return isConnected;
}

export async function closeDB() {
  if (client && isConnected) {
    try {
      await client.close();
      isConnected = false;
      console.log('🔌 MongoDB Connection Closed');
    } catch (err) {
      console.error('Error closing MongoDB:', err.message);
    }
  }
}
