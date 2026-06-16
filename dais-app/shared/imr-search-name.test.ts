import { describe, expect, it } from 'vitest';
import {
  doctorNameMatchesSearchTokens,
  normalizeImrDoctorSearchName,
} from './imr-search-name';

describe('normalizeImrDoctorSearchName', () => {
  it('strips Dr prefix and uses surname for multi-word names', () => {
    expect(normalizeImrDoctorSearchName('Dr Shailendra Jagtap')).toEqual({
      original: 'Dr Shailendra Jagtap',
      apiName: 'Jagtap',
      filterTokens: ['Shailendra', 'Jagtap'],
      usedSurnameOnly: true,
    });
  });

  it('keeps a single token unchanged', () => {
    expect(normalizeImrDoctorSearchName('Jagtap').apiName).toBe('Jagtap');
    expect(normalizeImrDoctorSearchName('Dr Verma').apiName).toBe('Verma');
  });
});

describe('doctorNameMatchesSearchTokens', () => {
  it('requires all tokens in the doctor or parent name', () => {
    expect(
      doctorNameMatchesSearchTokens('Jagtap Shailendra', 'Lata Raghunath Jagtap', [
        'Shailendra',
        'Jagtap',
      ]),
    ).toBe(true);

    expect(
      doctorNameMatchesSearchTokens('Jagtap Narayan', null, ['Shailendra', 'Jagtap']),
    ).toBe(false);
  });
});
