'use strict';

/**
 * Populates a fresh database with everything needed to demo the system: one
 * restaurant, an admin and a staff login, tables with printable QR codes, a
 * menu, and a few orders so the dashboard and reports are not empty.
 *
 *   npm run seed          # add anything missing, leave existing data alone
 *   npm run seed:reset    # wipe the collections first
 */

const mongoose = require('mongoose');

const { connectDatabase, disconnectDatabase } = require('../config/db');
const env = require('../config/env');
const logger = require('../lib/logger');
const Counter = require('../models/Counter');
const Customer = require('../models/Customer');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../models/Order');
const Rating = require('../models/Rating');
const Restaurant = require('../models/Restaurant');
const ServiceRequest = require('../models/ServiceRequest');
const StaffUser = require('../models/StaffUser');
const { ROLES } = require('../models/StaffUser');
const Table = require('../models/Table');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const orderService = require('../services/order.service');
const qrService = require('../services/qr.service');
const ratingService = require('../services/rating.service');

const RESET = process.argv.includes('--reset');

const MENU = [
  { name: 'Masala Papad', description: 'Crisp papad topped with onion, tomato and chaat masala.', price: 60, category: 'Starters', spiceLevel: 'mild', preparationMinutes: 5 },
  { name: 'Paneer Tikka', description: 'Cottage cheese cubes marinated in yoghurt and spices, grilled in the tandoor.', price: 240, category: 'Starters', spiceLevel: 'medium', preparationMinutes: 18 },
  { name: 'Chicken 65', description: 'South-Indian style fried chicken with curry leaves.', price: 260, category: 'Starters', isVegetarian: false, spiceLevel: 'hot', preparationMinutes: 20 },
  { name: 'Veg Manchurian', description: 'Fried vegetable dumplings tossed in a tangy Indo-Chinese sauce.', price: 210, category: 'Starters', spiceLevel: 'medium', preparationMinutes: 15 },

  { name: 'Paneer Butter Masala', description: 'Paneer simmered in a rich tomato and cashew gravy.', price: 290, category: 'Main Course', spiceLevel: 'mild', preparationMinutes: 22 },
  { name: 'Dal Tadka', description: 'Yellow lentils tempered with cumin, garlic and ghee.', price: 180, category: 'Main Course', spiceLevel: 'mild', preparationMinutes: 18 },
  { name: 'Butter Chicken', description: 'Tandoori chicken in a creamy tomato gravy.', price: 340, category: 'Main Course', isVegetarian: false, spiceLevel: 'mild', preparationMinutes: 25 },
  { name: 'Hyderabadi Chicken Biryani', description: 'Long-grain basmati layered with marinated chicken, served with raita.', price: 320, category: 'Main Course', isVegetarian: false, spiceLevel: 'hot', preparationMinutes: 30 },
  { name: 'Veg Biryani', description: 'Basmati rice cooked with seasonal vegetables and whole spices.', price: 250, category: 'Main Course', spiceLevel: 'medium', preparationMinutes: 25 },

  { name: 'Butter Naan', description: 'Leavened flatbread brushed with butter.', price: 55, category: 'Breads', preparationMinutes: 8 },
  { name: 'Tandoori Roti', description: 'Whole-wheat flatbread from the tandoor.', price: 40, category: 'Breads', preparationMinutes: 8 },
  { name: 'Laccha Paratha', description: 'Flaky layered paratha.', price: 65, category: 'Breads', preparationMinutes: 10 },

  { name: 'Masala Chaas', description: 'Spiced buttermilk with mint and roasted cumin.', price: 70, category: 'Beverages', preparationMinutes: 4 },
  { name: 'Sweet Lassi', description: 'Thick yoghurt drink, lightly sweetened.', price: 90, category: 'Beverages', preparationMinutes: 5 },
  { name: 'Fresh Lime Soda', description: 'Sweet or salted, your choice.', price: 80, category: 'Beverages', preparationMinutes: 3 },

  { name: 'Gulab Jamun', description: 'Two warm milk dumplings in cardamom syrup.', price: 110, category: 'Desserts', preparationMinutes: 5 },
  { name: 'Gajar Halwa', description: 'Slow-cooked carrot pudding with khoya and nuts.', price: 130, category: 'Desserts', preparationMinutes: 6 },
];

