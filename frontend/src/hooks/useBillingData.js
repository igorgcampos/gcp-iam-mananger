import { useState } from 'react';
import { getBillingSummary } from '../api/billing';
import { notifyFetchError } from '../utils/apiError';
import { BILLING_POLL_INTERVAL_MS } from '../config';
import { usePollingFetch } from './usePollingFetch';

export function useBillingData({ enabled = true } = {}) {
  const [summary, setSummary] = useState(null);

  const { loading, lastUpdated, reload } = usePollingFetch(
    async () => {
      setSummary(await getBillingSummary());
    },
    { onError: notifyFetchError, interval: BILLING_POLL_INTERVAL_MS, enabled }
  );

  return {
    summary, loading, lastUpdated, reload,
  };
}
