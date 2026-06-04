import mongoose from 'mongoose';
import { env, assertRuntimeEnv } from '../config/env.js';

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  assertRuntimeEnv();
  await mongoose.connect(env.mongodbUri, {
    dbName: env.mongodbDbName,
    serverSelectionTimeoutMS: 10000,
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] disconnected');
  });
  return mongoose.connection;
}

export function mongoState() {
  return {
    readyState: mongoose.connection.readyState,
    database: mongoose.connection.name || env.mongodbDbName,
    host: mongoose.connection.host || null,
  };
}
