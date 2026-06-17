import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { AlertTriangle, ExternalLink, Save, Search, Trash2 } from 'lucide-react';
import { STATE_MEDICAL_COUNCILS, getSmcIdByStateRegion } from '../../../../../shared/smc-councils';
import type { AdditionalQualification, FacilityImrDoctorRecord } from '../../../../../shared/imr-doctor-record';
import { doctorMatchesFacilitySpecialties } from '../../../../../shared/imr-specialty-match';
import { parseDedupedClaimList } from '../../../../../shared/parse-claim-list';
import { useFacilityImrDoctors } from '../use-facility-imr-doctors';

type FacilityImrDoctorsState = ReturnType<typeof useFacilityImrDoctors>;

type LookupMode = 'registration' | 'name';

interface ImrDoctor {
  doctorId: string;
  registrationNumber: string;
  smcId: number;
  smcName: string;
  doctorName: string;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  qualification: string | null;
  qualificationYear: number | null;
  yearOfRegistration: number | null;
  registrationDate: string | null;
  permanentAddress: string | null;
  additionalQualifications: AdditionalQualification[];
  profileUrl: string;
  blacklisted: boolean;
  removedStatus: boolean;
  checkedAt: string;
}

interface ImrDoctorSummary {
  doctorId: string;
  registrationNumber: string;
  smcId: number | null;
  smcName: string;
  doctorName: string;
  fatherName: string | null;
  yearOfRegistration: number | null;
}

interface ImrLookupResponse {
  doctor: ImrDoctor;
  links: { imr: string; blacklist: string };
  disclaimer: string;
}

interface ImrNameSearchResponse {
  doctors: ImrDoctorSummary[];
  total: number;
  truncated: boolean;
  disclaimer: string;
  error?: string;
}

interface ImrLookupCardProps {
  facilityId: string;
  facilitySpecialties?: unknown;
  resolvedStateOrRegion?: string | null;
  imrDoctors: FacilityImrDoctorsState;
}

