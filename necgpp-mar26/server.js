// server.js
import 'dotenv/config';
import app                                           from './src/app.js';
import logger                                        from './src/utils/logger.js';
import { testDatabaseConnection, closeDatabasePool } from './src/config/db.js';
import { connectRedis, closeRedis }                  from './src/config/redis.js';
import { startScheduler, stopScheduler }             from './src/scheduler.js';

// ─── Required env validation ──────────────────────────────────────────────────
// Fail fast — don't start the server if critical secrets are missing.
const REQUIRED_ENV = [
  'JWT_ACCESS_SECRET',
  'DB_HOST', 'DB_USER', 'DB_NAME',
  'SMTP_USER', 'SMTP_PASS',
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`[server] Missing required env vars: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

let server;
let isShuttingDown = false;

// ─── Start ────────────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await testDatabaseConnection();
    await connectRedis();

    // Create the server but don't start listening yet — set timeouts first.
    server = app.listen(PORT, HOST);

    // FIX #1: Set server timeouts BEFORE the listening event fires,
    // not inside the listen() callback where sequencing isn't guaranteed.
    server.keepAliveTimeout = 65_000;
    server.headersTimeout   = 66_000; // must be > keepAliveTimeout
    server.requestTimeout   = 30_000;

    // FIX #2: Handle HTTP server errors (e.g. EADDRINUSE) explicitly.
    // Without this, port-in-use errors fall through to uncaughtException.
    server.on('error', (err) => {
      logger.error('HTTP server error', { error: err.message, code: err.code });
      process.exit(1);
    });

    server.on('listening', () => {
      logger.info('Server started successfully', {
        port:        PORT,
        host:        HOST,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid:         process.pid,
      });

      // FIX #3: Start scheduler only after server is confirmed listening,
      // and keep a reference so it can be stopped on shutdown.
      startScheduler();
    });

  } catch (error) {
    logger.error('Failed to start server — shutting down', {
      error: error.message,
      code:  error.code,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received — starting graceful shutdown`);

  try {
    // FIX #3 (cont): Stop the cron scheduler before closing DB/Redis.
    // Without this, a cron tick during shutdown would try to use
    // an already-closed DB pool and throw.
    stopScheduler();
    logger.info('Scheduler stopped');

    if (server) {
      // Stop accepting new connections; wait for in-flight requests to finish.
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info('HTTP server closed');
    }

    await closeDatabasePool();
    await closeRedis();

    logger.info('Graceful shutdown complete');
    process.exit(0);

  } catch (err) {
    logger.error('Error during graceful shutdown — forcing exit', {
      error: err.message,
    });
    process.exit(1);
  }
};

// ─── Process signal handlers ──────────────────────────────────────────────────
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION — process in unknown state, restarting', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION — check for missing catchAsync or await', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack:  reason instanceof Error ? reason.stack   : undefined,
  });
  process.exit(1);
});

startServer();