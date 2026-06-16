import { describe, expect, it } from 'vitest';
import { getSmcIdByStateRegion, getSmcNameByStateRegion } from './smc-councils';

describe('getSmcIdByStateRegion', () => {
  it('maps verified state names to council ids', () => {
    expect(getSmcIdByStateRegion('Chhattisgarh')).toBe(5);
    expect(getSmcIdByStateRegion('Madhya Pradesh')).toBe(15);
    expect(getSmcIdByStateRegion('Odisha')).toBe(21);
  });

  it('returns council name for resolved state', () => {
    expect(getSmcNameByStateRegion('Chhattisgarh')).toBe('Chhattisgarh Medical Council');
  });
});
