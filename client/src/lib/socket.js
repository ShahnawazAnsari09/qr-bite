import { io } from 'socket.io-client';

/**
 * One shared Socket.io connection per tab.
 *
 * Rooms are never joined by id from the browser — the client sends its JWT and
 * the server decides which restaurant or order room it may listen to, so a
 * tampered client cannot subscribe to another table's orders.
 */

const URL = import.meta.env.VITE_SOCKET_URL || undefined; // undefined => same origin

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(URL, {
      // Polling first, then upgrade: restaurant Wi-Fi often blocks raw WebSockets.
      transports: ['polling', 'websocket'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

/**
 * Joins a room and rejoins it after every reconnect, then returns a cleanup
 * function. Without the reconnect handler a dropped Wi-Fi connection would
 * leave the dashboard silently unsubscribed and looking idle.
 */
export function joinRoom(event, token, onResult) {
  const s = getSocket();

  const join = () => s.emit(event, { token }, (ack) => onResult && onResult(ack));

  if (s.connected) join();
  s.on('connect', join);

  return () => s.off('connect', join);
}

/** Subscribes to a server event; returns an unsubscribe function. */
export function onEvent(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

export const EVENTS = Object.freeze({
  ORDER_NEW: 'order:new',
  ORDER_UPDATED: 'order:updated',
  SERVICE_REQUEST: 'service:request',
  SERVICE_RESOLVED: 'service:resolved',
  MENU_UPDATED: 'menu:updated',
  RATING_NEW: 'rating:new',
});
