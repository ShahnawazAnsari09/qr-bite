'use strict';

const fs = require('fs');
const path = require('path');

const compression = require('compression');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/error');
const { generalLimiter } = require('./middleware/rateLimit');
const routes = require('./routes');

const app = express();

// Behind a reverse proxy the rate limiters need the real client IP.
app.set('trust proxy', 1);

app.use(
  helmet({
    // The dashboard renders QR codes as inline data: URLs, which the default
    // img-src policy would block.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests and tools like curl send no Origin header.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

app.use('/api', generalLimiter, routes);

/**
 * Serves the built React app when one exists, so a phone on the restaurant
 * Wi-Fi can reach the customer site on the same host and port as the API.
 * In development the Vite dev server handles this instead.
 */
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
