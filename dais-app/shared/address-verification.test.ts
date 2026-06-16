import { describe, expect, it } from 'vitest';
import {
  isValidCityName,
  resolvedAddressField,
  sanitizeCityName,
} from './address-verification';

describe('isValidCityName', () => {
  it('rejects single-letter geocoder locality tokens', () => {
    expect(isValidCityName('D')).toBe(false);
    expect(isValidCityName('W')).toBe(false);
  });

  it('accepts normal city names', () => {
    expect(isValidCityName('Mumbai')).toBe(true);
    expect(isValidCityName(' New Delhi ')).toBe(true);
  });
});

describe('sanitizeCityName', () => {
  it('returns null for invalid names', () => {
    expect(sanitizeCityName('')).toBeNull();
    expect(sanitizeCityName('A')).toBeNull();
  });

  it('trims valid names', () => {
    expect(sanitizeCityName('  Pune  ')).toBe('Pune');
  });
});

describe('resolvedAddressField', () => {
  it('falls back to raw city when verified city is a single letter', () => {
    expect(resolvedAddressField('W', 'Mumbai')).toBe('Mumbai');
    expect(resolvedAddressField('D', 'Chandigarh')).toBe('Chandigarh');
  });

  it('prefers a valid verified city', () => {
    expect(resolvedAddressField('Mumbai', 'Bombay')).toBe('Mumbai');
  });
});
