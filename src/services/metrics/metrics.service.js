/**
 * Metrics Service — Agora Bot 2
 * Contadores em memória + persistência assíncrona no Mongo.
 * Alimenta o dashboard de economia de tokens.
 */

import { Metric } from '../../models/index.js';

// Contadores em memória (resetam no restart, mas Mongo persiste)
const counters = {
  requests_total: 0,
  requests_with_ai: 0,
  requests_without_ai: 0,
  tokens_saved_estimated: 0,
  cache_hits: 0,
  cache_misses: 0,
  human_handoffs: 0,
};

// Estimativa de tokens poupados por resposta local (vs catálogo completo)
const EST_TOKENS_PER_CATALOG_REQUEST = 1200; // tokens médios enviados hoje
const EST_TOKENS_LOCAL_RESPONSE = 50;        // tokens de uma resposta local (zero Groq)

export function trackLocalResponse(organizationId, source) {
  counters.requests_total++;
  counters.requests_without_ai++;
  counters.tokens_saved_estimated += EST_TOKENS_PER_CATALOG_REQUEST - EST_TOKENS_LOCAL_RESPONSE;

  // Persist assíncrono — não bloqueia a resposta
  Metric.create({
    organizationId,
    name: 'bot.response.local',
    dimensions: { source },
    value: 1,
  }).catch(() => {});
}

export function trackAIResponse(organizationId, intent, tokensUsed = 0) {
  counters.requests_total++;
  counters.requests_with_ai++;

  Metric.create({
    organizationId,
    name: 'bot.response.ai',
    dimensions: { intent, tokensUsed },
    value: 1,
  }).catch(() => {});
}

export function trackCacheHit(organizationId) {
  counters.cache_hits++;
}

export function trackCacheMiss(organizationId) {
  counters.cache_misses++;
}

export function trackHumanHandoff(organizationId, reason) {
  counters.human_handoffs++;
  Metric.create({
    organizationId,
    name: 'bot.human_handoff',
    dimensions: { reason },
    value: 1,
  }).catch(() => {});
}

export function getMetricsSummary() {
  const total = counters.requests_total || 1;
  const aiRatio = ((counters.requests_with_ai / total) * 100).toFixed(1);
  const localRatio = ((counters.requests_without_ai / total) * 100).toFixed(1);

  return {
    ...counters,
    ai_usage_pct: `${aiRatio}%`,
    local_resolution_pct: `${localRatio}%`,
    tokens_saved_formatted: counters.tokens_saved_estimated.toLocaleString('pt-BR'),
  };
}
