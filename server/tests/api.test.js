'use strict';

/**
 * End-to-end walk through the system, following the test cases in Chapter 6 of
 * the project report. The tests run in order and share state, because that is
 * exactly what the real flow does: scan, order, cook, serve, rate.
 */

const request = require('supertest');

const app = require('../src/app');
const MenuItem = require('../src/models/MenuItem');
const Restaurant = require('../src/models/Restaurant');
const StaffUser = require('../src/models/StaffUser');
const { ROLES } = require('../src/models/StaffUser');
const Table = require('../src/models/Table');

const ADMIN = { username: 'admin', password: 'Admin@123' };
const STAFF = { username: 'staff01', password: 'Staff@123' };
const DINER = { name: 'Aarav Sharma', phone: '9876543210' };

const state = {};

beforeAll(async () => {
  state.restaurant = await Restaurant.create({ name: 'Test Kitchen', taxPercent: 5 });

  await StaffUser.create({
    restaurant: state.restaurant._id,
    name: 'Restaurant Admin',
    username: ADMIN.username,
    passwordHash: await StaffUser.hashPassword(ADMIN.password),
    role: ROLES.ADMIN,
  });
  await StaffUser.create({
    restaurant: state.restaurant._id,
    name: 'Floor Staff',
    username: STAFF.username,
    passwordHash: await StaffUser.hashPassword(STAFF.password),
    role: ROLES.STAFF,
  });

  state.table = await Table.create({ restaurant: state.restaurant._id, tableNumber: 1, seats: 4 });

  state.paneer = await MenuItem.create({
    restaurant: state.restaurant._id,
    name: 'Paneer Tikka',
    price: 240,
    category: 'Starters',
  });
  state.naan = await MenuItem.create({
    restaurant: state.restaurant._id,
    name: 'Butter Naan',
    price: 55,
    category: 'Breads',
  });
  state.soldOut = await MenuItem.create({
    restaurant: state.restaurant._id,
    name: 'Fish Curry',
    price: 400,
    category: 'Main Course',
    isActive: false,
  });
});

const authed = (token) => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------------------
// TC9 — staff authentication
// ---------------------------------------------------------------------------