const SAMPLE_CUSTOMERS = [
  { name: 'Aarav Sharma', phone: '9876543210' },
  { name: 'Diya Patel', phone: '9812345678' },
  { name: 'Rohan Mehta', phone: '9900112233' },
];

async function wipe() {
  logger.info('--reset given: clearing existing data.');
  await Promise.all([
    Counter.deleteMany({}),
    Customer.deleteMany({}),
    MenuItem.deleteMany({}),
    Order.deleteMany({}),
    Rating.deleteMany({}),
    Restaurant.deleteMany({}),
    ServiceRequest.deleteMany({}),
    StaffUser.deleteMany({}),
    Table.deleteMany({}),
    WhatsAppMessage.deleteMany({}),
  ]);
}

async function seedRestaurant() {
  const existing = await Restaurant.findOne({ name: env.seed.restaurantName });
  if (existing) return existing;

  return Restaurant.create({
    name: env.seed.restaurantName,
    address: '14 MG Road, Bengaluru 560001',
    phone: '+91 80 4000 1234',
    taxPercent: 5,
  });
}

async function seedStaff(restaurant) {
  const wanted = [
    {
      name: 'Restaurant Admin',
      username: env.seed.adminUsername,
      password: env.seed.adminPassword,
      role: ROLES.ADMIN,
    },
    {
      name: 'Floor Staff',
      username: env.seed.staffUsername,
      password: env.seed.staffPassword,
      role: ROLES.STAFF,
    },
  ];

  const created = [];
  for (const person of wanted) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await StaffUser.findOne({
      restaurant: restaurant._id,
      username: person.username.toLowerCase(),
    });
    if (exists) continue;

    created.push(
      // eslint-disable-next-line no-await-in-loop
      await StaffUser.create({
        restaurant: restaurant._id,
        name: person.name,
        username: person.username,
        // eslint-disable-next-line no-await-in-loop
        passwordHash: await StaffUser.hashPassword(person.password),
        role: person.role,
      })
    );
  }

  return created;
}

async function seedTables(restaurant) {
  const tables = [];
  for (let n = 1; n <= env.seed.tableCount; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    let table = await Table.findOne({ restaurant: restaurant._id, tableNumber: n });
    if (!table) {
      // eslint-disable-next-line no-await-in-loop
      table = await Table.create({ restaurant: restaurant._id, tableNumber: n, seats: n <= 4 ? 4 : 6 });
    }
    if (!table.qrCodeUrl) {
      // eslint-disable-next-line no-await-in-loop
      table.qrCodeUrl = await qrService.generateTableQrDataUrl(table.code);
      // eslint-disable-next-line no-await-in-loop
      await table.save();
    }
    tables.push(table);
  }
  return tables;
}

async function seedMenu(restaurant) {
  const items = [];
  for (const [index, entry] of MENU.entries()) {
    // eslint-disable-next-line no-await-in-loop
    let item = await MenuItem.findOne({ restaurant: restaurant._id, name: entry.name });
    if (!item) {
      // eslint-disable-next-line no-await-in-loop
      item = await MenuItem.create({
        ...entry,
        restaurant: restaurant._id,
        isVegetarian: entry.isVegetarian !== false,
        sortOrder: index,
      });
    }
    items.push(item);
  }
  return items;
}

/**
 * Three orders in different states so the live monitor, the order history and
 * the reports screen all have something to show on first run.
 */
