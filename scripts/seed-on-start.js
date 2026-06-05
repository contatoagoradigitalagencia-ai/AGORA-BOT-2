/**
 * Roda automaticamente no start se ADMIN_PASSWORD estiver definido.
 * Cria/atualiza o usuário admin sem precisar de shell.
 */
import { connectMongo } from '../src/db/mongoose.js';
import { Organization } from '../src/models/organization.model.js';
import { User } from '../src/models/user.model.js';
import { hashPassword, normalizePhone } from '../src/services/auth/auth.service.js';
import mongoose from 'mongoose';

export async function seedAdminIfNeeded() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;

  try {
    const phone = normalizePhone(process.env.ADMIN_PHONE || '5521971107509');
    const name  = process.env.ADMIN_NAME || 'Ramon';

    let org = await Organization.findOne({});
    if (!org) {
      org = await Organization.create({
        name: 'Agora Digital',
        slug: 'agora-digital',
        status: 'active',
      });
      console.log('[seed] Organization created:', String(org._id));
    }

    const passwordHash = await hashPassword(password);
    const existing = await User.findOne({ phone });

    if (existing) {
      existing.passwordHash   = passwordHash;
      existing.organizationId = org._id;
      existing.role           = 'owner';
      existing.active         = true;
      existing.name           = name;
      await existing.save();
      console.log('[seed] Admin updated — phone:', phone);
    } else {
      await User.create({
        organizationId: org._id,
        name,
        phone,
        email: phone + '@agora.local',
        role:  'owner',
        active: true,
        passwordHash,
      });
      console.log('[seed] Admin created — phone:', phone);
    }

    console.log('[seed] organizationId:', String(org._id));
    console.log('[seed] Login pronto — telefone:', phone);
  } catch (err) {
    console.error('[seed] erro:', err.message);
  }
}
