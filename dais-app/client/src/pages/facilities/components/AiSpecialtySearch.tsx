import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Skeleton,
  Textarea,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { formatClaimTermsLabel } from '../../../../../shared/claim-search';
import { hasReferenceLocation } from '../../../../../shared/reference-location';
import {
  buildSpecialtySearchGuidance,
  facilityNameMatchScore,
  parseFacilityQuery,
  shouldPrioritizeFacilitySearch,
} from '../../../../../shared/search-query-intent';
import {
  hasLocationCriteria,
  toFilterParams,
  toLocationParams,
  type FacilitySearchCriteria,
} from '../facility-search';

export interface AiSpecialtyMatch {
  canonical: string;
  display: string;
  score: number;
  reason: string;
  claimTerms?: string[];
}

interface FacilityTextMatch {
  unique_id: string;
  name: string;
  city?: string | null;
  state_or_region?: string | null;
  matchScore?: number;
}

interface SpecialtyRegionRow {
  state_or_region: string;
  facility_count: number | string;
}

interface AiSpecialtySearchProps {
  criteria: FacilitySearchCriteria;
  onCriteriaChange: (criteria: FacilitySearchCriteria) => void;
  onSelectSpecialty: (match: AiSpecialtyMatch) => void;
  onSelectFacility: (uniqueId: string) => void;
}

interface ActiveFacilitySearch {
  text: string;
  criteria: FacilitySearchCriteria;
  parsedCity: string;
  parsedState: string;
  searchKey: string;
}

function facilitySearchKey(text: string, criteria: FacilitySearchCriteria): string {
  return JSON.stringify({
    text: text.trim(),
    zip: criteria.zip.trim(),
    city: criteria.city.trim(),
    state: criteria.state.trim(),
    countryCode: criteria.countryCode.trim(),
  });
}

function scoreFacilityResult(
  searchText: string,
  row: FacilityTextMatch,
  parsedCity: string,
  parsedState: string,
): number {
  let score = facilityNameMatchScore(searchText, row.name ?? '');
  if (parsedCity) {
    const city = (row.city ?? '').toLowerCase();
    const needle = parsedCity.toLowerCase();
    if (city && (city.includes(needle) || needle.includes(city))) {
      score += 0.12;
    }
  }
  if (parsedState) {
    const state = (row.state_or_region ?? '').toLowerCase();
    const needle = parsedState.toLowerCase();
    if (state && (state.includes(needle) || needle.includes(state))) {
      score += 0.08;
    }
  }
  return score;
}

function isAbortedAnalyticsError(error: string | null): boolean {
  return error != null && /aborted/i.test(error);
}

function formatAnalyticsSearchError(error: string): string {
  if (isAbortedAnalyticsError(error)) {
    return 'Search was interrupted — please try again.';
  }
  return error;
}

function facilitySqlParamsKey(text: string, criteria: FacilitySearchCriteria): string {
  return facilitySearchKey(text, criteria);
}

function normalizeSpecialtiesForApi(
  specialties: Array<{
    specialty_canonical: string;
    specialty_display: string;
    facility_count: number;
  }>,
) {
  return specialties.map((row) => ({
    specialty_canonical: String(row.specialty_canonical ?? '').trim(),
    specialty_display: String(row.specialty_display ?? '').trim(),
    facility_count: row.facility_count,
  }));
}