describe('TC9 staff login', () => {
  it('rejects a wrong password without revealing whether the user exists', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
  });

  it('issues a token for valid admin credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN);

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe(ROLES.ADMIN);
    state.adminToken = res.body.data.token;
  });

  it('issues a token for valid staff credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(STAFF);

    expect(res.status).toBe(200);
    state.staffToken = res.body.data.token;
  });

  it('refuses a protected route without a token', async () => {
    const res = await request(app).get('/api/orders/live');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// TC1-TC3 — scanning the QR code and reading the menu
// ---------------------------------------------------------------------------

describe('TC1-TC3 scan table and load menu', () => {
  it('404s on an unknown table code', async () => {
    const res = await request(app).get('/api/public/tables/not-a-real-code');
    expect(res.status).toBe(404);
  });

  it('returns the restaurant, the table and the menu grouped by category', async () => {
    const res = await request(app).get(`/api/public/tables/${state.table.code}`);

    expect(res.status).toBe(200);
    expect(res.body.data.restaurant.name).toBe('Test Kitchen');
    expect(res.body.data.table.tableNumber).toBe(1);
    expect(res.body.data.categories.map((c) => c.name).sort()).toEqual(['Breads', 'Starters']);
  });

  it('hides deactivated dishes from diners', async () => {
    const res = await request(app).get(`/api/public/tables/${state.table.code}`);
    const names = res.body.data.categories.flatMap((c) => c.items.map((i) => i.name));

    expect(names).toContain('Paneer Tikka');
    expect(names).not.toContain('Fish Curry');
  });
});

// ---------------------------------------------------------------------------
// TC4 — placing an order
// ---------------------------------------------------------------------------

describe('TC4 place an order', () => {
  it('rejects an empty cart', async () => {
    const res = await request(app)
      .post('/api/public/orders')
      .send({ tableCode: state.table.code, customer: DINER, items: [] });

    expect(res.status).toBe(422);
  });

  it('rejects a missing phone number', async () => {
    const res = await request(app)
      .post('/api/public/orders')
      .send({
        tableCode: state.table.code,
        customer: { name: DINER.name },
        items: [{ menuItemId: String(state.paneer._id), quantity: 1 }],
      });

    expect(res.status).toBe(422);
  });

  it('refuses to sell a dish that is marked unavailable', async () => {
    const res = await request(app)
      .post('/api/public/orders')
      .send({
        tableCode: state.table.code,
        customer: DINER,
        items: [{ menuItemId: String(state.soldOut._id), quantity: 1 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/unavailable/i);
  });

  it('prices the cart from the database and returns a scoped order token', async () => {
    const res = await request(app)
      .post('/api/public/orders')
      .send({
        tableCode: state.table.code,
        customer: DINER,
        items: [
          { menuItemId: String(state.paneer._id), quantity: 2, note: 'Less spicy' },
          { menuItemId: String(state.naan._id), quantity: 3 },
        ],
        note: 'Table by the window',
      });

    expect(res.status).toBe(201);

    const { order, orderToken } = res.body.data;
    // 2 x 240 + 3 x 55 = 645, +5% tax = 677.25
    expect(order.subtotal).toBe(645);
    expect(order.taxAmount).toBe(32.25);
    expect(order.totalAmount).toBe(677.25);
    expect(order.status).toBe('RECEIVED');
    expect(order.orderNumber).toMatch(/^ORD\d+$/);
    expect(orderToken).toBeTruthy();

    state.orderId = order.id;
    state.orderToken = orderToken;
  });

  it('ignores a price sent by the client', async () => {
    const res = await request(app)
      .post('/api/public/orders')
      .send({
        tableCode: state.table.code,
        customer: DINER,
        items: [{ menuItemId: String(state.naan._id), quantity: 1, price: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.order.totalAmount).toBe(57.75); // 55 + 5%
    state.secondOrderId = res.body.data.order.id;
  });

  it('stores customer name and phone decrypted-on-read, not as ciphertext', async () => {
    const res = await request(app)
      .get('/api/orders/live')
      .set(authed(state.staffToken));

    const order = res.body.data.orders.find((o) => o.id === state.orderId);
    expect(order.customer.name).toBe(DINER.name);
    expect(order.customer.name).not.toMatch(/^enc:v1:/);
    expect(order.customer.phone).toBe('919876543210'); // normalised to E.164 digits
  });
});

// ---------------------------------------------------------------------------
// TC5 / TC7 — the order reaches the dashboard, WhatsApp is recorded
// ---------------------------------------------------------------------------

describe('TC5 order appears on the staff dashboard', () => {
  it('lists the new order under its table with an open total', async () => {
    const res = await request(app).get('/api/orders/live').set(authed(state.staffToken));

    expect(res.status).toBe(200);
    expect(res.body.data.counts.received).toBe(2);

    const table1 = res.body.data.tables.find((t) => t.tableNumber === 1);
    expect(table1.orders).toHaveLength(2);
    expect(table1.openTotal).toBe(735); // 677.25 + 57.75
  });
});

describe('TC7 WhatsApp order confirmation', () => {
  it('records a confirmation message for the order', async () => {
    const res = await request(app)
      .get('/api/customers/messages')
      .set(authed(state.adminToken));

    expect(res.status).toBe(200);
    const confirmation = res.body.data.find((m) => m.type === 'ORDER_CONFIRMATION');
    expect(confirmation).toBeTruthy();
    expect(confirmation.deliveryStatus).toBe('SENT');
    expect(confirmation.maskedPhone).toMatch(/^\*+3210$/);
    expect(confirmation.customerName).toBe(DINER.name);
  });
});

// ---------------------------------------------------------------------------
// TC6 / TC12 — tracking and the order lifecycle
// ---------------------------------------------------------------------------

describe('TC6 customer tracks their own order', () => {
  it('returns the order behind the customer token', async () => {
    const res = await request(app)
      .get('/api/public/orders/mine')
      .set(authed(state.orderToken));

    expect(res.status).toBe(200);
    expect(res.body.data.order.id).toBe(state.orderId);
    expect(res.body.data.order.status).toBe('RECEIVED');
  });

  it('refuses a staff token on a customer route', async () => {
    const res = await request(app)
      .get('/api/public/orders/mine')
      .set(authed(state.staffToken));

    expect(res.status).toBe(403);
  });

  it('refuses a customer token on a staff route', async () => {
    const res = await request(app).get('/api/orders/live').set(authed(state.orderToken));
    expect(res.status).toBe(403);
  });
});

describe('TC12 order status lifecycle', () => {
  it('moves RECEIVED -> PREPARING', async () => {
    const res = await request(app)
      .patch(`/api/orders/${state.orderId}/status`)
      .set(authed(state.staffToken))
      .send({ status: 'PREPARING' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PREPARING');
  });

  it('refuses to move backwards', async () => {
    const res = await request(app)
      .patch(`/api/orders/${state.orderId}/status`)
      .set(authed(state.staffToken))
      .send({ status: 'RECEIVED' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/only move forward/i);
  });

  it('will not let ordinary staff cancel an order', async () => {
    const res = await request(app)
      .patch(`/api/orders/${state.secondOrderId}/status`)
      .set(authed(state.staffToken))
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(403);
  });

  it('lets an admin cancel an order', async () => {
    const res = await request(app)
      .patch(`/api/orders/${state.secondOrderId}/status`)
      .set(authed(state.adminToken))
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('moves PREPARING -> SERVED and records servedAt', async () => {
    const res = await request(app)
      .patch(`/api/orders/${state.orderId}/status`)
      .set(authed(state.staffToken))
      .send({ status: 'SERVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SERVED');
    expect(res.body.data.servedAt).toBeTruthy();
    expect(res.body.data.statusHistory.map((h) => h.status)).toEqual([
      'RECEIVED',
      'PREPARING',
      'SERVED',
    ]);
  });
});

// ---------------------------------------------------------------------------
// TC11 — feedback
// ---------------------------------------------------------------------------

describe('TC11 rate the dishes', () => {
  it('rejects a dish that was not part of the order', async () => {
    const res = await request(app)
      .post('/api/public/orders/mine/ratings')
      .set(authed(state.orderToken))
      .send({ ratings: [{ menuItemId: String(state.soldOut._id), stars: 5 }] });

    expect(res.status).toBe(400);
  });

  it('rejects a star count outside 1-5', async () => {
    const res = await request(app)
      .post('/api/public/orders/mine/ratings')
      .set(authed(state.orderToken))
      .send({ ratings: [{ menuItemId: String(state.paneer._id), stars: 9 }] });

    expect(res.status).toBe(422);
  });

  it('accepts ratings and updates the dish average', async () => {
    const res = await request(app)
      .post('/api/public/orders/mine/ratings')
      .set(authed(state.orderToken))
      .send({
        ratings: [
          { menuItemId: String(state.paneer._id), stars: 5, comment: 'Perfectly charred.' },
          { menuItemId: String(state.naan._id), stars: 4 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);

    const paneer = await MenuItem.findById(state.paneer._id);
    expect(paneer.avgRating).toBe(5);
    expect(paneer.ratingCount).toBe(1);
  });

  it('replaces rather than duplicates a re-rating of the same dish', async () => {
    const res = await request(app)
      .post('/api/public/orders/mine/ratings')
      .set(authed(state.orderToken))
      .send({ ratings: [{ menuItemId: String(state.paneer._id), stars: 3 }] });

    expect(res.status).toBe(201);

    const paneer = await MenuItem.findById(state.paneer._id);
    expect(paneer.ratingCount).toBe(1); // still one vote
    expect(paneer.avgRating).toBe(3); // but the score changed
  });

  it('shows the review on the public dish page', async () => {
    const res = await request(app).get(`/api/public/menu-items/${state.paneer._id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].customerFirstName).toBe('Aarav');
  });
});

// ---------------------------------------------------------------------------
// TC8 — call waiter
// ---------------------------------------------------------------------------

describe('TC8 call waiter', () => {
  it('queues a request and shows it on the dashboard', async () => {
    const created = await request(app)
      .post('/api/public/service-requests')
      .send({ tableCode: state.table.code, type: 'WATER' });

    expect(created.status).toBe(201);

    const live = await request(app).get('/api/orders/live').set(authed(state.staffToken));
    expect(live.body.data.serviceRequests).toHaveLength(1);
    expect(live.body.data.serviceRequests[0].type).toBe('WATER');

    state.requestId = created.body.data.id;
  });

  it('clears the request once attended', async () => {
    const res = await request(app)
      .patch(`/api/orders/service-requests/${state.requestId}/resolve`)
      .set(authed(state.staffToken));

    expect(res.status).toBe(200);

    const live = await request(app).get('/api/orders/live').set(authed(state.staffToken));
    expect(live.body.data.serviceRequests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC10 — menu management
// ---------------------------------------------------------------------------

describe('TC10 menu management', () => {
  it('adds a dish that shows up on the customer menu straight away', async () => {
    const created = await request(app)
      .post('/api/menu')
      .set(authed(state.staffToken))
      .send({ name: 'Gulab Jamun', price: 110, category: 'Desserts' });

    expect(created.status).toBe(201);

    const menu = await request(app).get(`/api/public/tables/${state.table.code}`);
    const names = menu.body.data.categories.flatMap((c) => c.items.map((i) => i.name));
    expect(names).toContain('Gulab Jamun');

    state.dessertId = created.body.data._id;
  });

  it('rejects a dish with no price', async () => {
    const res = await request(app)
      .post('/api/menu')
      .set(authed(state.staffToken))
      .send({ name: 'Mystery Dish', category: 'Desserts' });

    expect(res.status).toBe(422);
  });

  it('hides a dish from diners when toggled unavailable', async () => {
    const res = await request(app)
      .patch(`/api/menu/${state.dessertId}/active`)
      .set(authed(state.staffToken));

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const menu = await request(app).get(`/api/public/tables/${state.table.code}`);
    const names = menu.body.data.categories.flatMap((c) => c.items.map((i) => i.name));
    expect(names).not.toContain('Gulab Jamun');
  });

  it('refuses to hard-delete a dish that has rating history', async () => {
    const res = await request(app)
      .delete(`/api/menu/${state.paneer._id}`)
      .set(authed(state.adminToken));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/deactivate/i);
  });
});

// ---------------------------------------------------------------------------
// TC13 — WhatsApp broadcast
// ---------------------------------------------------------------------------

describe('TC13 WhatsApp campaign', () => {
  it('lists the customer built up from the orders', async () => {
    const res = await request(app).get('/api/customers').set(authed(state.adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe(DINER.name);
    expect(res.body.data[0].orderCount).toBe(2);

    state.customerId = res.body.data[0].id;
  });

  it('finds a customer by phone number through the blind index', async () => {
    const res = await request(app)
      .get('/api/customers?search=9876543210')
      .set(authed(state.adminToken));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(state.customerId);
  });

  it('will not let ordinary staff broadcast', async () => {
    const res = await request(app)
      .post('/api/customers/broadcast')
      .set(authed(state.staffToken))
      .send({ body: 'Flat 20% off this weekend!', allCustomers: true });

    expect(res.status).toBe(403);
  });

  it('sends a promotion to the opted-in list', async () => {
    const res = await request(app)
      .post('/api/customers/broadcast')
      .set(authed(state.adminToken))
      .send({ body: 'Flat 20% off this weekend!', type: 'PROMOTION', allCustomers: true });

    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.sent).toBe(1);
    expect(res.body.data.failed).toBe(0);
  });

  it('skips a customer who has opted out', async () => {
    await request(app)
      .patch(`/api/customers/${state.customerId}/opt-in`)
      .set(authed(state.adminToken));

    const res = await request(app)
      .post('/api/customers/broadcast')
      .set(authed(state.adminToken))
      .send({ body: 'Another offer you will not receive', allCustomers: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no opted-in customers/i);
  });
});

// ---------------------------------------------------------------------------
// TC14 — reports
// ---------------------------------------------------------------------------

describe('TC14 reports', () => {
  it('summarises revenue, best sellers and feedback, excluding cancelled orders', async () => {
    const res = await request(app)
      .get('/api/reports/summary?days=7')
      .set(authed(state.adminToken));

    expect(res.status).toBe(200);

    const data = res.body.data;
    expect(data.today.orders).toBe(1); // the cancelled second order is excluded
    expect(data.today.revenue).toBe(677.25);
    expect(data.statusCounts.CANCELLED).toBe(1);
    expect(data.trend).toHaveLength(7);

    // Ranked by quantity sold: 3 naan beat 2 paneer. The cancelled order's naan
    // is not counted.
    expect(data.topSelling.map((i) => [i.name, i.quantity])).toEqual([
      ['Butter Naan', 3],
      ['Paneer Tikka', 2],
    ]);

    expect(data.customers.total).toBe(1);
    expect(data.feedback.count).toBe(2);
  });
});

describe('health check', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
