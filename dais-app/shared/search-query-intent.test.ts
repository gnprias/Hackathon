import { describe, expect, it } from 'vitest';
import {
  buildSpecialtySearchGuidance,
  classifySearchQuery,
  facilityNameMatchScore,
  parseFacilityQuery,
} from './search-query-intent';

describe('search-query-intent', () => {
  it('classifies named hospitals with doctor prefix as facility', () => {
    expect(classifySearchQuery('Dr Verma Eye Hospital, Durg')).toBe('facility_name');
  });

  it('parses clinic name and city from comma query', () => {
    const parsed = parseFacilityQuery('Dr Verma Eye Hospital, Durg');
    expect(parsed.facilitySearchText).toBe('Dr Verma Eye Hospital');
    expect(parsed.city).toBe('Durg');
    expect(parsed.intent).toBe('facility_name');
  });

  it('scores exact facility name highly', () => {
    expect(
      facilityNameMatchScore(
        'Dr Verma Eye Hospital',
        'Dr Verma Eye Hospital, Durg',
      ),
    ).toBeGreaterThan(0.9);
  });

  it('extracts doctor-only search text', () => {
    expect(parseFacilityQuery('find Dr Verma near Patna').facilitySearchText).toBe('Verma');
  });

  it('guides specialty search without location', () => {
    expect(
      buildSpecialtySearchGuidance({
        hasLocation: false,
        intent: 'specialty',
        specialtyMatched: true,
        facilityMatches: 0,
      }),
    ).toContain('Add a state');
  });
});
