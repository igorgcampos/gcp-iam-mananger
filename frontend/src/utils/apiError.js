import { message } from 'antd';

// Padrão repetido em toda busca/mutação de dados da API: mostra a mensagem de
// erro do backend quando existir, senão a mensagem genérica do axios/JS.
// `prefix` é opcional e serve pra identificar qual ação falhou quando a
// mesma tela dispara mais de uma operação que pode dar erro (ex.: conceder/
// revogar Code Assist dentro do IAMPage) — vira "<prefix>: <mensagem>".
export function notifyFetchError(err, prefix) {
  const detail = err.response?.data?.error || err.message;
  message.error(prefix ? `${prefix}: ${detail}` : detail);
}
