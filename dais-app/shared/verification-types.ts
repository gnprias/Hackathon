export type WebsiteRelevanceVerdict =
  | 'likely_match'
  | 'weak_match'
  | 'likely_mismatch'
  | 'unknown'
  | 'unreachable'
  | 'skipped';

export type LocationVerdict =
  | 'likely_match'
  | 'weak_match'
  | 'likely_mismatch'
  | 'unknown'
  | 'not_found'
  | 'skipped';

export interface FacilityVerificationResult {
  checkedAt: string;
  website: {
    verdict: WebsiteRelevanceVerdict;
    score: number;
    nameScore: number;
    locationScore: number;
    pageTitle: string | null;
    finalUrl: string | null;
    suspiciousDomain: boolean;
    suspiciousReason: string | null;
    summary: string;
  };
  location: {
    verdict: LocationVerdict;
    score: number;
    nameScore: number;
    distanceKm: number | null;
    reversePlace: { displayName: string; lat: number; lon: number } | null;
    forwardPlace: { displayName: string; lat: number; lon: number } | null;
    summary: string;
  };
  providers: {
    geocoding: 'google' | 'nominatim' | 'none';
  };
}

export interface FacilityVerificationRequest {
  name?: string | null;
  official_website?: string | null;
  website_working_url?: string | null;
  address_city?: string | null;
  address_state_or_region?: string | null;
  address_country?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}
