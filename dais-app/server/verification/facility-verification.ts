import { assessLocationVerification } from '../../shared/location-verification';
import { assessWebsiteRelevance } from '../../shared/website-relevance';
import {
  buildForwardGeocodeQuery,
  forwardGeocode as lookupForwardGeocode,
  reverseGeocode as lookupReverseGeocode,
} from './geocoding';
import { fetchWebsitePage, pickWebsiteUrl } from './website-fetcher';

export interface FacilityVerificationInput {
  name: string;
  official_website?: string | null;
  website_working_url?: string | null;
  address_city?: string | null;
  address_state_or_region?: string | null;
  address_country?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface FacilityVerificationResult {
  checkedAt: string;
  website: ReturnType<typeof assessWebsiteRelevance>;
  location: ReturnType<typeof assessLocationVerification>;
  providers: {
    geocoding: 'google' | 'nominatim' | 'none';
  };
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export async function verifyFacility(input: FacilityVerificationInput): Promise<FacilityVerificationResult> {
  const url = pickWebsiteUrl(input.website_working_url, input.official_website);
  let websiteAssessment = assessWebsiteRelevance({
    facilityName: input.name,
    city: input.address_city,
    state: input.address_state_or_region,
    url: url ?? '',
  });

  if (url) {
    const { page, error } = await fetchWebsitePage(url);
    websiteAssessment = assessWebsiteRelevance({
      facilityName: input.name,
      city: input.address_city,
      state: input.address_state_or_region,
      url,
      finalUrl: page?.finalUrl ?? url,
      pageTitle: page?.pageTitle ?? null,
      metaDescription: page?.metaDescription ?? null,
      visibleText: page?.visibleText ?? null,
      httpStatus: page?.httpStatus ?? null,
      fetchError: error,
    });
  }

  const latitude = toNumber(input.latitude);
  const longitude = toNumber(input.longitude);

  let reverseGeocode = null;
  let forwardGeocode = null;
  let geocodeError: string | null = null;

  try {
    if (latitude != null && longitude != null) {
      reverseGeocode = await lookupReverseGeocode(latitude, longitude);
    }

    const query = buildForwardGeocodeQuery({
      name: input.name,
      city: input.address_city,
      state: input.address_state_or_region,
      country: input.address_country,
    });
    forwardGeocode = await lookupForwardGeocode(query);
  } catch (err) {
    geocodeError = err instanceof Error ? err.message : 'Geocoding failed';
  }

  const geocodingProvider = process.env.GOOGLE_MAPS_API_KEY?.trim()
    ? 'google'
    : reverseGeocode || forwardGeocode
      ? 'nominatim'
      : 'none';

  const locationAssessment = assessLocationVerification({
    facilityName: input.name,
    city: input.address_city,
    state: input.address_state_or_region,
    country: input.address_country,
    latitude,
    longitude,
    reverseGeocode,
    forwardGeocode,
    geocodeError,
  });

  return {
    checkedAt: new Date().toISOString(),
    website: websiteAssessment,
    location: locationAssessment,
    providers: {
      geocoding: geocodingProvider,
    },
  };
}
