import { useState } from 'react';
import { getAntigravityUsage } from '../api/antigravity';
import { ANTIGRAVITY_POLL_INTERVAL_MS } from '../config';
import { usePollingFetch } from './usePollingFetch';

// Último uso Antigravity (ver docs/adr/0015-uso-do-antigravity-via-sink-no-bigquery.md).
// Independe da lista de licenças — a junção por e-mail é feita na tela —, então
// tem polling próprio, alinhado ao cache de 1h do backend.
// Falha não vira notificação: a coluna só mostra "—" (antigravity = null).
export function useAntigravityData({ enabled = true } = {}) {
  const [antigravity, setAntigravity] = useState(null);

  usePollingFetch(
    async () => {
      setAntigravity(await getAntigravityUsage());
    },
    {
      onError: (err) => {
        console.warn('Falha ao buscar o uso do Antigravity:', err?.message);
        setAntigravity(null);
      },
      interval: ANTIGRAVITY_POLL_INTERVAL_MS,
      enabled,
    },
  );

  return { antigravity };
}
