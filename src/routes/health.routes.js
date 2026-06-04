import { Router } from 'express';
import { mongoState } from '../db/mongoose.js';
import { env } from '../config/env.js';

export const healthRoutes = Router();

healthRoutes.get('/health', (req, res) => {
  const mongo = mongoState();
  res.json({
    ok: mongo.readyState === 1,
    service: 'agora-bot-2',
    database: env.mongodbDbName,
    mongo,
  });
});
