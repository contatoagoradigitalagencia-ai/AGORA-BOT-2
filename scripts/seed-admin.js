/**
 * Script de seed — cria ou atualiza conta admin padrão.
 * Uso: node scripts/seed-admin.js
 *
 * Requer MONGODB_URI no ambiente (ou .env na raiz).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = process.env.MONGODB_DB_NAME || process.env.MONGODB_DBNAME || 'Agorabot2';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida.');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
console.log('✅ MongoDB conectado —', DB_NAME);

// ── Garante que existe uma Organization padrão ──────────────────────────────
const orgCollection  = mongoose.connection.collection('organizations');
let org = await orgCollection.findOne({ name: 'Agora Digital' });

if (!org) {
  const result = await orgCollection.insertOne({
    name:      'Agora Digital',
    slug:      'agora-digital',
    active:    true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  org = { _id: result.insertedId, name: 'Agora Digital' };
  console.log('✅ Organization criada:', String(org._id));
} else {
  console.log('ℹ️  Organization já existe:', String(org._id));
}

// ── Cria ou atualiza usuário admin ─────────────────────────────────────────
const usersCollection = mongoose.connection.collection('users');

const ADMIN_PHONE    = '5521971107509'; // telefone de login
const ADMIN_PASSWORD = 'agFd5b9e596168b46e08b3dxd934aeecd1ce8S';
const passwordHash   = await bcrypt.hash(ADMIN_PASSWORD, 12);

const existing = await usersCollection.findOne({ phone: ADMIN_PHONE });

if (existing) {
  await usersCollection.updateOne(
    { _id: existing._id },
    {
      $set: {
        name:           'Admin',
        role:           'owner',
        active:         true,
        passwordHash,
        organizationId: org._id,
        updatedAt:      new Date(),
      },
    }
  );
  console.log('✅ Usuário admin atualizado:', String(existing._id));
} else {
  const result = await usersCollection.insertOne({
    organizationId: org._id,
    name:           'Admin',
    phone:          ADMIN_PHONE,
    email:          'admin@agoradigital.com',
    role:           'owner',
    active:         true,
    passwordHash,
    createdAt:      new Date(),
    updatedAt:      new Date(),
  });
  console.log('✅ Usuário admin criado:', String(result.insertedId));
}

console.log('\n📋 Credenciais de acesso:');
console.log('   Telefone : ' + ADMIN_PHONE);
console.log('   Senha    : ' + ADMIN_PASSWORD);
console.log('   Org ID   : ' + String(org._id));

await mongoose.disconnect();
console.log('\n✅ Seed concluído.');
