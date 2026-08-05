'use strict';

const { Server } = require('socket.io');
const env = require('../config/env');
const logger = require('../lib/logger');
const { verifyToken, SCOPE } = require('../lib/tokens');

let io = null;

const EVENTS = Object.freeze({
  ORDER_NEW: 'order:new',
  ORDER_UPDATED: 'order:updated',
  SERVICE_REQUEST: 'service:request',
  SERVICE_RESOLVED: 'service:resolved',
  MENU_UPDATED: 'menu:updated',
  RATING_NEW: 'rating:new',
});

/** Staff dashboards for one restaurant. Supports future multi-tenant use. */
const restaurantRoom = (restaurantId) => `restaurant:${restaurantId}`;
/** A single diner watching their own order. */
const orderRoom = (orderId) => `order:${orderId}`;

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Socket.io falls back to long-polling where WebSockets are blocked, which
    // matters on locked-down restaurant Wi-Fi (Chapter 2.1.5).
    transports: ['websocket', 'polling'],
    pingTimeout: 25000,
  });

  io.on('connection', (socket) => {
    logger.debug(`socket connected: ${socket.id}`);

    /**
     * A dashboard joins its restaurant room. The JWT is verified here rather
     * than trusting a restaurantId sent by the client, otherwise any browser
     * could subscribe to another restaurant's live orders and customer names.
     */
    socket.on('staff:join', (payload = {}, ack) => {
      try {
        const decoded = verifyToken(payload.token);
        if (decoded.scope !== SCOPE.STAFF) throw new Error('Staff token required');

        socket.join(restaurantRoom(decoded.restaurant));
        socket.data.restaurantId = decoded.restaurant;
        socket.data.staffId = decoded.sub;

        if (typeof ack === 'function') ack({ ok: true, room: restaurantRoom(decoded.restaurant) });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Unauthorised socket subscription' });
      }
    });

    /** A customer subscribes to status changes for the order they just placed. */
    socket.on('order:join', (payload = {}, ack) => {
      try {
        const decoded = verifyToken(payload.token);
        if (decoded.scope !== SCOPE.CUSTOMER) throw new Error('Customer token required');

        socket.join(orderRoom(decoded.order));
        socket.data.orderId = decoded.order;

        if (typeof ack === 'function') ack({ ok: true, room: orderRoom(decoded.order) });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid order token' });
      }
    });

    socket.on('disconnect', (reason) => logger.debug(`socket ${socket.id} left: ${reason}`));
  });

  logger.info('Socket.io real-time layer ready');
  return io;
}

function getIO() {
  return io;
}

/** No-ops when the socket server is not running (e.g. under unit test). */
function emitToRestaurant(restaurantId, event, payload) {
  if (!io) return;
  io.to(restaurantRoom(restaurantId)).emit(event, payload);
}

function emitToOrder(orderId, event, payload) {
  if (!io) return;
  io.to(orderRoom(orderId)).emit(event, payload);
}

module.exports = {
  initRealtime,
  getIO,
  emitToRestaurant,
  emitToOrder,
  restaurantRoom,
  orderRoom,
  EVENTS,
};
