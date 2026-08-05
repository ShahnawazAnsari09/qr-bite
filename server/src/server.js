'use strict';

const http = require('http');

const app = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const env = require('./config/env');
const logger = require('./lib/logger');
const { initRealtime } = require('./realtime/io');

const server = http.createServer(app);

async function start() {
  await connectDatabase();

  // Socket.io shares the HTTP server so both live on one port.
  initRealtime(server);

  server.listen(env.port, () => {
    logger.info(`QR-Bite API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    logger.info(`Customer app expected at ${env.clientUrl}`);
    logger.info(`WhatsApp provider: ${env.whatsapp.provider}`);
  });
}

/** Finish in-flight requests and close the DB before exiting. */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down.`);
  server.close(async () => {
    try {
      await disconnectDatabase();
    } catch (err) {
      logger.error('Error closing database:', err.message);
    }
    process.exit(0);
  });

  // Don't hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

start().catch((err) => {
  logger.error('Failed to start server:', err.message);
  process.exit(1);
});

module.exports = server;
