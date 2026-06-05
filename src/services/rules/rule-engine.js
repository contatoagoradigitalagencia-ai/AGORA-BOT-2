/**
 * Rule Engine — Agora Bot 2
 * Executa regras locais baseadas em intent + dados do MongoDB.
 * Retorna resposta pronta ou null (delega para IA).
 */

import {
  getProducts, getServices, getPlans, getPlanByName,
  formatProductsText, formatServicesText, formatPlansText,
} from '../catalog/catalog.service.js';
import { findFaqAnswer, getDefaultFaqResponse } from './faq.service.js';

/**
 * Tenta resolver a mensagem localmente.
 * @param {{ organizationId, intent, text, contact }} ctx
 * @returns {Promise<{ resolved: boolean, answer: string|null, source: string }>}
 */
export async function resolveByRules(ctx) {
  const { organizationId, intent, text } = ctx;

  // 1. Greeting
  if (intent === 'greeting') {
    return resolved('Olá! 👋 Bem-vindo. Como posso te ajudar hoje?', 'rule:greeting');
  }

  // 2. Human handoff
  if (intent === 'human') {
    return resolved(null, 'rule:human_handoff'); // retorna null para trigger handoff
  }

  // 3. Produtos
  if (intent === 'products') {
    const products = await getProducts(organizationId);
    return resolved(formatProductsText(products), 'rule:products');
  }

  // 4. Serviços
  if (intent === 'services') {
    const services = await getServices(organizationId);
    return resolved(formatServicesText(services), 'rule:services');
  }

  // 5. Planos
  if (intent === 'plans') {
    const plans = await getPlans(organizationId);
    return resolved(formatPlansText(plans), 'rule:plans');
  }

  // 6. Preço — tenta extrair plano/produto do texto
  if (intent === 'price') {
    const planMatch = await getPlanByName(organizationId, text);
    if (planMatch) {
      const price = typeof planMatch.price === 'number' ? `R$ ${planMatch.price.toFixed(2)}` : 'sob consulta';
      return resolved(`O plano *${planMatch.name}* custa ${price}/mês.\n${planMatch.description || ''}`, 'rule:price:plan');
    }
    // Não encontrou plano específico: mostra todos
    const plans = await getPlans(organizationId);
    return resolved(formatPlansText(plans), 'rule:price:all_plans');
  }

  // 7. FAQ / horário / endereço / financeiro / suporte / cancelamento
  if (['business_hours', 'address', 'finance', 'support', 'cancel'].includes(intent)) {
    const faqAnswer = await findFaqAnswer(organizationId, text);
    if (faqAnswer) return resolved(faqAnswer, 'rule:faq:custom');

    const defaultAnswer = getDefaultFaqResponse(intent);
    if (defaultAnswer) return resolved(defaultAnswer, 'rule:faq:default');
  }

  // Tentativa genérica de FAQ antes de delegar para IA
  const faqAnswer = await findFaqAnswer(organizationId, text);
  if (faqAnswer) return resolved(faqAnswer, 'rule:faq:fallback');

  // Não resolvido localmente — delega para IA
  return { resolved: false, answer: null, source: 'ai_required' };
}

function resolved(answer, source) {
  return { resolved: true, answer, source };
}
