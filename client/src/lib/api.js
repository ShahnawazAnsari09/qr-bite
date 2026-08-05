/**
 * Thin fetch wrapper around the QR-Bite REST API.
 *
 * Every endpoint answers with `{ success, data, message }`, and every failure
 * with `{ success: false, message, details? }`. This module normalises both so
 * callers only ever deal with the payload or a thrown ApiError.
 */

const BASE = import.meta.env.VITE_API_BASE || '/api';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || [];
  }

  /** Field-level messages from a 422, keyed by field name, for form display. */
  get fieldErrors() {
    return this.details.reduce((acc, detail) => {
      // Zod reports nested paths like "customer.phone"; the form only knows the leaf.
      const leaf = String(detail.field).split('.').pop();
      if (!acc[leaf]) acc[leaf] = detail.message;
      return acc;
    }, {});
  }
}

async function request(path, { method = 'GET', body, token, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  // 204s and the odd empty body would blow up res.json().
  const text = await res.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('The server returned an unreadable response.', res.status);
    }
  }

  if (!res.ok) {
    throw new ApiError(payload.message || `Request failed (${res.status})`, res.status, payload.details);
  }

  return payload;
}

/** Unwraps `{ success, data }` for the common case. */
const data = (promise) => promise.then((payload) => payload.data);

// ---------------------------------------------------------------------------
// Public — the diner's phone. No login; the table code proves presence.
// ---------------------------------------------------------------------------

export const publicApi = {
  getTableMenu: (code, signal) => data(request(`/public/tables/${encodeURIComponent(code)}`, { signal })),
  getReviews: (menuItemId) => data(request(`/public/menu-items/${menuItemId}/reviews`)),
  placeOrder: (payload) => data(request('/public/orders', { method: 'POST', body: payload })),
  getMyOrder: (token) => data(request('/public/orders/mine', { token })),
  submitRatings: (token, ratings) =>
    data(request('/public/orders/mine/ratings', { method: 'POST', token, body: { ratings } })),
  callService: (tableCode, type) =>
    data(request('/public/service-requests', { method: 'POST', body: { tableCode, type } })),
};

// ---------------------------------------------------------------------------
// Staff — every call carries the JWT issued at login.
// ---------------------------------------------------------------------------

const query = (params) => {
  const search = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  ).toString();
  return search ? `?${search}` : '';
};

export const staffApi = {
  login: (username, password) =>
    data(request('/auth/login', { method: 'POST', body: { username, password } })),
  me: (token) => data(request('/auth/me', { token })),

  liveOrders: (token, signal) => data(request('/orders/live', { token, signal })),
  listOrders: (token, params) => request(`/orders${query(params)}`, { token }),
  updateOrderStatus: (token, id, status) =>
    data(request(`/orders/${id}/status`, { method: 'PATCH', token, body: { status } })),
  resolveServiceRequest: (token, id) =>
    data(request(`/orders/service-requests/${id}/resolve`, { method: 'PATCH', token })),

  listMenu: (token) => data(request('/menu', { token })),
  ratingsOverview: (token) => data(request('/menu/ratings', { token })),
  createMenuItem: (token, body) => data(request('/menu', { method: 'POST', token, body })),
  updateMenuItem: (token, id, body) => data(request(`/menu/${id}`, { method: 'PUT', token, body })),
  toggleMenuItem: (token, id) => data(request(`/menu/${id}/active`, { method: 'PATCH', token })),
  deleteMenuItem: (token, id) => request(`/menu/${id}`, { method: 'DELETE', token }),

  listTables: (token) => data(request('/tables', { token })),
  createTable: (token, body) => data(request('/tables', { method: 'POST', token, body })),
  createTablesBulk: (token, body) => data(request('/tables/bulk', { method: 'POST', token, body })),
  regenerateQr: (token, id) => data(request(`/tables/${id}/regenerate-qr`, { method: 'POST', token })),
  deleteTable: (token, id) => request(`/tables/${id}`, { method: 'DELETE', token }),

  listCustomers: (token, params) => request(`/customers${query(params)}`, { token }),
  getCustomer: (token, id) => data(request(`/customers/${id}`, { token })),
  toggleOptIn: (token, id) => data(request(`/customers/${id}/opt-in`, { method: 'PATCH', token })),
  broadcast: (token, body) => data(request('/customers/broadcast', { method: 'POST', token, body })),
  messageLog: (token, params) => request(`/customers/messages${query(params)}`, { token }),

  reportSummary: (token, days) => data(request(`/reports/summary${query({ days })}`, { token })),
};

/**
 * The QR download endpoint returns a PNG, not JSON, and needs the auth header —
 * so it cannot simply be an <a href>. Fetch it and hand the browser a blob.
 */
export async function downloadTableQr(token, table) {
  const res = await fetch(`${BASE}/tables/${table.id || table._id}/qr.png`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError('Could not download that QR code.', res.status);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `table-${table.tableNumber}-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
