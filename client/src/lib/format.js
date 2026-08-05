/** Formatting and small persistence helpers shared by both apps. */

export function money(amount, symbol = '₹') {
  const n = Number(amount || 0);
  // Whole rupees read better on a menu; fractions matter on a bill.
  const body = Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${body}`;
}

export function time(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "4m ago" — the kitchen cares about ticket age far more than clock time. */
export function ago(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

/** Minutes an order has been open — drives the "late ticket" highlight. */
export function minutesSince(value) {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 60000);
}

export const STATUS_LABEL = {
  RECEIVED: 'Received',
  PREPARING: 'Preparing',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
};

export const SERVICE_LABEL = {
  CALL_WAITER: 'Call waiter',
  WATER: 'Water',
  BILL: 'Bill',
};

/** localStorage that never throws — Safari private mode disables writes. */
export const store = {
  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — the app still works, it just forgets */
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const KEYS = {
  staffSession: 'qrbite.staff',
  order: 'qrbite.order',
  cart: (code) => `qrbite.cart.${code}`,
  diner: 'qrbite.diner',
};