export function AiSpecialtySearch({
  criteria,
  onCriteriaChange,
  onSelectSpecialty,
  onSelectFacility,
}: AiSpecialtySearchProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<AiSpecialtyMatch[]>([]);
  const [facilityMatches, setFacilityMatches] = useState<FacilityTextMatch[]>([]);
  const [claimTerms, setClaimTerms] = useState<string[]>([]);
  const [source, setSource] = useState<'openai' | 'rules' | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [regionSpecialty, setRegionSpecialty] = useState('');
  const [activeFacilitySearch, setActiveFacilitySearch] = useState<ActiveFacilitySearch | null>(null);
  const [awaitingFacilityResults, setAwaitingFacilityResults] = useState(false);
  const [catalogRequested, setCatalogRequested] = useState(false);
  const facilityFetchStartedRef = useRef(false);
  const pendingFacilitySearchKeyRef = useRef<string | null>(null);
  const facilitySearchGenerationRef = useRef(0);
  const lastFacilitySqlParamsKeyRef = useRef('');
  const pendingCriteriaSyncRef = useRef<FacilitySearchCriteria | null>(null);

  const hasLocation = hasLocationCriteria(criteria);
  const filterParams = useMemo(() => toFilterParams(criteria), [criteria]);
  const facilitySearchParams = useMemo(() => {
    if (!activeFacilitySearch) {
      return {
        search_text: sql.string(''),
        ...toLocationParams(criteria),
      };
    }

    return {
      search_text: sql.string(activeFacilitySearch.text),
      ...toLocationParams(activeFacilitySearch.criteria),
    };
  }, [activeFacilitySearch, criteria]);

  const { data: specialties, loading: specialtiesLoading, error: specialtiesError } = useAnalyticsQuery(
    'facility_specialties_in_area',
    filterParams,
    { autoStart: catalogRequested },
  );

  const { data: facilityHits, loading: facilityHitsLoading, error: facilityHitsError } = useAnalyticsQuery(
    'facility_search_by_text',
    facilitySearchParams,
    { autoStart: activeFacilitySearch != null && activeFacilitySearch.text.trim().length >= 3 },
  );

  const { data: specialtyRegions, loading: regionsLoading } = useAnalyticsQuery(
    'facility_specialty_regions',
    { specialty_canonical: sql.string(regionSpecialty) },
    { autoStart: regionSpecialty.trim() !== '' && !hasLocation },
  );

  useEffect(() => {
    if (!awaitingFacilityResults || !activeFacilitySearch) {
      if (!facilityHitsLoading) {
        facilityFetchStartedRef.current = false;
      }
      return;
    }

    const expectedKey = activeFacilitySearch.searchKey;
    if (pendingFacilitySearchKeyRef.current !== expectedKey) {
      return;
    }

    const sqlParamsKey = facilitySqlParamsKey(activeFacilitySearch.text, activeFacilitySearch.criteria);
    const sqlParamsChanged = sqlParamsKey !== lastFacilitySqlParamsKeyRef.current;
    if (sqlParamsChanged) {
      lastFacilitySqlParamsKeyRef.current = sqlParamsKey;
    }

    if (facilityHitsLoading) {
      facilityFetchStartedRef.current = true;
      return;
    }

    if (!facilityFetchStartedRef.current) {
      if (sqlParamsChanged) {
        return;
      }
      if (facilityHits == null && facilityHitsError == null) {
        return;
      }
      facilityFetchStartedRef.current = true;
    }

    facilityFetchStartedRef.current = false;
    pendingFacilitySearchKeyRef.current = null;
    setAwaitingFacilityResults(false);
    setLoading(false);

    if (facilityHitsError) {
      if (isAbortedAnalyticsError(facilityHitsError)) {
        facilityFetchStartedRef.current = false;
        pendingFacilitySearchKeyRef.current = null;
        setAwaitingFacilityResults(false);
        setLoading(false);
        return;
      }
      setError(formatAnalyticsSearchError(facilityHitsError));
      return;
    }

    const searchText = activeFacilitySearch.text;
    const ranked = ((facilityHits ?? []) as FacilityTextMatch[])
      .map((row) => ({
        ...row,
        matchScore: scoreFacilityResult(
          searchText,
          row,
          activeFacilitySearch.parsedCity,
          activeFacilitySearch.parsedState,
        ),
      }))
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    setFacilityMatches(ranked);

    if (ranked.length > 0 && (ranked[0].matchScore ?? 0) >= 0.9) {
      setGuidance('Exact facility match found — open it below.');
      setMatches([]);
      setClaimTerms([]);
      if (pendingCriteriaSyncRef.current) {
        onCriteriaChange(pendingCriteriaSyncRef.current);
        pendingCriteriaSyncRef.current = null;
      }
      return;
    }

    if (ranked.length > 0) {
      setGuidance('Select a facility below, or refine your search.');
      if (pendingCriteriaSyncRef.current) {
        onCriteriaChange(pendingCriteriaSyncRef.current);
        pendingCriteriaSyncRef.current = null;
      }
      return;
    }

    setError(
      'No facility matched that name. Try the full clinic name, or add only the city in the location fields above.',
    );
    pendingCriteriaSyncRef.current = null;
  }, [
    activeFacilitySearch,
    awaitingFacilityResults,
    facilityHits,
    facilityHitsError,
    facilityHitsLoading,
    onCriteriaChange,
  ]);

  const parsedPreview = useMemo(() => parseFacilityQuery(query), [query]);
  const canSearch = query.trim().length >= 2 && !loading && !awaitingFacilityResults;

  const runSearch = async () => {
    if (query.trim().length < 2) {
      setError('Describe what you need in at least a few characters.');
      return;
    }

    const parsed = parseFacilityQuery(query);
    const facilityText = parsed.facilitySearchText;
    const searchCriteria: FacilitySearchCriteria = {
      ...criteria,
      city: criteria.city || parsed.city,
      state: criteria.state || parsed.state,
    };
    const sqlCriteria: FacilitySearchCriteria = {
      ...criteria,
    };

    pendingCriteriaSyncRef.current =
      (parsed.city || parsed.state) && !hasLocationCriteria(criteria) ? searchCriteria : null;

    setRegionSpecialty('');
    setMatches([]);
    setFacilityMatches([]);
    setClaimTerms([]);
    setSource(null);
    setGuidance(null);
    setError(null);
    setLoading(true);

    const prioritizeFacility = shouldPrioritizeFacilitySearch(parsed.intent);
    let waitForFacility = false;

    try {
      if (prioritizeFacility && facilityText) {
        waitForFacility = true;
        facilityFetchStartedRef.current = false;
        facilitySearchGenerationRef.current += 1;
        const nextSearch: ActiveFacilitySearch = {
          text: facilityText,
          criteria: sqlCriteria,
          parsedCity: criteria.city ? '' : parsed.city,
          parsedState: criteria.state ? '' : parsed.state,
          searchKey: `${facilitySearchKey(facilityText, sqlCriteria)}#${facilitySearchGenerationRef.current}`,
        };
        pendingFacilitySearchKeyRef.current = nextSearch.searchKey;
        setActiveFacilitySearch(nextSearch);
        setAwaitingFacilityResults(true);
        return;
      }

      setCatalogRequested(true);

      if (specialtiesLoading) {
        setError('Specialty catalog is still loading — try again in a moment.');
        return;
      }

      if (specialtiesError) {
        setError(`Could not load specialties: ${specialtiesError}`);
        return;
      }

      if (!specialties || specialties.length === 0) {
        setError('No specialties found. Try a clinic/doctor name or broaden location filters.');
        return;
      }

      const normalizedSpecialties = normalizeSpecialtiesForApi(specialties).filter(
        (row) => row.specialty_canonical !== '' && row.specialty_display !== '',
      );

      if (normalizedSpecialties.length === 0) {
        setError('No valid specialties loaded. Try a clinic or doctor name instead.');
        return;
      }

      const response = await fetch('/api/search/match-specialty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          specialties: normalizedSpecialties,
          hasLocation: hasLocationCriteria(searchCriteria),
        }),
      });

      const payload = (await response.json()) as {
        matches?: AiSpecialtyMatch[];
        claimTerms?: string[];
        source?: 'openai' | 'rules';
        guidance?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'AI search failed');
      }

      const terms = payload.claimTerms ?? [];
      const nextMatches = (payload.matches ?? []).map((match) => ({
        ...match,
        claimTerms: terms,
      }));
      setClaimTerms(terms);
      setMatches(nextMatches);
      setSource(payload.source ?? 'rules');
      if (nextMatches.length > 0 && !hasLocationCriteria(searchCriteria)) {
        setRegionSpecialty(nextMatches[0].canonical);
      }

      const mergedGuidance =
        buildSpecialtySearchGuidance({
          hasLocation: hasLocationCriteria(searchCriteria),
          intent: parsed.intent,
          specialtyMatched: nextMatches.length > 0,
          facilityMatches: 0,
        }) ?? payload.guidance ?? null;
      setGuidance(mergedGuidance);

      if (nextMatches.length === 0) {
        setError('No matching specialty found. Try a clinic/doctor name or use step 2.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI search failed');
    } finally {
      if (!waitForFacility) {
        setLoading(false);
      }
    }
  };

  const showFacilityLoading = loading || awaitingFacilityResults || facilityHitsLoading;

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Describe what you&apos;re looking for
          </CardTitle>
          {catalogRequested && (
            <Badge variant="secondary" className="font-normal gap-1">
              {specialtiesLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading specialties…
                </>
              ) : specialtiesError ? (
                'Specialty catalog unavailable'
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  {specialties?.length ?? 0} specialties
                </>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Clinic or doctor searches work without location. Example:{' '}
          <span className="font-medium">Dr Verma Eye Hospital, Durg</span>
        </p>

        {hasLocation && !hasReferenceLocation(criteria) && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Add a city for better nearest-facility distance estimates when matching procedures or equipment.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="ai-search-query">Doctor, clinic, specialty, or procedure</Label>
          <Textarea
            id="ai-search-query"
            placeholder='e.g. "Dr Verma Eye Hospital, Durg" or "cardiology and MRI"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
          />
          {parsedPreview.facilitySearchText && (
            <p className="text-xs text-muted-foreground">
              Will search facilities for: <span className="font-medium">{parsedPreview.facilitySearchText}</span>
              {parsedPreview.city ? ` (near ${parsedPreview.city})` : ''}
            </p>
          )}
        </div>

        <Button onClick={() => void runSearch()} disabled={!canSearch}>
          {showFacilityLoading ? 'Searching…' : 'Search'}
        </Button>

        {claimTerms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Procedure/equipment filter: {formatClaimTermsLabel(claimTerms)} (facility-reported, unverified)
          </p>
        )}

        {guidance && (
          <p className="text-sm rounded-md border bg-muted/40 p-3 text-muted-foreground">{guidance}</p>
        )}

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</p>
        )}

        {showFacilityLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <p className="text-xs text-muted-foreground">Looking up facility names…</p>
          </div>
        )}

        {!showFacilityLoading && facilityMatches.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Matching facilities</h4>
            {facilityMatches.map((row) => {
              const isExact = (row.matchScore ?? 0) >= 0.9;
              return (
                <div
                  key={row.unique_id}
                  className={`rounded-md border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                    isExact ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{row.name}</div>
                      {isExact && <Badge>Exact match</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[row.city, row.state_or_region].filter(Boolean).join(', ') || 'Location not listed'}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => onSelectFacility(row.unique_id)}>
                    View facility
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {!showFacilityLoading && matches.length > 0 && (
          <div className="space-y-3">
            {source && (
              <h4 className="text-sm font-semibold">
                Matched specialties ({source === 'openai' ? 'AI + catalog' : 'keyword rules'})
              </h4>
            )}
            {matches.map((match) => (
              <div
                key={match.canonical}
                className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <div className="font-medium">{match.display}</div>
                  <div className="text-xs text-muted-foreground">{match.reason}</div>
                  <Badge variant="secondary" className="mt-2">
                    {Math.round(match.score * 100)}% match
                  </Badge>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    onSelectSpecialty({
                      canonical: match.canonical,
                      display: match.display,
                      score: match.score,
                      reason: match.reason,
                      claimTerms: match.claimTerms,
                    })
                  }
                >
                  {hasLocation ? 'View facilities' : 'View facilities (nationwide)'}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!showFacilityLoading && !hasLocation && regionSpecialty && (specialtyRegions?.length ?? 0) > 0 && (
          <div className="space-y-2 rounded-md border p-3">
            <h4 className="text-sm font-semibold">Where this specialty is reported</h4>
            <p className="text-xs text-muted-foreground">
              Select a state/region to filter facilities, then search again.
            </p>
            {regionsLoading && <Skeleton className="h-8 w-full" />}
            <div className="flex flex-wrap gap-2">
              {(specialtyRegions as SpecialtyRegionRow[]).map((row) => (
                <Button
                  key={row.state_or_region}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onCriteriaChange({
                      ...criteria,
                      state: row.state_or_region === 'Unknown region' ? '' : row.state_or_region,
                    })
                  }
                >
                  {row.state_or_region} ({row.facility_count})
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
