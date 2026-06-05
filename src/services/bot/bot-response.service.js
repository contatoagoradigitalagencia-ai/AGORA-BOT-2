/**
 * Bot Response Service — Agora Bot 2 (Rearquitetado)
 * 
 * NOVO FLUXO:
 *   Mensagem → Intent Router → Rule Engine → Resposta Local
 *                                          ↘ (se necessário) IA Especialista
 * 
 * A IA só é chamada para: sales, objection, negotiation, recommendation, unknown
 * Redução estimada de 80-95% no consumo de tokens.
 */

import { BotConfig, Prompt } from '../../models/index.js';
import { runGroqChat } from '../ai/groq.service.js';
import { classifyIntent, isLocalIntent, requiresAI } from '../intent/intent-router.js';
import { resolveByRules } from '../rules/rule-engine.js';
import { buildMinimalAIContext } from '../catalog/catalog.service.js';
import { buildConversationHistory, buildGroqPayload } from '../context/context-builder.js';
import { getContactProfile, updateContactProfile, buildProfileSummary } from '../profile/contact-profile.service.js';
import { trackLocalResponse, trackAIResponse, trackHumanHandoff } from '../metrics/metrics.service.js';

const DEFAULT_PROMPT = `Você é um atendente comercial especialista em vendas e relacionamento.
Responda com clareza, empatia e objetividade.
Use APENAS as informações do catálogo fornecido para preços, serviços e condições.
Nunca invente preço, prazo, desconto ou condição.
Seja conciso — máximo 3 parágrafos por resposta.`;

export async function getBotConfig(organizationId, whatsappAccountId) {
  return BotConfig.findOne({ organizationId, whatsappAccountId }).lean();
}

export function shouldSendToHuman(text, config) {
  const normalized = String(text || '').toLowerCase();
  return (config?.humanHandoffKeywords || []).some(
    (keyword) => normalized.includes(String(keyword).toLowerCase())
  );
}

/**
 * Ponto de entrada principal.
 * Retorna { answer, intent, source, usedAI }
 */
export async function generateBotAnswer({
  organizationId,
  whatsappAccountId,
  conversation,
  contact,
  latestText,
}) {
  const config = await getBotConfig(organizationId, whatsappAccountId);
  if (config && config.aiEnabled === false) return null;

  // ── FASE 1: Classificar intenção (local, zero IA) ──
  const { intent, confidence } = classifyIntent(latestText);

  // Atualiza perfil do contato de forma assíncrona
  if (contact?._id) {
    updateContactProfile(organizationId, contact._id, intent).catch(() => {});
  }

  // ── FASE 2: Handoff para humano por keyword ou intent ──
  if (intent === 'human' || shouldSendToHuman(latestText, config)) {
    trackHumanHandoff(organizationId, intent === 'human' ? 'intent' : 'keyword');
    return { answer: null, intent, source: 'human_handoff', usedAI: false };
  }

  // ── FASE 3: Rule Engine — tenta resolver localmente ──
  if (isLocalIntent(intent)) {
    const ruleResult = await resolveByRules({ organizationId, intent, text: latestText, contact });
    if (ruleResult.resolved && ruleResult.answer) {
      trackLocalResponse(organizationId, ruleResult.source);
      return { answer: ruleResult.answer, intent, source: ruleResult.source, usedAI: false };
    }
  }

  // ── FASE 4: IA Especialista (apenas quando realmente necessário) ──
  if (!requiresAI(intent) && isLocalIntent(intent)) {
    // Tentou resolver localmente mas não encontrou dados — resposta genérica
    trackLocalResponse(organizationId, 'rule:no_data');
    return {
      answer: 'Não encontrei essa informação no momento. Posso te conectar com um de nossos atendentes?',
      intent,
      source: 'rule:no_data',
      usedAI: false,
    };
  }

  // Busca prompt configurado
  let systemPrompt = DEFAULT_PROMPT;
  if (config?.promptId) {
    const configuredPrompt = await Prompt.findOne({
      _id: config.promptId,
      organizationId,
      active: true,
    }).lean();
    if (configuredPrompt?.content) systemPrompt = configuredPrompt.content;
  } else {
    const activePrompt = await Prompt.findOne({ organizationId, type: 'bot', active: true })
      .sort({ updatedAt: -1 }).lean();
    if (activePrompt?.content) systemPrompt = activePrompt.content;
  }

  // Catálogo mínimo (nunca catálogo completo)
  const catalogContext = config?.catalogEnabled === false
    ? ''
    : await buildMinimalAIContext(organizationId);

  // Perfil resumido do contato
  let profileSummary = '';
  if (contact?._id) {
    const profile = await getContactProfile(organizationId, contact._id);
    profileSummary = buildProfileSummary(profile);
  }

  // Histórico limitado a últimos 10 eventos
  const history = await buildConversationHistory(conversation._id);

  // Monta payload compacto para Groq
  const messages = buildGroqPayload({
    systemPrompt,
    profileSummary,
    catalogContext,
    history,
    latestText,
  });

  const answer = await runGroqChat(messages, { maxTokens: 500, temperature: 0.25 });

  trackAIResponse(organizationId, intent);
  return { answer, intent, source: 'ai', usedAI: true };
}
