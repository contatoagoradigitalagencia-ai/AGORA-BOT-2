import http from 'node:http';
import { env } from './config/env.js';
import { connectMongo } from './db/mongoose.js';
import { createSocketServer } from './socket/index.js';
import { createApp } from './app.js';

async function bootstrap() {
  await connectMongo();
  const server = http.createServer();
  const io = createSocketServer(server);
  const app = createApp({ io });
  server.on('request', app);
  server.listen(env.port, () => {
    console.log(`Agora Bot 2 running on port ${env.port} using database ${env.mongodbDbName}`);
  });
}

bootstrap().catch((error) => {
  console.error('[Startup] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
