import { useEffect, useMemo, useState } from 'react';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  hasReferenceLocation,
  type ReferenceLocationInput,
} from '../../../../shared/reference-location';
import {
  pickNearestAlternates,
  type NearestAlternateCandidate,
  type NearestAlternateForFacility,
} from '../../../../shared/nearest-alternate';
import { isFacilityMatchTier } from '../../../../shared/facility-match-tier';

interface GeocodedReference {
  lat: number;
  lon: number;
  displayName: string;
}

export function useNearestAlternates(args: {
  location: ReferenceLocationInput;
  specialtyCanonical: string;
  claimTerms: string[] | undefined;
  facilities:
    | ReadonlyArray<{ unique_id: string; match_tier: string | null | undefined }>
    | undefined;
  enabled: boolean;
}): {
  alternates: Record<string, NearestAlternateForFacility>;
  geocodeLoading: boolean;
  poolLoading: boolean;
  error: string | null;
  needsReferenceLocation: boolean;
  referenceLabel: string | null;
} {
  const { location, specialtyCanonical, claimTerms, facilities, enabled } = args;
  const hasClaimTerms = (claimTerms?.length ?? 0) > 0;
  const hasPartialMatches =
    facilities?.some(
      (row) => row.match_tier === 'specialty_only' || row.match_tier === 'claims_only',
    ) ?? false;
  const referenceReady = hasReferenceLocation(location);
  const shouldRun = enabled && hasClaimTerms && hasPartialMatches;

  const [geocoded, setGeocoded] = useState<GeocodedReference | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldRun || !referenceReady) {
      setGeocoded(null);
      setGeocodeError(null);
      setGeocodeLoading(false);
      return;
    }

    let cancelled = false;
    setGeocodeLoading(true);
    setGeocodeError(null);
    setGeocoded(null);

    void fetch('/api/search/geocode-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          lat?: number;
          lon?: number;
          displayName?: string;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? 'Could not geocode your location');
        }
        if (payload.lat == null || payload.lon == null) {
          throw new Error('Could not geocode your location');
        }
        if (!cancelled) {
          setGeocoded({
            lat: payload.lat,
            lon: payload.lon,
            displayName: payload.displayName ?? '',
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setGeocodeError(err instanceof Error ? err.message : 'Could not geocode your location');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGeocodeLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    shouldRun,
    referenceReady,
    location.referenceAddress,
    location.city,
    location.state,
    location.zip,
    location.countryCode,
  ]);

  const { data: pool, loading: poolLoading, error: poolError } = useAnalyticsQuery(
    'nearest_facility_alternates',
    {
      ref_lat: sql.number(geocoded?.lat ?? 0),
      ref_lon: sql.number(geocoded?.lon ?? 0),
      specialty_canonical: sql.string(specialtyCanonical),
      claim_search: sql.string(claimTerms?.[0] ?? ''),
      claim_search_2: sql.string(claimTerms?.[1] ?? ''),
    },
    { autoStart: shouldRun && referenceReady && geocoded != null },
  );

  const alternates = useMemo(() => {
    if (!facilities || !pool) return {};
    const candidates = pool.map((row) => ({
      match_type: row.match_type,
      unique_id: row.unique_id,
      name: row.name,
      address_city: row.address_city,
      address_state_or_region: row.address_state_or_region,
      distance_km: Number(row.distance_km),
    })) as NearestAlternateCandidate[];
    return pickNearestAlternates(facilities.filter((row) => isFacilityMatchTier(row.match_tier)), candidates);
  }, [facilities, pool]);

  return {
    alternates,
    geocodeLoading,
    poolLoading,
    error: geocodeError ?? poolError,
    needsReferenceLocation: shouldRun && !referenceReady,
    referenceLabel: geocoded?.displayName || null,
  };
}
