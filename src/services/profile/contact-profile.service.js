/**
 * Contact Profile Service — Agora Bot 2
 * Mantém perfil simplificado do contato em memória (com persistência assíncrona no Contact).
 * A IA recebe RESUMO, nunca histórico bruto.
 */

import { Contact } from '../../models/index.js';
import { cacheGet, cacheSet } from '../cache/cache.service.js';

const PROFILE_FIELDS = ['interests', 'lastIntent', 'stage', 'tags', 'leadScore', 'lastPurchase'];

export async function getContactProfile(organizationId, contactId) {
  const cached = cacheGet('profile', organizationId, String(contactId));
  if (cached) return cached;

  const contact = await Contact.findOne({ _id: contactId, organizationId })
    .select('name phone metadata')
    .lean();

  const profile = {
    name: contact?.name || 'Cliente',
    phone: contact?.phone || '',
    interests: contact?.metadata?.interests || [],
    lastIntent: contact?.metadata?.lastIntent || 'unknown',
    stage: contact?.metadata?.stage || 'cold',
    tags: contact?.metadata?.tags || [],
    leadScore: contact?.metadata?.leadScore || 0,
    lastPurchase: contact?.metadata?.lastPurchase || null,
  };

  cacheSet('profile', organizationId, profile, String(contactId));
  return profile;
}

export async function updateContactProfile(organizationId, contactId, intent) {
  // Atualiza lastIntent e incrementa leadScore para intents de venda
  const scoreMap = { sales: 10, price: 5, plans: 5, objection: 3, products: 2, services: 2 };
  const scoreIncrement = scoreMap[intent] || 0;

  await Contact.updateOne(
    { _id: contactId, organizationId },
    {
      $set: { 'metadata.lastIntent': intent },
      $inc: { 'metadata.leadScore': scoreIncrement },
    },
  );

  // Invalida cache de perfil
  const staleKey = cacheGet('profile', organizationId, String(contactId));
  if (staleKey) {
    // Força refresh na próxima chamada
    cacheSet('profile', organizationId, null, String(contactId));
  }
}

/**
 * Monta resumo compacto do perfil para enviar à IA.
 * Máximo 2-3 linhas.
 */
export function buildProfileSummary(profile) {
  const parts = [`Cliente: ${profile.name}`];
  if (profile.stage && profile.stage !== 'cold') parts.push(`Estágio: ${profile.stage}`);
  if (profile.leadScore > 0) parts.push(`Lead score: ${profile.leadScore}`);
  if (profile.lastIntent && profile.lastIntent !== 'unknown') parts.push(`Último interesse: ${profile.lastIntent}`);
  if (profile.tags?.length) parts.push(`Tags: ${profile.tags.join(', ')}`);
  return parts.join(' | ');
}
