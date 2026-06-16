import { useState } from 'react';
import {
  useAnalyticsQuery,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Checkbox,
  Skeleton,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { ArrowLeft, ArrowRight, Check, X, MapPin, Stethoscope, Building2, FileText } from 'lucide-react';
import {
  emptySearchCriteria,
  hasLocationCriteria,
  toFilterParams,
  toStateLookupParams,
  toCityLookupParams,
  type FacilitySearchCriteria,
} from './facility-search';
import { AddressVerificationCard } from './components/AddressVerificationCard';
import { ClaimVerificationCard } from './components/ClaimVerificationCard';
import { useDeactivatedFacilities, type DeactivatedFacility } from './use-deactivated-facilities';
import { ImrLookupCard } from './components/ImrLookupCard';
import { UnverifiedClaimsCard } from './components/UnverifiedClaimsCard';
import { DeactivateFacilityCard } from './components/DeactivateFacilityCard';
import { FacilityDetailVerificationSection } from './FacilityDetailVerificationSection';
import { useFacilityImrDoctors } from './use-facility-imr-doctors';
import { AiSpecialtySearch } from './components/AiSpecialtySearch';
import { EMPTY_FIELD, formatFieldValue, hasFieldValue } from '../../../../shared/format-field-value';
import { resolvedAddressField } from '../../../../shared/address-verification';
import {
  countMatchTiers,
  FACILITY_MATCH_TIER_LABELS,
  formatMatchTierSummary,
  isFacilityMatchTier,
} from '../../../../shared/facility-match-tier';
import { formatClaimTermsLabel } from '../../../../shared/claim-search';
import {
  formatNearestAlternateLabel,
} from '../../../../shared/nearest-alternate';
import { useNearestAlternates } from './use-nearest-alternates';

const STEPS = [
  { id: 1, label: 'Search area', icon: MapPin },
  { id: 2, label: 'Specialty', icon: Stethoscope },
  { id: 3, label: 'Facilities', icon: Building2 },
  { id: 4, label: 'Details', icon: FileText },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const ANY_STATE = '__any__';
const ANY_CITY = '__any__';

interface SelectedSpecialty {
  canonical: string;
  display: string;
  claimTerms?: string[];
}

function StepIndicator({
  currentStep,
  onStepClick,
}: {
  currentStep: StepId;
  onStepClick?: (step: StepId) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2 md:gap-4 mb-6">
      {STEPS.map((step) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isComplete = step.id < currentStep;
        const canJump = step.id <= currentStep || step.id === 2;
        return (
          <li key={step.id}>
            <button
              type="button"
              disabled={!canJump || !onStepClick}
              onClick={() => onStepClick?.(step.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isComplete
                    ? 'bg-muted text-foreground hover:bg-muted/80'
                    : canJump
                      ? 'text-muted-foreground hover:bg-muted/60'
                      : 'text-muted-foreground opacity-60 cursor-not-allowed'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="font-medium">{step.id}. {step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function LinkStatusIcon({ status }: { status: string | null | undefined }) {
  if (status === 'ok') {
    return <Check className="h-4 w-4 text-green-600" aria-label="Working" />;
  }
  if (status == null || status === 'unknown' || status.trim() === '') {
    return <span className="text-sm text-muted-foreground">{EMPTY_FIELD}</span>;
  }
  return <X className="h-4 w-4 text-destructive" aria-label="Not working" />;
}

function SearchStep({
  criteria,
  onChange,
  onNext,
  onSkipLocation,
  onAiSelectSpecialty,
  onAiSelectFacility,
}: {
  criteria: FacilitySearchCriteria;
  onChange: (criteria: FacilitySearchCriteria) => void;
  onNext: () => void;
  onSkipLocation: () => void;
  onAiSelectSpecialty: (specialty: SelectedSpecialty) => void;
  onAiSelectFacility: (uniqueId: string) => void;
}) {
  const hasLocation = hasLocationCriteria(criteria);
  const { data: states, loading: statesLoading } = useAnalyticsQuery('facility_states', toStateLookupParams(criteria));
  const { data: cities, loading: citiesLoading } = useAnalyticsQuery(
    'facility_cities',
    toCityLookupParams(criteria),
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Search by region or zip</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Location is optional. Add zip, state, or city to narrow results — or skip and search by doctor
          name, clinic name, or specialty using the AI assistant below.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="zip">Zip / postcode</Label>
            <Input
              id="zip"
              placeholder="e.g. 110001"
              value={criteria.zip}
              onChange={(e) => onChange({ ...criteria, zip: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State / region</Label>
            <Select
              value={criteria.state || ANY_STATE}
              onValueChange={(value) =>
                onChange({
                  ...criteria,
                  state: value === ANY_STATE ? '' : value,
                  city: value === ANY_STATE ? criteria.city : '',
                })
              }
              disabled={statesLoading}
            >
              <SelectTrigger id="state">
                <SelectValue placeholder={statesLoading ? 'Loading regions…' : 'Any state / region'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_STATE}>Any state / region</SelectItem>
                {states?.map((row) => (
                  <SelectItem key={row.state} value={row.state}>
                    {row.state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Select
              value={criteria.city || ANY_CITY}
              onValueChange={(value) =>
                onChange({ ...criteria, city: value === ANY_CITY ? '' : value })
              }
              disabled={citiesLoading}
            >
              <SelectTrigger id="city">
                <SelectValue placeholder={citiesLoading ? 'Loading cities…' : 'Any city'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CITY}>Any city</SelectItem>
                {cities?.map((row) => (
                  <SelectItem key={row.city} value={row.city}>
                    {row.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pick a state first to narrow cities. City improves nearest-facility suggestions for partial
              matches.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="reference-address">Street address (optional)</Label>
            <Input
              id="reference-address"
              placeholder="e.g. 12 Station Road, Ajmer"
              value={criteria.referenceAddress}
              onChange={(e) => onChange({ ...criteria, referenceAddress: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Optional — improves distance estimates for the nearest facility that matches a missing
              criterion.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country code</Label>
            <Input
              id="country"
              placeholder="e.g. IN"
              value={criteria.countryCode}
              onChange={(e) => onChange({ ...criteria, countryCode: e.target.value })}
            />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Optional filters</legend>
          <p className="text-xs text-muted-foreground">
            When checked, only show facilities that meet the requirement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                ['filterHasPhone', 'Has phone on record'],
                ['filterHasEmail', 'Has email on record'],
                ['filterHasWorkingWebsite', 'Has working website'],
                ['filterHasWorkingFacebook', 'Has working Facebook'],
                ['filterHasSocial', 'Has social media presence'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={criteria[key]}
                  onCheckedChange={(checked) =>
                    onChange({ ...criteria, [key]: checked === true })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {!hasLocation && (
          <p className="text-sm text-muted-foreground">
            No location filter — you can still search nationwide with the AI assistant or browse all
            specialties on the next step.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onSkipLocation}>
            Skip location
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button onClick={onNext}>
            {hasLocation ? 'Find specialties' : 'Browse all specialties'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>

      <AiSpecialtySearch
        criteria={criteria}
        onCriteriaChange={onChange}
        onSelectSpecialty={(match) =>
          onAiSelectSpecialty({
            canonical: match.canonical,
            display: match.display,
            claimTerms: match.claimTerms,
          })
        }
        onSelectFacility={onAiSelectFacility}
      />
    </div>
  );
}

function SpecialtiesStep({
  criteria,
  onSelect,
  onBack,
}: {
  criteria: FacilitySearchCriteria;
  onSelect: (specialty: SelectedSpecialty) => void;
  onBack: () => void;
}) {
  const [selectedCanonical, setSelectedCanonical] = useState('');
  const hasLocation = hasLocationCriteria(criteria);
  const { data, loading, error } = useAnalyticsQuery('facility_specialties_in_area', toFilterParams(criteria));

  const selectedRow = data?.find((row) => row.specialty_canonical === selectedCanonical);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Specialties in this area</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasLocation && (
          <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-3">
            Showing specialties across all regions. Return to step 1 to add a state or city filter.
          </p>
        )}
        {error && (
          <div className="text-destructive bg-destructive/10 p-3 rounded-md">Error: {error}</div>
        )}

        {loading && (
          <div className="space-y-2 max-w-md">
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!loading && !error && data && data.length === 0 && (
          <p className="text-muted-foreground py-6 text-center">
            No specialties found for this area and filter combination.
          </p>
        )}

        {!loading && data && data.length > 0 && (
          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="specialty-select">Specialty</Label>
              <Select value={selectedCanonical} onValueChange={setSelectedCanonical}>
                <SelectTrigger id="specialty-select">
                  <SelectValue placeholder="Select a specialty" />
                </SelectTrigger>
                <SelectContent>
                  {data.map((row) => (
                    <SelectItem key={row.specialty_canonical} value={row.specialty_canonical}>
                      {row.specialty_display} ({row.facility_count} facilities)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRow && (
                <p className="text-xs text-muted-foreground">
                  {selectedRow.facility_count} facilities report{' '}
                  <span className="font-medium">{selectedRow.specialty_display}</span> in this area.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            disabled={!selectedRow}
            onClick={() =>
              selectedRow &&
              onSelect({
                canonical: selectedRow.specialty_canonical,
                display: selectedRow.specialty_display,
              })
            }
          >
            View facilities
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FacilityListStep({
  criteria,
  specialty,
  onSelect,
  onBack,
  deactivatedIds,
}: {
  criteria: FacilitySearchCriteria;
  specialty: SelectedSpecialty;
  onSelect: (uniqueId: string) => void;
  onBack: () => void;
  deactivatedIds: Set<string>;
}) {
  const { data, loading, error } = useAnalyticsQuery('facility_list', {
    ...toFilterParams(criteria),
    specialty_canonical: sql.string(specialty.canonical),
    claim_search: sql.string(specialty.claimTerms?.[0] ?? ''),
    claim_search_2: sql.string(specialty.claimTerms?.[1] ?? ''),
  });

  const visibleFacilities = data?.filter((row) => !deactivatedIds.has(row.unique_id)) ?? [];
  const hasClaimTerms = (specialty.claimTerms?.length ?? 0) > 0;
  const tierCounts = hasClaimTerms ? countMatchTiers(visibleFacilities) : null;
  const tierSummary = tierCounts ? formatMatchTierSummary(tierCounts) : '';
  const claimTermsLabel = hasClaimTerms ? formatClaimTermsLabel(specialty.claimTerms ?? []) : '';
  const {
    alternates,
    geocodeLoading,
    poolLoading,
    error: nearestError,
    needsReferenceLocation,
    referenceLabel,
  } = useNearestAlternates({
    location: {
      referenceAddress: criteria.referenceAddress,
      city: criteria.city,
      state: criteria.state,
      zip: criteria.zip,
      countryCode: criteria.countryCode,
    },
    specialtyCanonical: specialty.canonical,
    claimTerms: specialty.claimTerms,
    facilities: visibleFacilities,
    enabled: hasClaimTerms,
  });
  const nearestLoading = geocodeLoading || poolLoading;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>
          <span>Facilities — {specialty.display}</span>
          {hasClaimTerms && (
            <span className="block text-sm font-normal text-muted-foreground mt-1">
              Including facilities matching specialty, reported claims ({specialty.claimTerms?.join(', ')}), or
              both — claims are unverified
            </span>
          )}
          {tierSummary && (
            <span className="block text-sm font-normal text-muted-foreground mt-1">{tierSummary}</span>
          )}
          {hasClaimTerms && needsReferenceLocation && (
            <span className="block text-sm font-normal text-amber-700 dark:text-amber-400 mt-1">
              Enter a city (or street address) on step 1 to see the nearest facility for each missing
              criterion.
            </span>
          )}
          {hasClaimTerms && referenceLabel && !needsReferenceLocation && (
            <span className="block text-sm font-normal text-muted-foreground mt-1">
              Distances measured from {referenceLabel}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {nearestError && (
          <div className="text-destructive bg-destructive/10 p-3 rounded-md text-sm">{nearestError}</div>
        )}
        {error && (
          <div className="text-destructive bg-destructive/10 p-3 rounded-md">Error: {error}</div>
        )}

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={`fac-skel-${i}`} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!loading && !error && data && visibleFacilities.length === 0 && (
          <p className="text-muted-foreground py-6 text-center">No facilities match these criteria.</p>
        )}

        {!loading && visibleFacilities.length > 0 && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {hasClaimTerms && <TableHead>Match</TableHead>}
                  {hasClaimTerms && <TableHead>Nearest for missing</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Est.</TableHead>
                  <TableHead>Doctors</TableHead>
                  <TableHead>Web</TableHead>
                  <TableHead>FB</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFacilities.map((row) => (
                  <TableRow key={row.unique_id}>
                    <TableCell className="font-medium max-w-[200px]">
                      <div className="truncate" title={hasFieldValue(row.name) ? String(row.name) : undefined}>
                        {formatFieldValue(row.name)}
                      </div>
                      {hasFieldValue(row.procedure) && (
                        <div className="text-xs text-muted-foreground truncate" title={String(row.procedure)}>
                          {formatFieldValue(row.procedure)}
                        </div>
                      )}
                      {row.match_tier === 'claims_only' && hasFieldValue(row.equipment) && (
                        <div className="text-xs text-muted-foreground truncate" title={String(row.equipment)}>
                          {formatFieldValue(row.equipment)}
                        </div>
                      )}
                    </TableCell>
                    {hasClaimTerms && (
                      <TableCell>
                        {isFacilityMatchTier(row.match_tier) ? (
                          <Badge
                            variant={
                              row.match_tier === 'full'
                                ? 'default'
                                : row.match_tier === 'specialty_only'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {FACILITY_MATCH_TIER_LABELS[row.match_tier]}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">{EMPTY_FIELD}</span>
                        )}
                      </TableCell>
                    )}
                    {hasClaimTerms && (
                      <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                        {nearestLoading && row.match_tier !== 'full' ? (
                          <Skeleton className="h-8 w-full" />
                        ) : needsReferenceLocation && row.match_tier !== 'full' ? (
                          'Add city on step 1'
                        ) : row.match_tier === 'specialty_only' && alternates[row.unique_id] ? (
                          formatNearestAlternateLabel(alternates[row.unique_id], claimTermsLabel)
                        ) : row.match_tier === 'claims_only' && alternates[row.unique_id] ? (
                          formatNearestAlternateLabel(alternates[row.unique_id], specialty.display)
                        ) : row.match_tier !== 'full' ? (
                          EMPTY_FIELD
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">{formatFieldValue(row.facility_type_id)}</TableCell>
                    <TableCell className="text-sm">{formatFieldValue(row.operator_type_id)}</TableCell>
                    <TableCell className="text-sm">{formatFieldValue(row.year_established)}</TableCell>
                    <TableCell className="text-sm">{formatFieldValue(row.number_doctors)}</TableCell>
                    <TableCell>
                      <LinkStatusIcon status={row.website_status} />
                    </TableCell>
                    <TableCell>
                      <LinkStatusIcon status={row.facebook_status} />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => onSelect(row.unique_id)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{formatFieldValue(value)}</dd>
    </div>
  );
}

function FacilityDetailStep({
  uniqueId,
  onBack,
  deactivation,
  onDeactivationChanged,
}: {
  uniqueId: string;
  onBack: () => void;
  deactivation: DeactivatedFacility | null;
  onDeactivationChanged: () => void;
}) {
  const { data, loading, error } = useAnalyticsQuery('facility_detail', {
    unique_id: sql.string(uniqueId),
  });

  const facility = data?.[0];
  const isDeactivated = deactivation != null;
  const imrDoctors = useFacilityImrDoctors(uniqueId, facility?.specialties);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{loading ? 'Loading…' : facility?.name ?? 'Facility details'}</CardTitle>
          {isDeactivated && <Badge variant="destructive">Deactivated</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="text-destructive bg-destructive/10 p-3 rounded-md">Error: {error}</div>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && facility && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailField label="Organization type" value={facility.organization_type} />
              <DetailField label="Facility type ID" value={facility.facility_type_id} />
              <DetailField label="Operator type ID" value={facility.operator_type_id} />
              <DetailField label="Year established" value={facility.year_established} />
              <DetailField label="Accepts volunteers" value={facility.accepts_volunteers} />
              <DetailField label="Number of doctors" value={facility.number_doctors} />
              <DetailField label="Capacity" value={facility.capacity} />
              <DetailField label="Area" value={facility.area} />
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-3">Contact</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailField label="Official phone" value={facility.official_phone} />
                <DetailField label="Email" value={facility.email} />
                <DetailField label="Official website" value={facility.official_website} />
                <DetailField label="Facebook" value={facility.facebook_link} />
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-3">Address</h3>
              <p className="text-sm">
                {[
                  facility.address_line1,
                  facility.address_line2,
                  facility.address_line3,
                  facility.address_city,
                  facility.address_state_or_region,
                  facility.address_zip_or_postcode,
                  facility.address_country,
                ]
                  .filter(hasFieldValue)
                  .map((part) => formatFieldValue(part))
                  .join(', ') || EMPTY_FIELD}
              </p>
              {(facility.latitude != null || facility.longitude != null) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {facility.latitude}, {facility.longitude}
                </p>
              )}
            </section>

            <AddressVerificationCard facility={facility} />

            <UnverifiedClaimsCard
              specialties={facility.specialties}
              procedure={facility.procedure}
              capability={facility.capability}
              equipment={facility.equipment}
            />

            <ClaimVerificationCard
              facility={{
                procedure: facility.procedure,
                equipment: facility.equipment,
                capability: facility.capability,
                claim_rule_status: facility.claim_rule_status,
                claim_rule_score: facility.claim_rule_score,
                claim_consistency_status: facility.claim_consistency_status,
                claim_consistency_score: facility.claim_consistency_score,
                claim_consistency_provider: facility.claim_consistency_provider,
                claim_consistency_summary: facility.claim_consistency_summary,
                claim_unsupported_specialties: facility.claim_unsupported_specialties,
                claim_orphan_terms: facility.claim_orphan_terms,
                claim_mismatch_flags: facility.claim_mismatch_flags,
                claim_checked_at: facility.claim_checked_at,
              }}
            />

            {hasFieldValue(facility.description) && (
              <section>
                <h3 className="text-sm font-semibold mb-3">Facility description</h3>
                <p className="text-sm break-words">{formatFieldValue(facility.description)}</p>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold mb-3">Social engagement</h3>
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField
                  label="Social channels"
                  value={facility.distinct_social_media_presence_count}
                />
                <DetailField
                  label="Most recent post"
                  value={facility.post_metrics_most_recent_social_media_post_date}
                />
                <DetailField label="Post count" value={facility.post_metrics_post_count} />
                <DetailField label="Followers" value={facility.engagement_metrics_n_followers} />
                <DetailField label="Likes" value={facility.engagement_metrics_n_likes} />
                <DetailField label="Engagements" value={facility.engagement_metrics_n_engagements} />
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-3">Link validation</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Checks whether a URL responds (HTTP reachability). A working link does not confirm it
                belongs to this facility — e.g. a hospital may point to a government department page.
                Always open the URL and confirm the site matches the facility name and location.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border p-4 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    Website
                    <LinkStatusIcon status={facility.website_status} />
                    <span className="text-muted-foreground font-normal">
                      ({formatFieldValue(facility.website_status)})
                    </span>
                  </div>
                  <DetailField label="Working URL" value={facility.website_working_url} />
                  <DetailField label="Error" value={facility.website_error} />
                  {facility.checked_at && (
                    <p className="text-xs text-muted-foreground">Checked: {facility.checked_at}</p>
                  )}
                </div>
                <div className="rounded-md border p-4 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    Facebook
                    <LinkStatusIcon status={facility.facebook_status} />
                    <span className="text-muted-foreground font-normal">
                      ({formatFieldValue(facility.facebook_status)})
                    </span>
                  </div>
                  <DetailField label="URL" value={facility.facebook_url ?? facility.facebook_link} />
                  <DetailField label="Error" value={facility.facebook_error} />
                </div>
              </div>
            </section>

            <FacilityDetailVerificationSection
              facility={facility}
              isDeactivated={isDeactivated}
              imrDoctorTrustCounts={imrDoctors.trustCounts}
            />

            <ImrLookupCard
              facilityId={uniqueId}
              facilitySpecialties={facility.specialties}
              resolvedStateOrRegion={resolvedAddressField(
                facility.verified_state_or_region,
                facility.address_state_or_region,
              )}
              imrDoctors={imrDoctors}
            />
            <DeactivateFacilityCard
              uniqueId={uniqueId}
              facilityName={facility.name}
              deactivation={deactivation}
              onChanged={onDeactivationChanged}
            />
          </>
        )}

        <div className="flex justify-start pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to list
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FacilitiesPage() {
  const [step, setStep] = useState<StepId>(1);
  const [criteria, setCriteria] = useState<FacilitySearchCriteria>(emptySearchCriteria());
  const [selectedSpecialty, setSelectedSpecialty] = useState<SelectedSpecialty | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [listBackStep, setListBackStep] = useState<1 | 2>(2);
  const { deactivatedIds, getDeactivation, refresh: refreshDeactivations } = useDeactivatedFacilities();

  return (
    <div className="space-y-4 w-full max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Facility Browser</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Search by region, doctor name, clinic name, or specialty. Location is optional.
        </p>
      </div>

      <StepIndicator
        currentStep={step}
        onStepClick={(nextStep) => {
          if (nextStep === 1) setStep(1);
          if (nextStep === 2) setStep(2);
          if (nextStep === 3 && selectedSpecialty) setStep(3);
          if (nextStep === 4 && selectedFacilityId) setStep(4);
        }}
      />

      {step === 1 && (
        <SearchStep
          criteria={criteria}
          onChange={setCriteria}
          onNext={() => {
            setListBackStep(2);
            setStep(2);
          }}
          onSkipLocation={() => {
            setListBackStep(2);
            setStep(2);
          }}
          onAiSelectSpecialty={(specialty) => {
            setSelectedSpecialty(specialty);
            setListBackStep(1);
            setStep(3);
          }}
          onAiSelectFacility={(uniqueId) => {
            setSelectedFacilityId(uniqueId);
            setStep(4);
          }}
        />
      )}

      {step === 2 && (
        <SpecialtiesStep
          criteria={criteria}
          onSelect={(specialty) => {
            setSelectedSpecialty(specialty);
            setListBackStep(2);
            setStep(3);
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && selectedSpecialty && (
        <FacilityListStep
          criteria={criteria}
          specialty={selectedSpecialty}
          deactivatedIds={deactivatedIds}
          onSelect={(id) => {
            setSelectedFacilityId(id);
            setStep(4);
          }}
          onBack={() => setStep(listBackStep)}
        />
      )}

      {step === 4 && selectedFacilityId && (
        <FacilityDetailStep
          uniqueId={selectedFacilityId}
          deactivation={getDeactivation(selectedFacilityId)}
          onDeactivationChanged={() => void refreshDeactivations()}
          onBack={() => setStep(selectedSpecialty ? 3 : 1)}
        />
      )}
    </div>
  );
}
