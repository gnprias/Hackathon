import { describe, expect, it } from 'vitest';
import {
  matchSpecialtiesFromQuery,
  topSpecialtyCandidates,
  type SpecialtyOption,
} from './specialty-match';

const specialties: SpecialtyOption[] = [
  { specialty_canonical: 'cardiology', specialty_display: 'Cardiology', facility_count: 12 },
  { specialty_canonical: 'pulmonology', specialty_display: 'Pulmonology', facility_count: 5 },
  { specialty_canonical: 'radiology', specialty_display: 'Radiology', facility_count: 8 },
];

describe('matchSpecialtiesFromQuery', () => {
  it('returns empty results for blank query or empty catalog', () => {
    expect(matchSpecialtiesFromQuery('', specialties)).toEqual([]);
    expect(matchSpecialtiesFromQuery('cardiology', [])).toEqual([]);
  });

  it('ranks strong specialty keyword matches first', () => {
    const matches = matchSpecialtiesFromQuery('need cardiology hospital near Ajmer', specialties);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.canonical).toBe('cardiology');
    expect(matches[0]?.score).toBeGreaterThan(0.4);
  });

  it('limits results to the requested count', () => {
    const matches = matchSpecialtiesFromQuery('cardiology pulmonology radiology', specialties, 2);
    expect(matches).toHaveLength(2);
  });
});

describe('topSpecialtyCandidates', () => {
  it('returns matched specialties when query hits the catalog', () => {
    const candidates = topSpecialtyCandidates('pulmonology clinic', specialties, 10);
    expect(candidates.some((item) => item.specialty_canonical === 'pulmonology')).toBe(true);
  });

  it('falls back to the first specialties when nothing matches', () => {
    const candidates = topSpecialtyCandidates('zzzz-no-match', specialties, 2);
    expect(candidates).toEqual(specialties.slice(0, 2));
  });
});
