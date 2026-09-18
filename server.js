const app = require('./app');
const connectDB = require('./config/db');
const FineService = require('./services/FineService');
const ReservationService = require('./services/ReservationService');

const PORT = process.env.PORT || 3000;

// Initialize Database Connection and Start Server
const startServer = async () => {
  try {
    await connectDB();

    // Initial background sync
    await FineService.syncOverdues();
    await ReservationService.expireStaleHolds();

    // Periodic sweep every 15 minutes for overdues and hold expirations
    setInterval(async () => {
      try {
        await FineService.syncOverdues();
        await ReservationService.expireStaleHolds();
      } catch (sweepErr) {
        console.error('[Background Sweep Error]:', sweepErr.message);
      }
    }, 15 * 60 * 1000);

    const server = app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  Library Circulation & Availability Platform`);
      console.log(`  Server listening on http://localhost:${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=======================================================`);
    });

    // Graceful Shutdown
    const handleShutdown = (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
