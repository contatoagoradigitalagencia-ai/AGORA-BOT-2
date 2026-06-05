/**
 * canSendFreeformMessage — regra central de janela de envio por provedor.
 * Z-API  → sempre permitido
 * Meta   → permitido só se lastInboundAt < 24h
 */
export async function canSendFreeformMessage({ provider, conversationId, Message }) {
  if (!provider || provider === 'zapi') {
    return { allowed: true, reason: 'zapi_no_24h_window' };
  }

  if (provider === 'meta') {
    const lastInbound = await Message.findOne({
      conversationId, direction: 'inbound',
    }).sort({ occurredAt: -1 }).select('occurredAt').lean();

    if (!lastInbound?.occurredAt) {
      return { allowed: false, reason: 'meta_24h_window_expired', requiresTemplate: true, lastInboundAt: null };
    }

    const diffHours = (Date.now() - new Date(lastInbound.occurredAt).getTime()) / (1000 * 60 * 60);

    if (diffHours <= 24) {
      return { allowed: true, reason: 'meta_24h_window_open', lastInboundAt: lastInbound.occurredAt };
    }

    return {
      allowed: false, reason: 'meta_24h_window_expired',
      requiresTemplate: true,
      lastInboundAt: lastInbound.occurredAt,
      diffHours: parseFloat(diffHours.toFixed(1)),
    };
  }

  return { allowed: true, reason: 'unknown_provider_allow' };
}
