// Formata um valor monetário no padrão pt-BR, na moeda vinda do backend (a
// mesma moeda configurada na Billing Account — hoje sempre BRL).
export function formatCurrency(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value ?? 0);
}

// Texto de um Alerta de Custo (Alerta de Aumento do SKU ou Novo SKU no
// Billing — ver CONTEXT.md e ADR 0012), reaproveitado no banner do topo da
// página de Custos e no tooltip do badge inline de cada card.
export function formatAlertMessage(alert) {
  const money = (v) => formatCurrency(v, alert.currency);
  if (alert.tipo === 'novo_sku') {
    return `Novo SKU no Billing: "${alert.sku}" (${alert.service}), projeto ${alert.projectId} — ${money(alert.cost)}`;
  }
  return `"${alert.sku}" (${alert.service}), projeto ${alert.projectId}: ${money(alert.cost)}, `
    + `+${money(alert.deltaAbsolute)} (+${Math.round(alert.deltaPercent)}%) vs. média dos últimos 7 dias (${money(alert.baseline)})`;
}
