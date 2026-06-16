import { describe, expect, it } from 'vitest';
import { assessLocationVerification, CLOSE_LOCATION_DISTANCE_KM } from './location-verification';

describe('assessLocationVerification', () => {
  it('grades likely_match when geocoded result is within 1 km even with weak name match', () => {
    const result = assessLocationVerification({
      facilityName: 'Dr Verma Eye Hospital',
      latitude: 21.1901,
      longitude: 81.2849,
      forwardGeocode: {
        displayName: 'Main Road, Durg, Chhattisgarh',
        lat: 21.195,
        lon: 81.289,
        source: 'forward',
      },
    });

    expect(result.distanceKm).not.toBeNull();
    expect(result.distanceKm!).toBeLessThanOrEqual(CLOSE_LOCATION_DISTANCE_KM);
    expect(result.verdict).toBe('likely_match');
  });

  it('does not upgrade to likely_match when geocoded result is farther than 1 km', () => {
    const result = assessLocationVerification({
      facilityName: 'Unrelated Clinic Name',
      latitude: 21.19,
      longitude: 81.28,
      forwardGeocode: {
        displayName: 'Far Away Place',
        lat: 21.35,
        lon: 81.45,
        source: 'forward',
      },
    });

    expect(result.distanceKm).not.toBeNull();
    expect(result.distanceKm!).toBeGreaterThan(CLOSE_LOCATION_DISTANCE_KM);
    expect(result.verdict).not.toBe('likely_match');
  });
});
