export type NearestAlternateMatchType = 'specialty' | 'claims';

export interface NearestAlternateCandidate {
  match_type: NearestAlternateMatchType;
  unique_id: string;
  name: string;
  address_city: string;
  address_state_or_region: string;
  distance_km: number;
}

export interface NearestAlternateForFacility {
  matchType: NearestAlternateMatchType;
  uniqueId: string;
  name: string;
  city: string;
  state: string;
  distanceKm: number;
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatNearestAlternateLabel(
  alternate: NearestAlternateForFacility,
  missingCriterionLabel: string,
): string {
  const place = [alternate.city, alternate.state].filter(Boolean).join(', ');
  const distance = formatDistanceKm(alternate.distanceKm);
  const locationSuffix = place ? ` — ${place}` : '';
  return `Nearest ${missingCriterionLabel}: ${alternate.name}${locationSuffix} (${distance})`;
}

export function pickNearestAlternates(
  facilities: ReadonlyArray<{ unique_id: string; match_tier: string | null | undefined }>,
  pool: ReadonlyArray<NearestAlternateCandidate>,
): Record<string, NearestAlternateForFacility> {
  const specialtyCandidates = pool
    .filter((row) => row.match_type === 'specialty')
    .sort((a, b) => a.distance_km - b.distance_km);
  const claimsCandidates = pool
    .filter((row) => row.match_type === 'claims')
    .sort((a, b) => a.distance_km - b.distance_km);

  const map: Record<string, NearestAlternateForFacility> = {};

  for (const facility of facilities) {
    if (facility.match_tier === 'specialty_only') {
      const alternate = claimsCandidates.find((row) => row.unique_id !== facility.unique_id);
      if (alternate) {
        map[facility.unique_id] = toAlternate(alternate);
      }
    } else if (facility.match_tier === 'claims_only') {
      const alternate = specialtyCandidates.find((row) => row.unique_id !== facility.unique_id);
      if (alternate) {
        map[facility.unique_id] = toAlternate(alternate);
      }
    }
  }

  return map;
}

function toAlternate(row: NearestAlternateCandidate): NearestAlternateForFacility {
  return {
    matchType: row.match_type,
    uniqueId: row.unique_id,
    name: row.name,
    city: row.address_city,
    state: row.address_state_or_region,
    distanceKm: row.distance_km,
  };
}
