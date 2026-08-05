'use strict';

const { z } = require('zod');

const objectId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid id');

const tableCode = z.string().min(4).max(64);

const phone = z
  .string()
  .trim()
  .min(8, 'Phone number is too short')
  .max(20, 'Phone number is too long')
  .regex(/^[+0-9\s()-]+$/, 'Phone number contains invalid characters');

const personName = z
  .string()
  .trim()
  .min(2, 'Please enter your name')
  .max(60, 'Name is too long');

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(6).max(128),
});

const createStaffSchema = z.object({
  name: personName,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'Username may only contain letters, numbers, dot, dash and underscore'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  role: z.enum(['admin', 'staff']).default('staff'),
});

// ---------------------------------------------------------------------------
// Menu management
// ---------------------------------------------------------------------------

const menuItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  price: z.coerce.number().min(0).max(100000),
  category: z.string().trim().min(2).max(60),
  imageUrl: z.string().trim().max(600).default(''),
  isVegetarian: z.coerce.boolean().default(true),
  spiceLevel: z.enum(['none', 'mild', 'medium', 'hot']).default('none'),
  preparationMinutes: z.coerce.number().int().min(0).max(240).default(15),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

const menuItemUpdateSchema = menuItemSchema.partial();

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const createTableSchema = z.object({
  tableNumber: z.coerce.number().int().min(1).max(999),
  label: z.string().trim().max(60).default(''),
  seats: z.coerce.number().int().min(1).max(40).default(4),
});

const bulkTablesSchema = z.object({
  from: z.coerce.number().int().min(1).max(999),
  to: z.coerce.number().int().min(1).max(999),
  seats: z.coerce.number().int().min(1).max(40).default(4),
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const placeOrderSchema = z.object({
  tableCode,
  customer: z.object({ name: personName, phone }),
  items: z
    .array(
      z.object({
        menuItemId: objectId,
        quantity: z.coerce.number().int().min(1).max(50),
        note: z.string().trim().max(200).default(''),
      })
    )
    .min(1, 'Add at least one dish to your cart')
    .max(40, 'That is too many separate dishes for one order'),
  note: z.string().trim().max(300).default(''),
});

const updateStatusSchema = z.object({
  status: z.enum(['RECEIVED', 'PREPARING', 'SERVED', 'CANCELLED']),
});

const orderQuerySchema = pagination.extend({
  status: z.enum(['RECEIVED', 'PREPARING', 'SERVED', 'CANCELLED', 'ACTIVE', 'ALL']).default('ALL'),
  tableNumber: z.coerce.number().int().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Ratings & feedback
// ---------------------------------------------------------------------------

const submitRatingsSchema = z.object({
  ratings: z
    .array(
      z.object({
        menuItemId: objectId,
        stars: z.coerce.number().int().min(1).max(5),
        comment: z.string().trim().max(500).default(''),
      })
    )
    .min(1, 'Rate at least one dish')
    .max(40),
});

// ---------------------------------------------------------------------------
// Service requests & WhatsApp
// ---------------------------------------------------------------------------

const serviceRequestSchema = z.object({
  tableCode,
  type: z.enum(['CALL_WAITER', 'WATER', 'BILL']).default('CALL_WAITER'),
});

const broadcastSchema = z
  .object({
    body: z.string().trim().min(5, 'Message is too short').max(1000),
    type: z.enum(['PROMOTION', 'GREETING']).default('PROMOTION'),
    // Omit customerIds to target the whole opted-in customer list.
    customerIds: z.array(objectId).max(2000).optional(),
    allCustomers: booleanish.default(false),
  })
  .refine((data) => data.allCustomers || (data.customerIds && data.customerIds.length > 0), {
    message: 'Select at least one customer, or choose to message the full list',
    path: ['customerIds'],
  });

// ---------------------------------------------------------------------------
// Shared param / query schemas
// ---------------------------------------------------------------------------

const idParam = z.object({ id: objectId });
const codeParam = z.object({ code: tableCode });
const reportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
});
const customerQuerySchema = pagination.extend({
  search: z.string().trim().max(60).optional(),
  sort: z.enum(['recent', 'spend', 'orders']).default('recent'),
});

module.exports = {
  objectId,
  idParam,
  codeParam,
  pagination,
  loginSchema,
  createStaffSchema,
  menuItemSchema,
  menuItemUpdateSchema,
  createTableSchema,
  bulkTablesSchema,
  placeOrderSchema,
  updateStatusSchema,
  orderQuerySchema,
  submitRatingsSchema,
  serviceRequestSchema,
  broadcastSchema,
  reportQuerySchema,
  customerQuerySchema,
};
