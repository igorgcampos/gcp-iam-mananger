import { useState } from 'react';
import { listGeminiUsers, listLicenseConfigs } from '../api/gemini';
import { notifyFetchError } from '../utils/apiError';
import { BACKGROUND_POLL_INTERVAL_MS } from '../config';
import { usePollingFetch } from './usePollingFetch';

// Fonte única dos usuários/licenças Gemini Enterprise, buscada uma vez em
// App.jsx e compartilhada entre GeminiPage e DashboardPage — evita buscar os
// mesmos dados duas vezes só porque duas telas precisam deles.
export function useGeminiData({ enabled = true } = {}) {
  const [users, setUsers] = useState([]);
  const [configs, setConfigs] = useState([]);

  const { loading, lastUpdated, reload } = usePollingFetch(
    async () => {
      const [u, c] = await Promise.all([listGeminiUsers(), listLicenseConfigs()]);
      setUsers(u);
      setConfigs(c);
    },
    { onError: notifyFetchError, interval: BACKGROUND_POLL_INTERVAL_MS, enabled }
  );

  return {
    users, configs, loading, lastUpdated, reload,
  };
}
