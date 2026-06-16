import { Badge, Card, CardContent, CardHeader, CardTitle } from '@databricks/appkit-ui/react';
import { Activity } from 'lucide-react';
import {
  HIGH_ACUITY_STATUS_LABELS,
  resolveHighAcuitySpecialtyVerification,
  type HighAcuityEvidenceSource,
  type HighAcuityVerificationStatus,
} from '../../../../../shared/high-acuity-specialty-verification';
import type { FacilityImrDoctorRecord } from '../../../../../shared/imr-doctor-record';

interface HighAcuitySpecialtyVerificationCardProps {
  facility: {
    specialties?: unknown;
    procedure?: unknown;
    equipment?: unknown;
    capability?: unknown;
    description?: string | null;
  };
  imrDoctors?: Pick<
    FacilityImrDoctorRecord,
    'qualification' | 'additionalQualifications' | 'blacklisted'
  >[];
}

function statusVariant(
  status: HighAcuityVerificationStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'verified') return 'default';
  if (status === 'partial') return 'secondary';
  if (status === 'unverified') return 'destructive';
  return 'outline';
}

function overallVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'ok') return 'default';
  if (status === 'weak') return 'secondary';
  if (status === 'unverified') return 'destructive';
  return 'outline';
}

const EVIDENCE_LABELS: Record<HighAcuityEvidenceSource, string> = {
  specialty: 'Listed specialty',
  claims: 'Procedure/equipment/capability',
  imr: 'NMC IMR doctor qualification',
};

export function HighAcuitySpecialtyVerificationCard({
  facility,
  imrDoctors = [],
}: HighAcuitySpecialtyVerificationCardProps) {
  const verification = resolveHighAcuitySpecialtyVerification({
    ...facility,
    imrDoctors,
  });

  const claimedSpecialties = verification.specialties.filter((item) => item.claimed);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Activity className="h-4 w-4" />
          High-acuity services
          <Badge variant={overallVariant(verification.overallStatus)}>
            {verification.overallLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Checks whether ICU, maternity, emergency, oncology, trauma, or NICU services are
          indicated on the record and corroborated by specialty text, procedure/equipment/capability
          claims, and saved NMC IMR doctors. Facility-reported fields are not independently verified.
        </p>

        {claimedSpecialties.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ICU, maternity, emergency, oncology, trauma, or NICU services are indicated on this
            record.
          </p>
        ) : (
          <ul className="space-y-3">
            {verification.specialties.map((item) => (
              <li key={item.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{item.label}</span>
                  <Badge variant={statusVariant(item.status)}>
                    {HIGH_ACUITY_STATUS_LABELS[item.status]}
                  </Badge>
                </div>
                {item.claimed ? (
                  <>
                    {item.matchedTerms.length > 0 && (
                      <p className="text-xs text-muted-foreground break-words">
                        Matched terms: {item.matchedTerms.join(', ')}
                      </p>
                    )}
                    {item.evidence.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {item.evidence.map((source) => (
                          <Badge key={`${item.id}-${source}`} variant="outline">
                            {EVIDENCE_LABELS[source]}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-destructive">
                        Claimed but not corroborated by specialty, claims, or IMR data.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Not indicated on record.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
