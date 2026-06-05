/**
 * Catalog Service — Agora Bot 2
 * Retorna JSON estruturado. A formatação é responsabilidade da camada superior.
 * Usa cache interno para evitar queries repetidas.
 */

import { Product, Service, Plan, KnowledgeBase } from '../../models/index.js';
import { cacheGetWithStats, cacheSet } from '../cache/cache.service.js';

export async function getProducts(organizationId) {
  const cached = cacheGetWithStats('catalog', organizationId, 'products');
  if (cached) return cached;
  const data = await Product.find({ organizationId, active: true })
    .select('name description price currency conditions')
    .sort({ name: 1 }).limit(60).lean();
  cacheSet('catalog', organizationId, data, 'products');
  return data;
}

export async function getServices(organizationId) {
  const cached = cacheGetWithStats('catalog', organizationId, 'services');
  if (cached) return cached;
  const data = await Service.find({ organizationId, active: true })
    .select('name description price currency conditions')
    .sort({ name: 1 }).limit(60).lean();
  cacheSet('catalog', organizationId, data, 'services');
  return data;
}

export async function getPlans(organizationId) {
  const cached = cacheGetWithStats('plans', organizationId);
  if (cached) return cached;
  const data = await Plan.find({ organizationId, active: true })
    .select('name description price currency conditions features')
    .sort({ price: 1 }).limit(30).lean();
  cacheSet('plans', organizationId, data);
  return data;
}

export async function getPlanByName(organizationId, name) {
  const plans = await getPlans(organizationId);
  const search = name.toLowerCase();
  return plans.find((p) => p.name.toLowerCase().includes(search)) || null;
}

export async function getKnowledgeBase(organizationId) {
  const cached = cacheGetWithStats('catalog', organizationId, 'kb');
  if (cached) return cached;
  const data = await KnowledgeBase.find({ organizationId, active: true })
    .select('title content category tags')
    .sort({ updatedAt: -1 }).limit(20).lean();
  cacheSet('catalog', organizationId, data, 'kb');
  return data;
}

/** Contexto minimalista para IA — nunca catálogo completo */
export async function buildMinimalAIContext(organizationId) {
  const [products, services, plans] = await Promise.all([
    getProducts(organizationId),
    getServices(organizationId),
    getPlans(organizationId),
  ]);
  const fmt = (kind, item) =>
    `${kind}: ${item.name} | R$ ${typeof item.price === 'number' ? item.price.toFixed(2) : 'consulta'} | ${(item.description || '').slice(0, 80)}`;
  return [
    ...products.slice(0, 10).map((i) => fmt('Produto', i)),
    ...services.slice(0, 10).map((i) => fmt('Serviço', i)),
    ...plans.slice(0, 8).map((i) => fmt('Plano', i)),
  ].join('\n');
}

// Formatadores de resposta WhatsApp
function fmtPrice(item) {
  return typeof item.price === 'number' ? `R$ ${item.price.toFixed(2)}` : 'consulte-nos';
}

export function formatProductsText(products) {
  if (!products.length) return 'Nenhum produto cadastrado no momento.';
  return `*Nossos Produtos*\n\n${products.map((p) => `• *${p.name}* — ${fmtPrice(p)}\n  ${p.description || ''}`).join('\n\n')}`;
}

export function formatServicesText(services) {
  if (!services.length) return 'Nenhum serviço cadastrado no momento.';
  return `*Nossos Serviços*\n\n${services.map((s) => `• *${s.name}* — ${fmtPrice(s)}\n  ${s.description || ''}`).join('\n\n')}`;
}

export function formatPlansText(plans) {
  if (!plans.length) return 'Nenhum plano cadastrado no momento.';
  return `*Nossos Planos*\n\n${plans.map((p) => {
    const feats = (p.features || []).slice(0, 5).map((f) => `  ✅ ${f}`).join('\n');
    return `*${p.name}* — ${fmtPrice(p)}/mês\n${p.description || ''}\n${feats}`;
  }).join('\n\n')}`;
}

/** Mantém compatibilidade com bot-response.service legado */
export async function getCatalogContext(organizationId) {
  return buildMinimalAIContext(organizationId);
}
