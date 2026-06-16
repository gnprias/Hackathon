import type { GeocodedPlace } from '../../shared/location-verification';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT?.trim() ||
  'DAIS-Virtue-Foundation-Verification/1.0 (hackathon outreach review)';

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
}

async function nominatimGet(path: string): Promise<NominatimResult[]> {
  const response = await fetch(`${NOMINATIM_BASE}${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding service returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NominatimResult | NominatimResult[];
  return Array.isArray(payload) ? payload : [payload];
}

function toPlace(result: NominatimResult, source: GeocodedPlace['source']): GeocodedPlace | null {
  if (!result.display_name || !result.lat || !result.lon) return null;
  const lat = Number.parseFloat(result.lat);
  const lon = Number.parseFloat(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    displayName: result.display_name,
    lat,
    lon,
    source,
  };
}

async function googleGeocode(query: string, apiKey: string): Promise<GeocodedPlace | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  const top = payload.results?.[0];
  const lat = top?.geometry?.location?.lat;
  const lon = top?.geometry?.location?.lng;
  if (!top?.formatted_address || lat == null || lon == null) return null;

  return {
    displayName: top.formatted_address,
    lat,
    lon,
    source: 'google',
  };
}

async function googleReverseGeocode(lat: number, lon: number, apiKey: string): Promise<GeocodedPlace | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lon}`);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  const top = payload.results?.[0];
  if (!top?.formatted_address || top.geometry?.location?.lat == null || top.geometry?.location?.lng == null) {
    return null;
  }

  return {
    displayName: top.formatted_address,
    lat: top.geometry.location.lat,
    lon: top.geometry.location.lng,
    source: 'google',
  };
}

export async function reverseGeocode(lat: number, lon: number): Promise<GeocodedPlace | null> {
  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleKey) {
    const google = await googleReverseGeocode(lat, lon, googleKey);
    if (google) return google;
  }

  const results = await nominatimGet(
    `/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&zoom=16&addressdetails=0`,
  );
  return toPlace(results[0] ?? {}, 'reverse');
}

export async function forwardGeocode(query: string): Promise<GeocodedPlace | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleKey) {
    const google = await googleGeocode(trimmed, googleKey);
    if (google) return google;
  }

  const results = await nominatimGet(
    `/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`,
  );
  return toPlace(results[0] ?? {}, 'forward');
}

export function buildForwardGeocodeQuery(args: {
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  return [args.name, args.city, args.state, args.country].filter(Boolean).join(', ');
}
