import http from 'node:http';
import { env } from './config/env.js';
import { connectMongo } from './db/mongoose.js';
import { createSocketServer } from './socket/index.js';
import { createApp } from './app.js';

async function bootstrap() {
  await connectMongo();
  // Seed admin inline
  try {
    const { Organization } = await import('./models/organization.model.js');
    const { User } = await import('./models/user.model.js');
    const bcrypt = await import('bcryptjs');
    const phone = (process.env.ADMIN_PHONE || '5521971107509').replace(/\D/g, '');
    const existing = await User.findOne({ phone });
    const password = process.env.ADMIN_PASSWORD || 'Agora@2024';
    let org = await Organization.findOne({});
    if (!org) {
      org = await Organization.create({ name: 'Agora Digital', slug: 'agora-digital', status: 'active' });
      console.log('[seed] org criada:', String(org._id));
    }
    const hash = await bcrypt.default.hash(password, 12);
    if (existing) {
      existing.passwordHash = hash;
      existing.organizationId = org._id;
      existing.active = true;
      existing.role = 'owner';
      await existing.save();
      console.log('[seed] admin atualizado — phone:', phone);
    } else {
      await User.create({ organizationId: org._id, name: process.env.ADMIN_NAME || 'Ramon', phone, email: phone + '@agora.local', role: 'owner', active: true, passwordHash: hash });
      console.log('[seed] admin criado — phone:', phone, '| senha:', password);
    }
  } catch(e) { console.error('[seed] erro:', e.message); }
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
