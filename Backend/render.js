// backend/render.js - Special startup script for Render
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;

// Test connection on startup
async function testConnection() {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000, // 10 second timeout
    connectTimeoutMS: 10000,
  });

  try {
    await client.connect();
    console.log('✅ MongoDB Connected Successfully');
    await client.close();
    return true;
  } catch (err) {
    console.error('❌ MongoDB Connection Failed:', err.message);
    return false;
  }
}

testConnection().then(success => {
  if (success) {
    console.log('🚀 Database is ready, starting server...');
    // Import and start the main server
    import('./server.js');
  } else {
    console.error('💥 Cannot start without database. Check MONGODB_URI in Render environment variables.');
    process.exit(1);
  }
});
