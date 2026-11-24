import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { lookupDiretorias } from '../api/diretoria';

// Diretorias (extensionAttribute4 do AD, ver docs/adr/0014-diretoria-lida-do-entra-id.md)
// dos usuários da tela Gemini Enterprise, buscadas DEPOIS da lista de
// licenças — a tabela nunca espera o Graph.
//
// - Só busca de novo quando o conjunto de e-mails muda: o polling de
//   useGeminiData entrega um array novo a cada tick, mas com os mesmos e-mails.
// - Se a última tentativa falhou ou voltou incompleta (Graph fora do ar, 429
//   em parte do lote), tenta de novo quando `refreshToken` muda — o
//   lastUpdated do Gemini, que avança a cada tick do polling ou "Atualizar".
// - Falha não vira notificação: a coluna só mostra "—" (diretorias = null).
export function useDiretoriaData(users, { enabled = true, refreshToken } = {}) {
  const [diretorias, setDiretorias] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const incompleteRef = useRef(false);

  const emailsKey = useMemo(() => [...new Set(
    users.map((u) => (u.userPrincipal || '').trim().toLowerCase()).filter(Boolean),
  )].sort().join(','), [users]);

  useEffect(() => {
    if (incompleteRef.current) setRetryCount((n) => n + 1);
  }, [refreshToken]);

  useEffect(() => {
    if (!enabled || !emailsKey) return undefined;
    let cancelled = false;
    const emails = emailsKey.split(',');
    setLoading(true);
    lookupDiretorias(emails)
      .then((result) => {
        if (cancelled) return;
        incompleteRef.current = emails.some((e) => !Object.prototype.hasOwnProperty.call(result, e));
        setDiretorias(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Falha ao buscar Diretorias no AD:', err?.message);
        incompleteRef.current = true;
        setDiretorias(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled, emailsKey, retryCount]);

  return { diretorias, loading };
}
