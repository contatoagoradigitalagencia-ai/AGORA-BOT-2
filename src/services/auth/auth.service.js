import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../../models/user.model.js';

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export async function authenticateWithPhone(phone, password) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || !password) {
    return { error: 'invalid_credentials', status: 401 };
  }

  if (!env.jwtSecret) {
    return { error: 'auth_not_configured', status: 503 };
  }

  const user = await User.findOne({ phone: normalizedPhone, active: true }).select('+passwordHash');
  if (!user) {
    return { error: 'invalid_credentials', status: 401 };
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return { error: 'invalid_credentials', status: 401 };
  }

  const organizationId = String(user.organizationId);
  const token = jwt.sign(
    {
      sub: String(user._id),
      userId: String(user._id),
      organizationId,
      role: user.role,
      phone: user.phone,
      name: user.name,
      email: user.email,
    },
    env.jwtSecret,
    { expiresIn: '7d' },
  );

  return {
    idPhone: organizationId,
    token,
  };
}

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
}
