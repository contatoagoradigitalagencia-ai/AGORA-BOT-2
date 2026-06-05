/**
 * FAQ Service — Agora Bot 2
 * Responde perguntas simples localmente. SEM IA.
 * Usa a coleção `faq` + fallback para knowledge_base.
 */

import mongoose from 'mongoose';
import { getKnowledgeBase } from '../catalog/catalog.service.js';
import { cacheGetWithStats, cacheSet } from '../cache/cache.service.js';

// ──────────────────────────────────────────────
// Model FAQ (criado inline para não exigir novo arquivo de model)
// ──────────────────────────────────────────────
let Faq;
try {
  Faq = mongoose.model('Faq');
} catch {
  const schema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    question: { type: String, required: true },
    keywords: [String],
    answer: { type: String, required: true },
    active: { type: Boolean, default: true },
  }, { timestamps: true });
  Faq = mongoose.model('Faq', schema);
}

export { Faq };

async function getFaqs(organizationId) {
  const cached = cacheGetWithStats('faq', organizationId);
  if (cached) return cached;

  const data = await Faq.find({ organizationId, active: true }).lean();
  cacheSet('faq', organizationId, data);
  return data;
}

/**
 * Tenta responder localmente a partir do FAQ.
 * @returns {string|null} resposta ou null se não encontrou
 */
export async function findFaqAnswer(organizationId, text) {
  const normalized = text.toLowerCase().trim();

  // 1. Tenta coleção faq customizada
  const faqs = await getFaqs(organizationId);
  for (const faq of faqs) {
    const allKeywords = [
      ...(faq.keywords || []),
      faq.question,
    ].map((k) => k.toLowerCase());

    const match = allKeywords.some((kw) => normalized.includes(kw) || kw.includes(normalized));
    if (match) return faq.answer;
  }

  // 2. Fallback: knowledge_base (busca por título/tags)
  const kb = await getKnowledgeBase(organizationId);
  for (const item of kb) {
    const searchable = [
      item.title,
      ...(item.tags || []),
    ].map((s) => s.toLowerCase());

    const match = searchable.some((s) => normalized.includes(s) || s.includes(normalized));
    if (match) return item.content;
  }

  return null;
}

// ──────────────────────────────────────────────
// Respostas padrão por intent (fallback local)
// ──────────────────────────────────────────────
export function getDefaultFaqResponse(intent) {
  const defaults = {
    greeting: 'Olá! Seja bem-vindo. Como posso te ajudar hoje? 😊',
    business_hours: 'Nosso horário de atendimento é de segunda a sexta, das 9h às 18h.',
    address: 'Para saber o endereço completo, entre em contato com nossa equipe.',
    support: 'Entendido! Vou acionar nosso suporte. Um momento, por favor.',
    cancel: 'Entendo. Para cancelamentos, precisamos falar com um atendente. Posso te transferir agora?',
    finance: 'Para questões financeiras como boletos e notas fiscais, vou te conectar com nosso financeiro.',
  };
  return defaults[intent] || null;
}
