import { describe, expect, it } from 'vitest';
import { dedupeClaimItems, parseClaimList, parseDedupedClaimList } from './parse-claim-list';

describe('parseClaimList', () => {
  it('parses JSON arrays and native arrays', () => {
    expect(parseClaimList('["Cardiology", "cardiology"]')).toEqual(['Cardiology', 'cardiology']);
    expect(parseClaimList(['Surgery', 'Radiology'])).toEqual(['Surgery', 'Radiology']);
  });

  it('dedupes case-insensitively', () => {
    expect(parseDedupedClaimList(['Cardiology', ' cardiology ', 'CARDIOLOGY', 'Radiology'])).toEqual([
      'Cardiology',
      'Radiology',
    ]);
    expect(dedupeClaimItems(['a', 'A', 'b'])).toEqual(['a', 'b']);
  });
});
