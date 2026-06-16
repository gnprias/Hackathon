import { haversineKm, nameMatchScore, verdictFromScore, type MatchVerdict } from './name-match';

/** Listing coordinates within this distance of a geocoded result count as a likely match. */
export const CLOSE_LOCATION_DISTANCE_KM = 1;

export interface GeocodedPlace {
  displayName: string;
  lat: number;
  lon: number;
  source: 'reverse' | 'forward' | 'google';
}

export interface LocationVerificationInput {
  facilityName: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reverseGeocode?: GeocodedPlace | null;
  forwardGeocode?: GeocodedPlace | null;
  geocodeError?: string | null;
}

export interface LocationVerificationResult {
  verdict: MatchVerdict | 'not_found' | 'skipped';
  score: number;
  nameScore: number;
  distanceKm: number | null;
  reversePlace: GeocodedPlace | null;
  forwardPlace: GeocodedPlace | null;
  summary: string;
}

export function assessLocationVerification(input: LocationVerificationInput): LocationVerificationResult {
  if (input.geocodeError) {
    return {
      verdict: 'not_found',
      score: 0,
      nameScore: 0,
      distanceKm: null,
      reversePlace: null,
      forwardPlace: null,
      summary: input.geocodeError,
    };
  }

  const reversePlace = input.reverseGeocode ?? null;
  const forwardPlace = input.forwardGeocode ?? null;

  if (!reversePlace && !forwardPlace) {
    const hasCoords = input.latitude != null && input.longitude != null;
    return {
      verdict: 'skipped',
      score: 0,
      nameScore: 0,
      distanceKm: null,
      reversePlace: null,
      forwardPlace: null,
      summary: hasCoords
        ? 'Could not resolve coordinates to a named place.'
        : 'No coordinates on record for map cross-check.',
    };
  }

  const reverseNameScore = reversePlace
    ? nameMatchScore(input.facilityName, reversePlace.displayName)
    : 0;
  const forwardNameScore = forwardPlace
    ? nameMatchScore(input.facilityName, forwardPlace.displayName)
    : 0;
  const nameScore = Math.max(reverseNameScore, forwardNameScore);

  let distanceKm: number | null = null;
  if (input.latitude != null && input.longitude != null) {
    const distances: number[] = [];
    if (forwardPlace != null) {
      distances.push(
        haversineKm(input.latitude, input.longitude, forwardPlace.lat, forwardPlace.lon),
      );
    }
    if (reversePlace != null) {
      distances.push(
        haversineKm(input.latitude, input.longitude, reversePlace.lat, reversePlace.lon),
      );
    }
    if (forwardPlace != null && reversePlace != null) {
      distances.push(
        haversineKm(reversePlace.lat, reversePlace.lon, forwardPlace.lat, forwardPlace.lon),
      );
    }
    if (distances.length > 0) {
      distanceKm = Math.min(...distances);
    }
  }

  let score = nameScore;
  if (distanceKm != null) {
    if (distanceKm <= CLOSE_LOCATION_DISTANCE_KM) {
      score = Math.min(1, Math.max(score, 0.55));
    } else if (distanceKm <= 2) {
      score = Math.min(1, score + 0.15);
    } else if (distanceKm <= 10) {
      score = Math.min(1, score + 0.05);
    } else if (distanceKm > 25) {
      score = Math.max(0, score - 0.25);
    }
  }

  let verdict = verdictFromScore(score);
  if (distanceKm != null && distanceKm <= CLOSE_LOCATION_DISTANCE_KM) {
    verdict = 'likely_match';
  } else if (distanceKm != null && distanceKm > 25 && nameScore < 0.35) {
    verdict = 'likely_mismatch';
  }

  return {
    verdict,
    score,
    nameScore,
    distanceKm,
    reversePlace,
    forwardPlace,
    summary: buildLocationSummary({
      verdict,
      nameScore,
      distanceKm,
      reversePlace,
      forwardPlace,
    }),
  };
}

function buildLocationSummary(args: {
  verdict: MatchVerdict;
  nameScore: number;
  distanceKm: number | null;
  reversePlace: GeocodedPlace | null;
  forwardPlace: GeocodedPlace | null;
}): string {
  const namePct = Math.round(args.nameScore * 100);
  const parts: string[] = [];

  if (args.verdict === 'likely_match') {
    parts.push(
      args.distanceKm != null && args.distanceKm <= CLOSE_LOCATION_DISTANCE_KM
        ? `Geocoded location is within ${CLOSE_LOCATION_DISTANCE_KM} km of the listing coordinates.`
        : `Map/geocoding results align with this facility name (${namePct}% match).`,
    );
  } else if (args.verdict === 'weak_match') {
    parts.push(`Map results partially match the facility name (${namePct}%).`);
  } else {
    parts.push(`Map/geocoding results do not clearly match this facility (${namePct}% name match).`);
  }

  if (args.reversePlace) {
    parts.push(`Coordinates resolve to: ${args.reversePlace.displayName}.`);
  }
  if (args.forwardPlace) {
    parts.push(`Name search resolves to: ${args.forwardPlace.displayName}.`);
  }
  if (args.distanceKm != null) {
    parts.push(`Distance between listing coordinates and search result: ${args.distanceKm.toFixed(1)} km.`);
  }

  return parts.join(' ');
}
