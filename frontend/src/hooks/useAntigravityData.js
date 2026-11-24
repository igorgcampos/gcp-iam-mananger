import { useEffect, useRef, useState } from 'react';
import { getAntigravityUsage } from '../api/antigravity';
import { ANTIGRAVITY_POLL_INTERVAL_MS } from '../config';
import { usePollingFetch } from './usePollingFetch';

// Último uso Antigravity (ver docs/adr/0015-uso-do-antigravity-via-sink-no-bigquery.md).
// Independe da lista de licenças — a junção por e-mail é feita na tela —, então
// tem polling próprio, alinhado ao cache de 1h do backend.
// Falha não vira notificação: a coluna só mostra "—" (antigravity = null).
// Depois de uma falha, tenta de novo quando `refreshToken` muda (o
// lastUpdated do Gemini: polling de 3 min ou "Atualizar"), como a Diretoria —
// senão um erro no cold start deixaria a coluna em "—" por 1h.
export function useAntigravityData({ enabled = true, refreshToken } = {}) {
  const [antigravity, setAntigravity] = useState(null);
  const failedRef = useRef(false);

  const { reload } = usePollingFetch(
    async () => {
      setAntigravity(await getAntigravityUsage());
      failedRef.current = false;
    },
    {
      onError: (err) => {
        console.warn('Falha ao buscar o uso do Antigravity:', err?.message);
        failedRef.current = true;
        setAntigravity(null);
      },
      interval: ANTIGRAVITY_POLL_INTERVAL_MS,
      enabled,
    },
  );

  useEffect(() => {
    if (enabled && failedRef.current) reload(true);
  }, [refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return { antigravity };
}
