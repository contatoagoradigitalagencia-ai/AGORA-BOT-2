/**
 * Context Builder — Agora Bot 2
 * Monta o contexto mínimo necessário para envio à IA.
 * Limite: últimos 10 eventos. Nunca histórico completo.
 */

import { Message } from '../../models/index.js';

const MAX_MESSAGES = 10;

/**
 * Busca os últimos N eventos da conversa e os converte
 * em array de mensagens no formato {role, content}.
 */
export async function buildConversationHistory(conversationId) {
  const messages = await Message.find({ conversationId })
    .sort({ occurredAt: -1 })
    .limit(MAX_MESSAGES)
    .select('direction text occurredAt aiGenerated')
    .lean();

  // Reverter para ordem cronológica
  messages.reverse();

  return messages
    .filter((m) => m.text && m.text.trim())
    .map((m) => ({
      role: m.direction === 'outbound' ? 'assistant' : 'user',
      content: m.text.trim(),
    }));
}

/**
 * Monta o payload completo para Groq.
 * System prompt compacto + perfil + catálogo mínimo + histórico limitado.
 */
export function buildGroqPayload({ systemPrompt, profileSummary, catalogContext, history, latestText }) {
  const systemContent = [
    systemPrompt,
    profileSummary ? `\nPERFIL DO CLIENTE:\n${profileSummary}` : '',
    catalogContext ? `\nCATÁLOGO (resumo):\n${catalogContext}` : '',
    '\nRegra: Nunca invente preços, prazos ou condições. Se não souber, diga que precisa confirmar.',
  ].filter(Boolean).join('');

  const messages = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: latestText },
  ];

  return messages;
}
