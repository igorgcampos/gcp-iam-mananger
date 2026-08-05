import { useState } from 'react';
import { listIAMUsers } from '../api/iam';
import { notifyFetchError } from '../utils/apiError';
import { BACKGROUND_POLL_INTERVAL_MS } from '../config';
import { usePollingFetch } from './usePollingFetch';

// Fonte única dos usuários IAM, buscada uma vez em App.jsx e compartilhada
// entre IAMPage e DashboardPage — evita buscar os mesmos dados duas vezes
// só porque duas telas precisam deles.
export function useIamData({ enabled = true } = {}) {
  const [users, setUsers] = useState([]);

  const { loading, lastUpdated, reload } = usePollingFetch(
    async () => { setUsers(await listIAMUsers()); },
    { onError: notifyFetchError, interval: BACKGROUND_POLL_INTERVAL_MS, enabled }
  );

  return {
    users, loading, lastUpdated, reload,
  };
}
