import { useState, useEffect, useCallback } from 'react';
import { VaultAccountOverview } from '../types/contract';
import { nearRpc } from '../services/nearRpc';

export function useVaultData(pollIntervalMs: number = 15000) {
  const [data, setData] = useState<VaultAccountOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  const fetchOverview = useCallback(async () => {
    try {
      const overview = await nearRpc.fetchVaultOverview();
      setData(overview);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err: any) {
      console.error('Failed to fetch vault overview:', err);
      setError(err?.message || 'Error querying NEAR testnet RPC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchOverview, pollIntervalMs]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: fetchOverview,
  };
}

