import { Product, Service, Plan, KnowledgeBase } from '../../models/index.js';

function formatPrice(item) {
  if (typeof item.price !== 'number') return 'preço sob consulta';
  return `${item.currency || 'BRL'} ${item.price.toFixed(2)}`;
}

function formatCatalogLine(kind, item) {
  return `${kind}: ${item.name} | ${formatPrice(item)} | ${item.description || 'sem descrição'}${item.conditions ? ` | Condições: ${item.conditions}` : ''}`;
}

export async function getCatalogContext(organizationId) {
  const [products, services, plans, knowledge] = await Promise.all([
    Product.find({ organizationId, active: true }).sort({ name: 1 }).limit(60).lean(),
    Service.find({ organizationId, active: true }).sort({ name: 1 }).limit(60).lean(),
    Plan.find({ organizationId, active: true }).sort({ name: 1 }).limit(60).lean(),
    KnowledgeBase.find({ organizationId, active: true }).sort({ updatedAt: -1 }).limit(20).lean(),
  ]);

  return [
    ...products.map((item) => formatCatalogLine('Produto', item)),
    ...services.map((item) => formatCatalogLine('Serviço', item)),
    ...plans.map((item) => `${formatCatalogLine('Plano', item)} | Recursos: ${(item.features || []).join(', ') || 'não informado'}`),
    ...knowledge.map((item) => `Conhecimento: ${item.title} | ${item.content}`),
  ].join('\n');
}
