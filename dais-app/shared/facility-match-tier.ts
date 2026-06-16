export type FacilityMatchTier = 'full' | 'specialty_only' | 'claims_only';

export const FACILITY_MATCH_TIER_LABELS: Record<FacilityMatchTier, string> = {
  full: 'Full match',
  specialty_only: 'Specialty only',
  claims_only: 'Claims only',
};

export function isFacilityMatchTier(value: string | null | undefined): value is FacilityMatchTier {
  return value === 'full' || value === 'specialty_only' || value === 'claims_only';
}

export function countMatchTiers(
  rows: ReadonlyArray<{ match_tier: string | null | undefined }>,
): Record<FacilityMatchTier, number> {
  const counts: Record<FacilityMatchTier, number> = {
    full: 0,
    specialty_only: 0,
    claims_only: 0,
  };
  for (const row of rows) {
    if (isFacilityMatchTier(row.match_tier)) {
      counts[row.match_tier] += 1;
    }
  }
  return counts;
}

export function formatMatchTierSummary(counts: Record<FacilityMatchTier, number>): string {
  const parts: string[] = [];
  if (counts.full > 0) parts.push(`${counts.full} full match`);
  if (counts.specialty_only > 0) parts.push(`${counts.specialty_only} specialty only`);
  if (counts.claims_only > 0) parts.push(`${counts.claims_only} claims only`);
  return parts.join(', ');
}
