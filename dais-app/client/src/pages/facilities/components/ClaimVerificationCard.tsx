import { Badge, Card, CardContent, CardHeader, CardTitle } from '@databricks/appkit-ui/react';
import { Stethoscope } from 'lucide-react';
import {
  CLAIM_MISMATCH_LABELS,
  resolveClaimValidationDisplay,
} from '../../../../../shared/claim-validation';
import { formatFieldValue, hasFieldValue } from '../../../../../shared/format-field-value';
import { parseDedupedClaimList } from '../../../../../shared/parse-claim-list';

interface ClaimVerificationCardProps {
  facility: {
    procedure?: unknown;
    equipment?: unknown;
    capability?: unknown;
    claim_rule_status?: string | null;
    claim_rule_score?: string | number | null;
    claim_consistency_status?: string | null;
    claim_consistency_score?: string | number | null;
    claim_consistency_provider?: string | null;
    claim_consistency_summary?: string | null;
    claim_unsupported_specialties?: string | null;
    claim_orphan_terms?: string | null;
    claim_mismatch_flags?: string | null;
    claim_checked_at?: string | null;
  };
}

function formatScore(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return formatFieldValue(value);
  return `${Math.round(n * 100)}%`;
}

function statusVariant(
  status: string | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'ok') return 'default';
  if (status === 'weak' || status === 'pending') return 'secondary';
  if (status === 'mismatch' || status === 'skipped_no_claims') return 'destructive';
  return 'outline';
}

function ClaimTermsGroup({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-1">{title}</h4>
      <ul className="list-disc pl-5 space-y-1 break-words">
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ClaimVerificationCard({ facility }: ClaimVerificationCardProps) {
  const procedureItems = parseDedupedClaimList(facility.procedure);
  const equipmentItems = parseDedupedClaimList(facility.equipment);
  const capabilityItems = parseDedupedClaimList(facility.capability);
  const hasClaimText =
    procedureItems.length > 0 || equipmentItems.length > 0 || capabilityItems.length > 0;

  const hasValidation = hasFieldValue(facility.claim_rule_status);

  if (!hasValidation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Clinical claims consistency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Specialty vs procedure/capability checks have not been run for this facility yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const display = resolveClaimValidationDisplay({
    ...facility,
    hasClaimText,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Stethoscope className="h-4 w-4" />
          Clinical claims consistency
          <Badge variant={statusVariant(display.ruleStatus)}>{display.ruleLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Compares listed specialties against facility-reported procedure, equipment, and capability
          text only (not specialty names). This does not verify clinician credentials via NMC IMR.
        </p>

        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Procedure / equipment / capability reviewed</p>
          {hasClaimText ? (
            <>
              <ClaimTermsGroup title="Procedures" items={procedureItems} />
              <ClaimTermsGroup title="Equipment" items={equipmentItems} />
              <ClaimTermsGroup title="Capabilities" items={capabilityItems} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No procedure, equipment, or capability terms are listed for this facility.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Rule match score</dt>
            <dd>{formatScore(display.ruleScore)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Consistency status</dt>
            <dd>{formatFieldValue(display.consistencyStatus)}</dd>
          </div>
          {display.consistencyScore != null && display.consistencyScore !== '' && (
            <div>
              <dt className="text-xs text-muted-foreground">Consistency score</dt>
              <dd>{formatScore(display.consistencyScore)}</dd>
            </div>
          )}
          {hasFieldValue(facility.claim_consistency_provider) && (
            <div>
              <dt className="text-xs text-muted-foreground">Checked by</dt>
              <dd>{formatFieldValue(facility.claim_consistency_provider)}</dd>
            </div>
          )}
        </div>

        {hasFieldValue(display.consistencySummary) && (
          <p className="text-sm">{formatFieldValue(display.consistencySummary)}</p>
        )}

        {display.showUnsupportedSpecialties && hasFieldValue(facility.claim_unsupported_specialties) && (
          <div>
            <dt className="text-xs text-muted-foreground">Specialties without supporting claims</dt>
            <dd className="break-words">{formatFieldValue(facility.claim_unsupported_specialties)}</dd>
          </div>
        )}

        {display.showOrphanTerms && hasFieldValue(facility.claim_orphan_terms) && (
          <div>
            <dt className="text-xs text-muted-foreground">Claim terms without matching specialty</dt>
            <dd className="break-words">{formatFieldValue(facility.claim_orphan_terms)}</dd>
          </div>
        )}

        {display.mismatchFlags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {display.mismatchFlags.map((flag) => (
              <Badge key={flag} variant="outline">
                {CLAIM_MISMATCH_LABELS[flag]}
              </Badge>
            ))}
          </div>
        )}

        {hasFieldValue(facility.claim_checked_at) && (
          <p className="text-xs text-muted-foreground">
            Checked: {formatFieldValue(facility.claim_checked_at)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
