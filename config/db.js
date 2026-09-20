const mongoose = require('mongoose');

const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/library_circulation';
  try {
    const conn = await mongoose.connect(primaryUri, {
      autoIndex: true
    });
    console.log(`[Database] MongoDB connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[Database Error] Primary connection failed (${primaryUri.split('@')[1] || primaryUri}): ${error.message}`);
    
    // If Atlas URI failed with authentication, attempt fallback to local MongoDB
    if (primaryUri.includes('mongodb+srv://') && !primaryUri.includes('localhost')) {
      console.log('[Database] Attempting fallback to local MongoDB (mongodb://localhost:27017/library_circulation)...');
      try {
        const localConn = await mongoose.connect('mongodb://localhost:27017/library_circulation', { autoIndex: true });
        console.log(`[Database] Connected to local fallback database: ${localConn.connection.name}`);
        return localConn;
      } catch (localErr) {
        console.error(`[Database Error] Local fallback also failed: ${localErr.message}`);
      }
    }
    process.exit(1);
  }
};

module.exports = connectDB;
