import crypto from 'node:crypto';
import { env } from '../../config/env.js';

function key() {
  if (!env.encryptionKey || env.encryptionKey.length < 32) return null;
  return crypto.createHash('sha256').update(env.encryptionKey).digest();
}

export function encryptSecret(value) {
  if (!value) return '';
  const secretKey = key();
  if (!secretKey) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value) {
  if (!value || !String(value).startsWith('enc:v1:')) return value || '';
  const secretKey = key();
  if (!secretKey) throw new Error('ENCRYPTION_KEY is required to decrypt stored secret');
  const [, , ivB64, tagB64, encryptedB64] = String(value).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
