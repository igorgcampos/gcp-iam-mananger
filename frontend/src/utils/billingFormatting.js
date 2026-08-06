// Formata um valor monetário no padrão pt-BR, na moeda vinda do backend (a
// mesma moeda configurada na Billing Account — hoje sempre BRL).
export function formatCurrency(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value ?? 0);
}
