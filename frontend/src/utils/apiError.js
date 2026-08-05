import { message } from 'antd';

// Padrão repetido em toda busca de dados da API: mostra a mensagem de erro
// do backend quando existir, senão a mensagem genérica do axios/JS.
export function notifyFetchError(err) {
  message.error(err.response?.data?.error || err.message);
}
