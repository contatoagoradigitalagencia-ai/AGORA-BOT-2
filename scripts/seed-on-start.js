import { Organization } from '../src/models/organization.model.js';
import { User } from '../src/models/user.model.js';
import { hashPassword, normalizePhone } from '../src/services/auth/auth.service.js';

export async function seedAdminIfNeeded() {
  try {
    const phone = normalizePhone(process.env.ADMIN_PHONE || '5521971107509');
    const password = process.env.ADMIN_PASSWORD;

    // Se não tem ADMIN_PASSWORD, só roda se não existe nenhum usuário ainda
    const existingUser = await User.findOne({ phone });
    if (existingUser && !password) {
      console.log('[seed] Usuário já existe, pulando seed.');
      return;
    }

    // Garante organização
    let org = await Organization.findOne({});
    if (!org) {
      org = await Organization.create({
        name: 'Agora Digital',
        slug: 'agora-digital',
        status: 'active',
      });
      console.log('[seed] Organização criada:', String(org._id));
    }

    // Senha: ADMIN_PASSWORD ou padrão se primeiro setup
    const plainPassword = password || 'Agora@2024';
    const passwordHash = await hashPassword(plainPassword);
    const name = process.env.ADMIN_NAME || 'Ramon';

    if (existingUser) {
      existingUser.passwordHash   = passwordHash;
      existingUser.organizationId = org._id;
      existingUser.role           = 'owner';
      existingUser.active         = true;
      existingUser.name           = name;
      await existingUser.save();
      console.log('[seed] Admin atualizado — phone:', phone);
    } else {
      await User.create({
        organizationId: org._id,
        name,
        phone,
        email: phone + '@agora.local',
        role: 'owner',
        active: true,
        passwordHash,
      });
      console.log('[seed] Admin criado — phone:', phone);
      console.log('[seed] Senha padrão: Agora@2024 (mude após primeiro login)');
    }

    console.log('[seed] organizationId:', String(org._id));
  } catch (err) {
    console.error('[seed] erro:', err.message);
  }
}
