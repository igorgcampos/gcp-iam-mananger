// Intervalo de atualização automática em segundo plano para os dados do GCP
// (IAM e Gemini Enterprise). Cada tick é uma chamada real às APIs do Google —
// mantemos um intervalo folgado para não gerar custo/latência desnecessários
// num painel interno de baixo tráfego. Ajustável sem tocar nos hooks.
export const BACKGROUND_POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos
