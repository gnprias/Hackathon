import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@databricks/appkit-ui/react';
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { ADDRESS_VERIFICATION_TRUST_LABELS } from '../../../../../shared/address-verification';
import { computeTrustScore, type TrustScoreInput } from '../../../../../shared/trust-score';
import type { FacilityVerificationResult } from '../../../../../shared/verification-types';

interface TrustScoreCardProps {
  facility: TrustScoreInput & {
    name?: string | null;
    address_geocode_status?: string | null;
    address_mismatch_flags?: string | null;
  };
  verification: FacilityVerificationResult | null;
  verificationLoading?: boolean;
}

function scoreVariant(score: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (score >= 80) return 'default';
  if (score >= 60) return 'secondary';
  if (score >= 40) return 'outline';
  return 'destructive';
}

function buildTrustInput(
  facility: TrustScoreCardProps['facility'],
  verification: FacilityVerificationResult | null,
): TrustScoreInput {
  return {
    ...facility,
    website_relevance_verdict: verification?.website.verdict ?? null,
    location_verdict: verification?.location.verdict ?? null,
  };
}

export function TrustScoreCard({
  facility,
  verification,
  verificationLoading = false,
}: TrustScoreCardProps) {
  const trustInput = useMemo(
    () => buildTrustInput(facility, verification),
    [facility, verification],
  );
  const trustScore = useMemo(() => computeTrustScore(trustInput), [trustInput]);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeSource, setNarrativeSource] = useState<'openai' | 'rules-only'>('rules-only');

  useEffect(() => {
    let cancelled = false;

    const loadNarrative = async () => {
      try {
        const response = await fetch('/api/trust/narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facility: {
              ...facility,
              website_relevance_verdict: verification?.website.verdict ?? null,
              location_verdict: verification?.location.verdict ?? null,
            },
            trustScore,
          }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          narrative: string | null;
          source: 'openai' | 'rules-only';
          fallbackRecommendation: string;
        };
        if (cancelled) return;
        setNarrative(payload.narrative);
        setNarrativeSource(payload.source);
      } catch {
        if (!cancelled) {
          setNarrative(null);
          setNarrativeSource('rules-only');
        }
      }
    };

    if (!verificationLoading) {
      void loadNarrative();
    }

    return () => {
      cancelled = true;
    };
  }, [facility, trustScore, verification, verificationLoading]);

  const recommendation = narrative ?? trustScore.recommendation;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          Trust & outreach score
          {verificationLoading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <>
              <Badge variant={scoreVariant(trustScore.score)}>{trustScore.score}/100</Badge>
              {trustScore.locationQuestionable && (
                <Badge variant="destructive">Questionable location</Badge>
              )}
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {verificationLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <p>{recommendation}</p>
        )}
        {narrativeSource === 'openai' && !verificationLoading && (
          <p className="text-xs text-muted-foreground">Summary enhanced with OpenAI (facts from rules engine only).</p>
        )}

        <details className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">How this score works</summary>
          <ul className="mt-2 space-y-2 list-disc pl-4">
            <li>
              <span className="font-medium text-foreground">Links (0–30):</span> HTTP reachability for
              website and Facebook from <code className="text-xs">facility_link_validation</code>.
            </li>
            <li>
              <span className="font-medium text-foreground">Contact (0–25):</span> Phone and email on
              the facility record.
            </li>
            <li>
              <span className="font-medium text-foreground">Social (0–20):</span> Follower, post, and
              channel counts from the dataset.
            </li>
            <li>
              <span className="font-medium text-foreground">Profile (0–15):</span> Completeness of
              specialties, procedures, capabilities, and description (not verified claims).
            </li>
            <li>
              <span className="font-medium text-foreground">Credentialing (0–5 bonus):</span> Saved NMC
              IMR doctors whose qualifications match this facility&apos;s listed specialty (excludes
              blacklisted entries).
            </li>
            <li>
              <span className="font-medium text-foreground">Operational (0–10):</span> Location
              exists (batch geocode + Step 4 map check, up to 5) and whether reported
              procedures/equipment/capabilities support listed specialties (up to 5).
            </li>
            <li>
              <span className="font-medium text-foreground">Address status:</span> Shown for
              transparency; geocode success is included in Operational, not a separate score line.
            </li>
            <li>
              <span className="font-medium text-foreground">Questionable location:</span> Flagged when
              batch geocoding fails or step 4 map cross-check cannot confirm the facility is there.
            </li>
            <li>
              <span className="font-medium text-foreground">Penalties:</span> Broken links (−5/−3),
              wrong website (−12, weak −4), step 4 location mismatch/not found (−12/−10), partial
              geocode (−8), failed geocode (−10).
            </li>
          </ul>
        </details>

        {!verificationLoading && (
          <div className="rounded-md border px-3 py-2 space-y-2">
            <p className="text-xs font-medium text-foreground">Verification signals</p>
            <AddressVerificationSignalRow status={trustScore.addressVerificationStatus} />
            {verification && (
              <LocationCrossCheckSignalRow verdict={verification.location.verdict} />
            )}
          </div>
        )}

        {!verificationLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ScoreRow label="Links" value={trustScore.breakdown.linkValidation} max={30} />
            <ScoreRow label="Contact" value={trustScore.breakdown.contact} max={25} />
            <ScoreRow label="Social" value={trustScore.breakdown.social} max={20} />
            <ScoreRow label="Profile" value={trustScore.breakdown.profileRichness} max={15} />
            <ScoreRow label="Operational" value={trustScore.breakdown.operational} max={10} />
            {trustScore.breakdown.credentialing > 0 && (
              <ScoreRow
                label="Credentialing"
                value={trustScore.breakdown.credentialing}
                max={5}
              />
            )}
            {trustScore.breakdown.penalties > 0 && (
              <ScoreRow label="Penalties" value={-trustScore.breakdown.penalties} max={0} negative />
            )}
          </div>
        )}

        {trustScore.locationQuestionable && (
          <p className="text-xs text-destructive">
            {trustScore.locationQuestionableReasons.join(' ') ||
              'Location could not be verified — treat this listing with caution.'}
          </p>
        )}

        {verification?.website.verdict === 'likely_mismatch' && (
          <p className="text-xs text-destructive">
            Trust score reduced because the website cross-check flagged a likely wrong site.
          </p>
        )}

        {trustScore.addressVerificationStatus === 'partial_mismatch' && (
          <p className="text-xs text-muted-foreground">
            A real place was found at this address. Source postcode or city may be outdated — see the
            verified address card above.
          </p>
        )}

        {trustScore.hasUnverifiedClaims && (
          <p className="text-xs text-muted-foreground">
            Specialties, procedures, equipment, and capabilities are facility-reported and not verified by IMR.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AddressVerificationSignalRow({
  status,
}: {
  status: ReturnType<typeof computeTrustScore>['addressVerificationStatus'];
}) {
  const label = ADDRESS_VERIFICATION_TRUST_LABELS[status];

  if (status === 'verified' || status === 'partial_mismatch') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2
          className={`h-4 w-4 shrink-0 ${status === 'partial_mismatch' ? 'text-amber-500' : 'text-primary'}`}
        />
        <span>{label}</span>
      </div>
    );
  }

  if (status === 'partial_geocode') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <span>{label}</span>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <CircleDashed className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

function LocationCrossCheckSignalRow({ verdict }: { verdict: string }) {
  if (verdict === 'likely_match') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        <span>Step 4 map cross-check: facility name matches location</span>
      </div>
    );
  }

  if (verdict === 'likely_mismatch' || verdict === 'not_found') {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {verdict === 'not_found'
            ? 'Step 4 map cross-check: facility not confirmed at this location'
            : 'Step 4 map cross-check: facility may not be at this location'}
        </span>
      </div>
    );
  }

  if (verdict === 'weak_match') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <span>Step 4 map cross-check: weak name/location match</span>
      </div>
    );
  }

  return null;
}

function ScoreRow({
  label,
  value,
  max,
  negative = false,
}: {
  label: string;
  value: number;
  max: number;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={negative ? 'text-destructive font-medium' : 'font-medium'}>
        {negative ? value : `${value}${max > 0 ? ` / ${max}` : ''}`}
      </div>
    </div>
  );
}
