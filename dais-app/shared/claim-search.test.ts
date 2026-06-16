import { describe, expect, it } from 'vitest';
import { extractClaimTermsFromQuery } from './claim-search';

describe('extractClaimTermsFromQuery', () => {
  it('extracts MRI from a cardiologist + MRI query', () => {
    const terms = extractClaimTermsFromQuery(
      'I am looking for a cardiologist and a facility that offers MRIs',
    );
    expect(terms.some((t) => t.includes('mri') || t.includes('magnetic'))).toBe(true);
  });
});
