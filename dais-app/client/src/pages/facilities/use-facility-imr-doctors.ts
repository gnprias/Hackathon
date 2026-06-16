import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FacilityImrDoctorRecord } from '../../../../shared/imr-doctor-record';
import { computeImrDoctorTrustCounts } from '../../../../shared/imr-specialty-match';

export function useFacilityImrDoctors(uniqueId: string | null, facilitySpecialties: unknown = null) {
  const [records, setRecords] = useState<FacilityImrDoctorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uniqueId) {
      setRecords([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/lakebase/facilities/${encodeURIComponent(uniqueId)}/imr-doctors`,
      );
      if (!response.ok) {
        throw new Error(`Failed to load saved doctors (${response.status})`);
      }
      const data = (await response.json()) as FacilityImrDoctorRecord[];
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved doctors');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [uniqueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const trustCounts = useMemo(
    () => computeImrDoctorTrustCounts(records, facilitySpecialties),
    [records, facilitySpecialties],
  );

  const saveDoctor = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!uniqueId) {
        throw new Error('Facility id is required');
      }

      const response = await fetch(
        `/api/lakebase/facilities/${encodeURIComponent(uniqueId)}/imr-doctors`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as FacilityImrDoctorRecord & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to save doctor');
      }
      await refresh();
      return body;
    },
    [uniqueId, refresh],
  );

  const removeDoctor = useCallback(
    async (id: number) => {
      if (!uniqueId) {
        throw new Error('Facility id is required');
      }

      const response = await fetch(
        `/api/lakebase/facilities/${encodeURIComponent(uniqueId)}/imr-doctors/${id}`,
        { method: 'DELETE' },
      );
      if (!response.ok && response.status !== 204) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to remove doctor');
      }
      await refresh();
    },
    [uniqueId, refresh],
  );

  return {
    records,
    loading,
    error,
    refresh,
    saveDoctor,
    removeDoctor,
    trustCounts,
  };
}
