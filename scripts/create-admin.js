import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../src/db/mongoose.js';
import { Organization } from '../src/models/organization.model.js';
import { User } from '../src/models/user.model.js';
import { hashPassword, normalizePhone } from '../src/services/auth/auth.service.js';

dotenv.config();

const ADMIN = {
  name: 'Ramon',
  phone: '5521971107509',
  email: 'admin@agoradigital.com.br',
  role: 'owner',
  active: true,
  organizationName: 'Agora Digital',
  organizationSlug: 'agora-digital',
};

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('[create-admin] ADMIN_PASSWORD is required');
    process.exit(1);
  }

  await connectMongo();

  let organization = await Organization.findOne({ slug: ADMIN.organizationSlug });
  if (!organization) {
    organization = await Organization.create({
      name: ADMIN.organizationName,
      slug: ADMIN.organizationSlug,
      status: 'active',
    });
    console.log(`[create-admin] Organization created: ${organization._id}`);
  } else {
    console.log(`[create-admin] Organization exists: ${organization._id}`);
  }

  const phone = normalizePhone(ADMIN.phone);
  const passwordHash = await hashPassword(password);

  const existing = await User.findOne({ phone });
  if (existing) {
    existing.name = ADMIN.name;
    existing.email = ADMIN.email;
    existing.role = ADMIN.role;
    existing.active = ADMIN.active;
    existing.organizationId = organization._id;
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`[create-admin] User updated: ${existing._id} (phone ${phone})`);
  } else {
    const user = await User.create({
      organizationId: organization._id,
      name: ADMIN.name,
      phone,
      email: ADMIN.email,
      role: ADMIN.role,
      active: ADMIN.active,
      passwordHash,
    });
    console.log(`[create-admin] User created: ${user._id} (phone ${phone})`);
  }

  console.log(`[create-admin] Login idPhone (organizationId): ${organization._id}`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('[create-admin] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
