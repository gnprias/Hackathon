import { useCallback, useEffect, useState } from 'react';
import type {
  FacilityVerificationRequest,
  FacilityVerificationResult,
} from '../../../../shared/verification-types';

export function useFacilityVerification(facility: FacilityVerificationRequest) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FacilityVerificationResult | null>(null);

  const refresh = useCallback(async () => {
    if (!facility.name) {
      setError('Facility name is required for verification.');
      setResult(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/verification/facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: facility.name,
          official_website: facility.official_website,
          website_working_url: facility.website_working_url,
          address_city: facility.address_city,
          address_state_or_region: facility.address_state_or_region,
          address_country: facility.address_country,
          latitude: facility.latitude,
          longitude: facility.longitude,
        }),
      });

      const payload = (await response.json()) as FacilityVerificationResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Verification failed');
      }

      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [
    facility.name,
    facility.official_website,
    facility.website_working_url,
    facility.address_city,
    facility.address_state_or_region,
    facility.address_country,
    facility.latitude,
    facility.longitude,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, result, refresh };
}