async function seedOrders(restaurant, tables, menuItems) {
  if ((await Order.countDocuments({ restaurant: restaurant._id })) > 0) {
    logger.info('Orders already present, skipping sample orders.');
    return;
  }

  const pick = (name) => menuItems.find((m) => m.name === name);

  const plan = [
    {
      table: tables[0],
      customer: SAMPLE_CUSTOMERS[0],
      items: [
        { menuItemId: pick('Paneer Tikka')._id, quantity: 1, note: 'Less spicy please' },
        { menuItemId: pick('Butter Naan')._id, quantity: 2, note: '' },
        { menuItemId: pick('Sweet Lassi')._id, quantity: 2, note: '' },
      ],
      finalStatus: ORDER_STATUS.SERVED,
      ratings: [
        { name: 'Paneer Tikka', stars: 5, comment: 'Perfectly charred, loved it.' },
        { name: 'Butter Naan', stars: 4, comment: 'Soft and hot.' },
      ],
    },
    {
      table: tables[1],
      customer: SAMPLE_CUSTOMERS[1],
      items: [
        { menuItemId: pick('Hyderabadi Chicken Biryani')._id, quantity: 2, note: '' },
        { menuItemId: pick('Masala Chaas')._id, quantity: 2, note: 'No mint' },
      ],
      finalStatus: ORDER_STATUS.PREPARING,
      ratings: [],
    },
    {
      table: tables[2],
      customer: SAMPLE_CUSTOMERS[2],
      items: [
        { menuItemId: pick('Paneer Butter Masala')._id, quantity: 1, note: '' },
        { menuItemId: pick('Dal Tadka')._id, quantity: 1, note: '' },
        { menuItemId: pick('Tandoori Roti')._id, quantity: 4, note: '' },
      ],
      finalStatus: ORDER_STATUS.RECEIVED,
      ratings: [],
    },
  ];

  for (const entry of plan) {
    // eslint-disable-next-line no-await-in-loop
    const { order, customer } = await orderService.createOrder({
      restaurant,
      table: entry.table,
      customerInput: entry.customer,
      items: entry.items,
      note: '',
    });

    // Walk the real state machine so statusHistory looks like a genuine ticket.
    if (entry.finalStatus === ORDER_STATUS.PREPARING || entry.finalStatus === ORDER_STATUS.SERVED) {
      // eslint-disable-next-line no-await-in-loop
      await orderService.transitionStatus({ order, nextStatus: ORDER_STATUS.PREPARING });
    }
    if (entry.finalStatus === ORDER_STATUS.SERVED) {
      // eslint-disable-next-line no-await-in-loop
      await orderService.transitionStatus({ order, nextStatus: ORDER_STATUS.SERVED });
    }

    for (const rating of entry.ratings) {
      // eslint-disable-next-line no-await-in-loop
      await ratingService.submitRating({
        restaurantId: restaurant._id,
        orderId: order._id,
        customerId: customer._id,
        customerFirstName: entry.customer.name.split(' ')[0],
        menuItemId: pick(rating.name)._id,
        stars: rating.stars,
        comment: rating.comment,
      });
    }

    if (entry.ratings.length) {
      order.isRated = true;
      // eslint-disable-next-line no-await-in-loop
      await order.save();
    }

    logger.info(`Seeded order ${order.orderNumber} on table ${entry.table.tableNumber} (${entry.finalStatus})`);
  }
}

async function run() {
  await connectDatabase();
  if (RESET) await wipe();

  const restaurant = await seedRestaurant();
  const staff = await seedStaff(restaurant);
  const tables = await seedTables(restaurant);
  const menuItems = await seedMenu(restaurant);
  await seedOrders(restaurant, tables, menuItems);

  logger.info('');
  logger.info('=== QR-Bite seed complete ===');
  logger.info(`Restaurant : ${restaurant.name}`);
  logger.info(`Tables     : ${tables.length}`);
  logger.info(`Menu items : ${menuItems.length}`);
  logger.info(`Staff added: ${staff.length} (existing accounts were left alone)`);
  logger.info('');
  logger.info(`Admin login : ${env.seed.adminUsername} / ${env.seed.adminPassword}`);
  logger.info(`Staff login : ${env.seed.staffUsername} / ${env.seed.staffPassword}`);
  logger.info('');
  logger.info('Scan-free test links (open these to simulate scanning a table QR):');
  tables.slice(0, 3).forEach((t) => {
    logger.info(`  Table ${t.tableNumber}: ${qrService.buildTableUrl(t.code)}`);
  });
  logger.info('');
  logger.info('Printable QR codes are on the dashboard under Tables.');

  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error('Seed failed:', err.stack || err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
