export type ClaimMismatchFlag = 'unsupported_specialties' | 'orphan_claims' | 'semantic_mismatch';

export const CLAIM_MISMATCH_LABELS: Record<ClaimMismatchFlag, string> = {
  unsupported_specialties: 'Specialty not supported by procedure/capability text',
  orphan_claims: 'Procedure/capability term without matching specialty',
  semantic_mismatch: 'AI found specialty/claim inconsistency',
};

export const CLAIM_RULE_STATUS_LABELS: Record<string, string> = {
  ok: 'Specialties supported by claims',
  weak: 'Some specialties lack supporting claims',
  mismatch: 'Specialties not supported by claims',
  skipped: 'No specialties listed',
  skipped_no_claims: 'Cannot verify — no procedure/capability data',
};

export const CLAIM_SKIPPED_NO_CLAIMS_SUMMARY =
  'Specialties are listed, but this facility has no procedure, equipment, or capability text to compare against.';

export function parseClaimMismatchFlags(value: string | null | undefined): ClaimMismatchFlag[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is ClaimMismatchFlag =>
      part === 'unsupported_specialties' ||
      part === 'orphan_claims' ||
      part === 'semantic_mismatch',
    );
}

export interface ClaimValidationDisplay {
  ruleStatus: string;
  ruleLabel: string;
  consistencyStatus: string;
  consistencySummary: string | null;
  ruleScore: string | number | null;
  consistencyScore: string | number | null;
  showUnsupportedSpecialties: boolean;
  showOrphanTerms: boolean;
  mismatchFlags: ClaimMismatchFlag[];
}

/** Correct stale batch rows that marked "ok" when only specialty names were available. */
export function resolveClaimValidationDisplay(input: {
  procedure?: unknown;
  equipment?: unknown;
  capability?: unknown;
  claim_rule_status?: string | null;
  claim_rule_score?: string | number | null;
  claim_consistency_status?: string | null;
  claim_consistency_score?: string | number | null;
  claim_consistency_summary?: string | null;
  claim_unsupported_specialties?: string | null;
  claim_orphan_terms?: string | null;
  claim_mismatch_flags?: string | null;
  hasClaimText: boolean;
}): ClaimValidationDisplay {
  const storedStatus = input.claim_rule_status ?? '—';
  const mismatchFlags = parseClaimMismatchFlags(input.claim_mismatch_flags);

  if (
    input.hasClaimText ||
    storedStatus === 'skipped' ||
    storedStatus === 'skipped_no_claims' ||
    storedStatus === '—'
  ) {
    return {
      ruleStatus: storedStatus,
      ruleLabel: CLAIM_RULE_STATUS_LABELS[storedStatus] ?? storedStatus,
      consistencyStatus: input.claim_consistency_status ?? '—',
      consistencySummary: input.claim_consistency_summary ?? null,
      ruleScore: input.claim_rule_score ?? null,
      consistencyScore: input.claim_consistency_score ?? null,
      showUnsupportedSpecialties: Boolean(input.claim_unsupported_specialties),
      showOrphanTerms: Boolean(input.claim_orphan_terms),
      mismatchFlags,
    };
  }

  return {
    ruleStatus: 'skipped_no_claims',
    ruleLabel: CLAIM_RULE_STATUS_LABELS.skipped_no_claims,
    consistencyStatus: 'skipped_no_claims',
    consistencySummary: CLAIM_SKIPPED_NO_CLAIMS_SUMMARY,
    ruleScore: null,
    consistencyScore: null,
    showUnsupportedSpecialties: false,
    showOrphanTerms: false,
    mismatchFlags: [],
  };
}