function formatDoctorName(record: FacilityImrDoctorRecord): string {
  return [record.firstName, record.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
}

function formatAdditionalQualifications(qualifications: AdditionalQualification[]): string {
  if (qualifications.length === 0) return '—';
  return qualifications
    .map((entry) => (entry.year != null ? `${entry.qualification} (${entry.year})` : entry.qualification))
    .join('; ');
}

export function ImrLookupCard({
  facilityId,
  facilitySpecialties,
  resolvedStateOrRegion,
  imrDoctors,
}: ImrLookupCardProps) {
  const { records, loading: savedLoading, saveDoctor, removeDoctor } = imrDoctors;
  const facilitySpecialtyList = parseDedupedClaimList(facilitySpecialties);
  const hasFacilitySpecialties = facilitySpecialtyList.length > 0;
  const suggestedSmcId = getSmcIdByStateRegion(resolvedStateOrRegion);

  const [mode, setMode] = useState<LookupMode>('registration');
  const [smcId, setSmcId] = useState<string>('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ImrLookupResponse | null>(null);
  const [nameResults, setNameResults] = useState<ImrNameSearchResponse | null>(null);

  useEffect(() => {
    if (suggestedSmcId != null) {
      setSmcId(String(suggestedSmcId));
    } else {
      setSmcId('');
    }
  }, [facilityId, suggestedSmcId]);

  useEffect(() => {
    setSaveMessage(null);
  }, [result]);

  const resetResults = () => {
    setError(null);
    setResult(null);
    setNameResults(null);
    setSaveMessage(null);
  };

  const isAlreadySaved = (doctor: ImrDoctor): boolean =>
    records.some(
      (record) =>
        record.registrationNumber === doctor.registrationNumber && record.smcId === doctor.smcId,
    );

  const handleLookup = async (override?: { smcId: number; registrationNumber: string }) => {
    const lookupSmcId = override?.smcId ?? Number.parseInt(smcId, 10);
    const lookupRegNo = override?.registrationNumber ?? registrationNumber.trim();

    if (!lookupSmcId || lookupRegNo === '') {
      setError('State Medical Council and registration number are required');
      return;
    }

    setLoading(true);
    resetResults();

    try {
      const response = await fetch('/api/imr/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smcId: lookupSmcId,
          registrationNumber: lookupRegNo,
        }),
      });

      const payload = (await response.json()) as ImrLookupResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'IMR lookup failed');
      }

      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'IMR lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNameSearch = async () => {
    const trimmed = doctorName.trim();
    if (trimmed.length < 3) {
      setError('Enter at least 3 characters of the doctor name');
      return;
    }

    setLoading(true);
    resetResults();

    try {
      const body: Record<string, unknown> = { name: trimmed };
      if (smcId) {
        body.smcId = Number.parseInt(smcId, 10);
      }

      const response = await fetch('/api/imr/search-by-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as ImrNameSearchResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? 'IMR name search failed');
      }

      setNameResults(payload);
      if (payload.doctors.length === 0) {
        setError('No doctors found for this name');
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'Failed to fetch'
          ? 'Could not reach the app server — check your connection and try again'
          : err instanceof Error
            ? err.message
            : 'IMR name search failed',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDoctor = (doctor: ImrDoctorSummary) => {
    if (doctor.smcId == null) {
      setError('Could not resolve State Medical Council for this result — try registration lookup instead');
      return;
    }
    setSmcId(String(doctor.smcId));
    setRegistrationNumber(doctor.registrationNumber);
    void handleLookup({ smcId: doctor.smcId, registrationNumber: doctor.registrationNumber });
  };

  const handleSaveDoctor = async () => {
    if (!result) return;

    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      await saveDoctor({
        doctorId: result.doctor.doctorId,
        firstName: result.doctor.firstName,
        lastName: result.doctor.lastName,
        doctorName: result.doctor.doctorName,
        yearOfRegistration: result.doctor.yearOfRegistration,
        registrationNumber: result.doctor.registrationNumber,
        smcId: result.doctor.smcId,
        smcName: result.doctor.smcName,
        qualification: result.doctor.qualification,
        qualificationYear: result.doctor.qualificationYear,
        additionalQualifications: result.doctor.additionalQualifications,
        blacklisted: result.doctor.blacklisted,
        lookedUpAt: result.doctor.checkedAt,
      });
      setSaveMessage('Doctor saved to this facility record.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save doctor');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDoctor = async (id: number) => {
    setRemovingId(id);
    setError(null);
    try {
      await removeDoctor(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove doctor');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Credential verification (NMC IMR)
          <Badge variant="secondary">Manual lookup</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Search the Indian Medical Register by registration number or doctor name. Save verified
          clinicians to this facility so they appear on future visits. Credentialing trust points
          apply only when a saved doctor&apos;s qualification matches this facility&apos;s listed
          specialty (for example, ophthalmology at an eye hospital). For name search, use{' '}
          <span className="font-medium text-foreground">surname only</span> — NMC rejects names with
          spaces or a &quot;Dr&quot; prefix.
        </p>

        {savedLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="rounded-md border p-4 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Doctors on record for this facility</p>
              <Badge variant="outline">{records.length}</Badge>
            </div>
            {records.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No IMR lookups saved yet. Search below and use &quot;Save to facility&quot; after a
                successful lookup.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Reg. no.</th>
                      <th className="py-2 pr-3">Council</th>
                      <th className="py-2 pr-3">Qualification</th>
                      <th className="py-2 pr-3">Reg. year</th>
                      <th className="py-2 pr-3">Saved</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <span>{formatDoctorName(record)}</span>
                            {record.blacklisted && (
                              <Badge variant="destructive" className="text-[10px]">
                                Flagged
                              </Badge>
                            )}
                            {!record.blacklisted && hasFacilitySpecialties &&
                              doctorMatchesFacilitySpecialties(record, facilitySpecialties) && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Specialty match
                                </Badge>
                              )}
                            {!record.blacklisted && hasFacilitySpecialties &&
                              !doctorMatchesFacilitySpecialties(record, facilitySpecialties) && (
                                <Badge variant="outline" className="text-[10px]">
                                  No specialty match
                                </Badge>
                              )}
                          </div>
                        </td>
                        <td className="py-2 pr-3">{record.registrationNumber}</td>
                        <td className="py-2 pr-3">{record.smcName}</td>
                        <td className="py-2 pr-3">
                          <div>{record.qualification ?? '—'}</div>
                          {record.additionalQualifications.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {formatAdditionalQualifications(record.additionalQualifications)}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3">{record.yearOfRegistration ?? '—'}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {new Date(record.lookedUpAt).toLocaleString()}
                        </td>
                        <td className="py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={removingId === record.id}
                            onClick={() => void handleRemoveDoctor(record.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'registration' ? undefined : 'outline'}
            onClick={() => {
              setMode('registration');
              resetResults();
            }}
          >
            By registration number
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'name' ? undefined : 'outline'}
            onClick={() => {
              setMode('name');
              resetResults();
            }}
          >
            By doctor name
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="imr-smc">
              State Medical Council{mode === 'name' ? ' (recommended)' : ''}
            </Label>
            <Select value={smcId} onValueChange={setSmcId}>
              <SelectTrigger id="imr-smc">
                <SelectValue placeholder={mode === 'name' ? 'All councils (optional)' : 'Select council'} />
              </SelectTrigger>
              <SelectContent>
                {STATE_MEDICAL_COUNCILS.map((council) => (
                  <SelectItem key={council.id} value={String(council.id)}>
                    {council.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suggestedSmcId != null && resolvedStateOrRegion?.trim() && (
              <p className="text-xs text-muted-foreground">
                Pre-selected from resolved state/region: {resolvedStateOrRegion.trim()}
              </p>
            )}
          </div>

          {mode === 'registration' ? (
            <div className="space-y-2">
              <Label htmlFor="imr-reg">Registration number</Label>
              <Input
                id="imr-reg"
                placeholder="e.g. 3608"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="imr-name">Doctor name</Label>
              <Input
                id="imr-name"
                placeholder="Surname only, e.g. Jagtap"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void (mode === 'registration' ? handleLookup() : handleNameSearch())}
            disabled={
              loading ||
              (mode === 'registration'
                ? !smcId || registrationNumber.trim() === ''
                : doctorName.trim().length < 3)
            }
          >
            <Search className="h-4 w-4 mr-2" />
            {loading ? 'Searching…' : mode === 'registration' ? 'Lookup IMR' : 'Search by name'}
          </Button>
          <Button variant="outline" asChild>
            <a href="https://www.nmc.org.in/information-desk/indian-medical-register/" target="_blank" rel="noreferrer">
              Open NMC IMR
              <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        </div>

        {error && (
          <div className="text-destructive bg-destructive/10 p-3 rounded-md text-sm">{error}</div>
        )}

        {saveMessage && (
          <div className="text-sm bg-primary/10 text-primary p-3 rounded-md">{saveMessage}</div>
        )}

        {nameResults && nameResults.doctors.length > 0 && (
          <div className="rounded-md border p-4 space-y-3 text-sm">
            <p className="text-muted-foreground">
              {nameResults.total} match{nameResults.total === 1 ? '' : 'es'}
              {nameResults.truncated ? ' (showing first page — narrow with SMC)' : ''}. Select a row
              to load full IMR details.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Reg. no.</th>
                    <th className="py-2 pr-3">Council</th>
                    <th className="py-2 pr-3">Year</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {nameResults.doctors.map((doctor) => (
                    <tr key={`${doctor.doctorId}-${doctor.registrationNumber}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div>{doctor.doctorName}</div>
                        {doctor.fatherName && (
                          <div className="text-xs text-muted-foreground">{doctor.fatherName}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">{doctor.registrationNumber}</td>
                      <td className="py-2 pr-3">{doctor.smcName}</td>
                      <td className="py-2 pr-3">{doctor.yearOfRegistration ?? '—'}</td>
                      <td className="py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={loading}
                          onClick={() => handleSelectDoctor(doctor)}
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result?.doctor.blacklisted && (
          <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Blacklist alert</p>
              <p>
                This registration appears on the NMC blacklist or removed register. Verify on the{' '}
                <a
                  href={result.links.blacklist}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  NMC blacklist page
                </a>
                .
              </p>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-md border p-4 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-base">{result.doctor.doctorName}</span>
              <Badge variant={result.doctor.blacklisted ? 'destructive' : 'secondary'}>
                {result.doctor.blacklisted ? 'Flagged' : 'Registered'}
              </Badge>
              {isAlreadySaved(result.doctor) && <Badge variant="outline">On record</Badge>}
            </div>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Registration no.</dt>
                <dd>{result.doctor.registrationNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">State Medical Council</dt>
                <dd>{result.doctor.smcName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Qualification</dt>
                <dd>
                  {[result.doctor.qualification, result.doctor.qualificationYear]
                    .filter((value) => value != null && value !== '')
                    .join(' · ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Registration year</dt>
                <dd>
                  {[result.doctor.yearOfRegistration, result.doctor.registrationDate]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </dd>
              </div>
              {result.doctor.additionalQualifications.length > 0 && (
                <div className="md:col-span-2">
                  <dt className="text-xs text-muted-foreground">Additional qualifications</dt>
                  <dd>{formatAdditionalQualifications(result.doctor.additionalQualifications)}</dd>
                </div>
              )}
              <div className="md:col-span-2">
                <dt className="text-xs text-muted-foreground">Permanent address (IMR)</dt>
                <dd>{result.doctor.permanentAddress ?? '—'}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={result.doctor.profileUrl} target="_blank" rel="noreferrer">
                  View on NMC
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
              <Button
                size="sm"
                disabled={saving || isAlreadySaved(result.doctor)}
                onClick={() => void handleSaveDoctor()}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving
                  ? 'Saving…'
                  : isAlreadySaved(result.doctor)
                    ? 'Saved to facility'
                    : 'Save to facility'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {result.disclaimer} Checked {new Date(result.doctor.checkedAt).toLocaleString()}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
