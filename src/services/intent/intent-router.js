/**
 * Intent Router — Agora Bot 2
 * Classificador local baseado em regex/keywords. SEM IA.
 * Roda ANTES de qualquer chamada ao Groq ou ao MongoDB.
 */

const RULES = [
  {
    intent: 'human',
    weight: 100, // alta prioridade — sempre respeitar
    patterns: [
      /\batendimento humano\b/i,
      /\bquero falar com (algu[eé]m|um humano|uma pessoa|o atendente|voc[eê]s)\b/i,
      /\bme coloca (pra|para) falar/i,
      /\bfalar com (atendente|suporte|respons[aá]vel)\b/i,
      /\btransfer[eê]/?r?\b/i,
    ],
  },
  {
    intent: 'cancel',
    weight: 90,
    patterns: [
      /\bcancelar?\b/i,
      /\bcancelamento\b/i,
      /\bquero cancelar\b/i,
      /\bdesistir\b/i,
    ],
  },
  {
    intent: 'price',
    weight: 80,
    patterns: [
      /\bpre[çc]o\b/i,
      /\bvalor\b/i,
      /\bquanto (custa|[eé]|fica|cobram?)\b/i,
      /\bcusto\b/i,
      /\bor[çc]amento\b/i,
      /\btabela de pre[çc]os?\b/i,
      /\bpaga[-\s]?se\b/i,
    ],
  },
  {
    intent: 'plans',
    weight: 75,
    patterns: [
      /\bplanos?\b/i,
      /\bplano (essencial|b[aá]sico|pro|premium|business|enterprise)\b/i,
      /\bpacotes?\b/i,
      /\basssinatura\b/i,
      /\bmensal\b/i,
    ],
  },
  {
    intent: 'services',
    weight: 70,
    patterns: [
      /\bservi[çc]os?\b/i,
      /\bo que voc[eê]s (fazem?|oferecem?|disponibilizam?)\b/i,
      /\bsuas (solu[çc][õo]es?|ofertas?)\b/i,
      /\bno que voc[eê]s trabalham?\b/i,
    ],
  },
  {
    intent: 'products',
    weight: 70,
    patterns: [
      /\bprodutos?\b/i,
      /\bitem\b/i,
      /\bcatálogo\b/i,
      /\bo que voc[eê]s vendem?\b/i,
    ],
  },
  {
    intent: 'business_hours',
    weight: 65,
    patterns: [
      /\bhor[aá]rio\b/i,
      /\bfuncionamento\b/i,
      /\baberto\b/i,
      /\bfechado\b/i,
      /\bque horas\b/i,
      /\bat[eé] quando\b/i,
    ],
  },
  {
    intent: 'address',
    weight: 65,
    patterns: [
      /\bende?re[çc]o\b/i,
      /\blocaliza[çc][aã]o\b/i,
      /\bondem? fica\b/i,
      /\bcomo chegar\b/i,
      /\bbairro\b/i,
      /\bcidade\b/i,
    ],
  },
  {
    intent: 'finance',
    weight: 80,
    patterns: [
      /\bsegunda via\b/i,
      /\bboleto\b/i,
      /\bfatura\b/i,
      /\bnf[e-]?\b/i,
      /\bnota fiscal\b/i,
      /\bpagamento\b/i,
      /\bpagar\b/i,
      /\bvencimento\b/i,
      /\bdívida\b/i,
      /\bdebito\b/i,
    ],
  },
  {
    intent: 'sales',
    weight: 85,
    patterns: [
      /\bcontratar?\b/i,
      /\bquero (comprar|adquirir|assinar|contratar)\b/i,
      /\bfechar (negócio|contrato|compra)\b/i,
      /\bme interessa\b/i,
      /\bvou (levar|ficar)\b/i,
      /\bcomo (fa[çc]o para comprar|adquirir|assinar)\b/i,
    ],
  },
  {
    intent: 'objection',
    weight: 60,
    patterns: [
      /\bmuito caro\b/i,
      /\bnão tenho (dinheiro|grana|budget)\b/i,
      /\btá caro\b/i,
      /\bconseguem? dar desconto\b/i,
      /\btem desconto\b/i,
      /\bpode (baixar|reduzir)\b/i,
      /\bnão vejo valor\b/i,
    ],
  },
  {
    intent: 'support',
    weight: 70,
    patterns: [
      /\bsuporte\b/i,
      /\bajuda\b/i,
      /\bproblema\b/i,
      /\bnão (est[aá] funcionando|consigo)\b/i,
      /\bnão funciona\b/i,
      /\berro\b/i,
      /\bbug\b/i,
    ],
  },
  {
    intent: 'greeting',
    weight: 10,
    patterns: [
      /^(oi|ol[aá]|boa[s]? (tarde|manha|noite|dia)|e a[ií]|bom dia|boa tarde|boa noite)[!?.]?$/i,
      /^(hey|hi|hello)[!?.]?$/i,
    ],
  },
];

/**
 * Classifica a intenção de uma mensagem.
 * @param {string} text
 * @returns {{ intent: string, confidence: number, matched: string[] }}
 */
export function classifyIntent(text) {
  if (!text || typeof text !== 'string') {
    return { intent: 'unknown', confidence: 0, matched: [] };
  }

  const normalized = text.trim().toLowerCase();
  let best = { intent: 'unknown', confidence: 0, matched: [] };

  for (const rule of RULES) {
    const matchedPatterns = rule.patterns.filter((p) => p.test(normalized));
    if (matchedPatterns.length === 0) continue;

    // Score = peso base + bônus por cada pattern adicional
    const score = rule.weight + (matchedPatterns.length - 1) * 10;

    if (score > best.confidence) {
      best = {
        intent: rule.intent,
        confidence: score,
        matched: matchedPatterns.map((p) => p.toString()),
      };
    }
  }

  return best;
}

/**
 * Retorna true se o intent deve ser resolvido localmente (sem IA)
 */
export function isLocalIntent(intent) {
  return ['price', 'plans', 'services', 'products', 'business_hours', 'address', 'finance', 'greeting', 'support'].includes(intent);
}

/**
 * Retorna true se o intent requer IA
 */
export function requiresAI(intent) {
  return ['sales', 'objection', 'negotiation', 'recommendation', 'unknown'].includes(intent);
}
