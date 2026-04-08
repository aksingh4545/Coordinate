import { MongoClient } from 'mongodb';

const uri = "mongodb://aksingh4539047_db_user:ankit45mongo@ac-2zly6wl-shard-00-00.jz1bzub.mongodb.net:27017/?tls=true&authSource=admin&directConnection=true";
const client = new MongoClient(uri);

async function test() {
  try {
    await client.connect();
    console.log("✅ Connection Successful!");
  } catch (err) {
    console.error("❌ Connection Failed:", err.message);
  } finally {
    await client.close();
  }
}
test();