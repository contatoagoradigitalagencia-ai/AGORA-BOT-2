/**
 * Cache Service — Agora Bot 2
 * Cache in-memory com TTL configurável por namespace.
 * Evita consultas repetidas ao MongoDB para dados estáticos.
 */

const store = new Map(); // key → { value, expiresAt }

const TTL_MS = {
  catalog: 5 * 60 * 1000,   // 5 minutos
  plans: 5 * 60 * 1000,
  faq: 10 * 60 * 1000,
  profile: 2 * 60 * 1000,
  default: 3 * 60 * 1000,
};

function makeKey(namespace, organizationId, suffix = '') {
  return `${namespace}:${organizationId}${suffix ? ':' + suffix : ''}`;
}

export function cacheGet(namespace, organizationId, suffix = '') {
  const key = makeKey(namespace, organizationId, suffix);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(namespace, organizationId, value, suffix = '') {
  const key = makeKey(namespace, organizationId, suffix);
  const ttl = TTL_MS[namespace] ?? TTL_MS.default;
  store.set(key, { value, expiresAt: Date.now() + ttl });
}

export function cacheInvalidate(namespace, organizationId, suffix = '') {
  const key = makeKey(namespace, organizationId, suffix);
  store.delete(key);
}

export function cacheInvalidateAll(organizationId) {
  for (const key of store.keys()) {
    if (key.includes(`:${organizationId}`)) store.delete(key);
  }
}

/** Estatísticas para o dashboard de métricas */
const stats = { hits: 0, misses: 0 };

export function cacheGetWithStats(namespace, organizationId, suffix = '') {
  const result = cacheGet(namespace, organizationId, suffix);
  if (result !== null) stats.hits++;
  else stats.misses++;
  return result;
}

export function getCacheStats() {
  return { ...stats, storeSize: store.size };
}
