import { useCallback, useEffect, useState } from 'react';

export interface DeactivatedFacility {
  uniqueId: string;
  reason: string | null;
  deactivatedAt: string;
  deactivatedBy: string | null;
}

export function useDeactivatedFacilities() {
  const [records, setRecords] = useState<DeactivatedFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/lakebase/deactivated-facilities');
      if (!response.ok) {
        throw new Error(`Failed to load deactivations (${response.status})`);
      }
      const data = (await response.json()) as DeactivatedFacility[];
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deactivations');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deactivatedIds = new Set(records.map((record) => record.uniqueId));

  const getDeactivation = useCallback(
    (uniqueId: string) => records.find((record) => record.uniqueId === uniqueId) ?? null,
    [records],
  );

  return {
    records,
    deactivatedIds,
    getDeactivation,
    loading,
    error,
    refresh,
  };
}
