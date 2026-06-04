import { BotConfig, Prompt } from '../../models/index.js';
import { getCatalogContext } from '../catalog/catalog.service.js';
import { runGroqChat } from '../ai/groq.service.js';

const DEFAULT_PROMPT = `Você é um atendente comercial e consultivo do Agora Bot 2.
Responda com clareza, educação e objetividade.
Use APENAS informações do catálogo/contexto informado para preços, serviços, planos e condições comerciais.
Se o valor não estiver no catálogo, diga que precisa confirmar com o atendimento humano.
Nunca invente preço, prazo, desconto ou condição.
Se o cliente pedir humano, recomende atendimento humano.`;

export async function getBotConfig(organizationId, whatsappAccountId) {
  return BotConfig.findOne({ organizationId, whatsappAccountId }).lean();
}

export function shouldSendToHuman(text, config) {
  const normalized = String(text || '').toLowerCase();
  return (config?.humanHandoffKeywords || []).some((keyword) => normalized.includes(String(keyword).toLowerCase()));
}

export async function generateBotAnswer({ organizationId, whatsappAccountId, conversation, latestText }) {
  const config = await getBotConfig(organizationId, whatsappAccountId);
  if (config && config.aiEnabled === false) return null;

  let prompt = DEFAULT_PROMPT;
  if (config?.promptId) {
    const configuredPrompt = await Prompt.findOne({ _id: config.promptId, organizationId, active: true }).lean();
    if (configuredPrompt?.content) prompt = configuredPrompt.content;
  } else {
    const activePrompt = await Prompt.findOne({ organizationId, type: 'bot', active: true }).sort({ updatedAt: -1 }).lean();
    if (activePrompt?.content) prompt = activePrompt.content;
  }

  const catalog = config?.catalogEnabled === false ? '' : await getCatalogContext(organizationId);
  const system = `${prompt}\n\nCATÁLOGO E BASE DE CONHECIMENTO:\n${catalog || 'Nenhum item cadastrado.'}`;

  return runGroqChat([
    { role: 'system', content: system },
    { role: 'user', content: latestText },
  ], { maxTokens: 700, temperature: 0.2 });
}
