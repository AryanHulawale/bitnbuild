const mongoose = require('mongoose');

let useMongo = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('⚠️  No MONGODB_URI set — using in-memory store (demo mode).');
    return false;
  }
  try {
    await mongoose.connect(uri);
    useMongo = true;
    console.log('✅ MongoDB connected');
    return true;
  } catch (e) {
    console.log('⚠️  MongoDB unavailable, falling back to in-memory store:', e.message);
    return false;
  }
}

function isMongo() { return useMongo; }

module.exports = { connectDB, isMongo };
