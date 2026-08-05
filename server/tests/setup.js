'use strict';

/**
 * Each test file gets its own throwaway MongoDB, so the suite needs no local
 * database installed and tests in different files cannot see each other's data.
 */

process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});
