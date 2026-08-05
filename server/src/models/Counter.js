'use strict';

const mongoose = require('mongoose');

/**
 * Atomic sequence generator. Used for human-readable order numbers (ORD1023)
 * which staff read aloud across the pass — an ObjectId is unusable for that.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(key, start = 1000) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return start + doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
