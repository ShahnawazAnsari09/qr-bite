'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = Object.freeze({ ADMIN: 'admin', STAFF: 'staff' });

const staffUserSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.STAFF },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

staffUserSchema.index({ restaurant: 1, username: 1 }, { unique: true });

staffUserSchema.statics.ROLES = ROLES;

staffUserSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

staffUserSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

staffUserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    return ret;
  },
});

const StaffUser = mongoose.model('StaffUser', staffUserSchema);

module.exports = StaffUser;
module.exports.ROLES = ROLES;
