import { describe, expect, it } from 'vitest';
import { resolveClaimValidationDisplay } from './claim-validation';

describe('resolveClaimValidationDisplay', () => {
  it('overrides stale ok when no claim text exists', () => {
    const display = resolveClaimValidationDisplay({
      hasClaimText: false,
      claim_rule_status: 'ok',
      claim_rule_score: 1,
      claim_consistency_status: 'ok',
      claim_consistency_score: 1,
      claim_consistency_summary: 'All listed specialties have supporting procedure or capability keywords.',
    });

    expect(display.ruleStatus).toBe('skipped_no_claims');
    expect(display.ruleScore).toBeNull();
    expect(display.consistencySummary).toContain('no procedure');
  });

  it('keeps ok when claim text exists', () => {
    const display = resolveClaimValidationDisplay({
      hasClaimText: true,
      claim_rule_status: 'ok',
      claim_rule_score: 1,
      claim_consistency_status: 'ok',
      claim_consistency_summary: 'Looks good.',
    });

    expect(display.ruleStatus).toBe('ok');
    expect(display.ruleScore).toBe(1);
  });
});
