// Intervalo de atualização automática em segundo plano para os dados do GCP
// (IAM e Gemini Enterprise). Cada tick é uma chamada real às APIs do Google —
// mantemos um intervalo folgado para não gerar custo/latência desnecessários
// num painel interno de baixo tráfego. Ajustável sem tocar nos hooks.
export const BACKGROUND_POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos

// Intervalo de atualização automática dos dados de Custos — bem mais longo
// que o dos outros hooks porque o BigQuery Billing Export só é atualizado
// 1x/dia pelo próprio GCP (ver docs/adr/0006-billing-export-como-fonte-de-custos.md);
// ficar checando de poucos em poucos minutos geraria consultas sem nenhum
// dado novo pra mostrar.
export const BILLING_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 horas
