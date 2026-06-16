import type { FacilityImrDoctorRecord } from './imr-doctor-record';
import {
  collectDoctorQualifications,
  qualificationMatchesSpecialty,
} from './imr-specialty-match';
import { normalizeForMatch } from './name-match';
import { parseDedupedClaimList } from './parse-claim-list';

export type HighAcuitySpecialtyId =
  | 'icu'
  | 'maternity'
  | 'emergency'
  | 'oncology'
  | 'trauma'
  | 'nicu';

export type HighAcuityVerificationStatus =
  | 'verified'
  | 'partial'
  | 'unverified'
  | 'not_claimed';

export type HighAcuityEvidenceSource = 'specialty' | 'claims' | 'imr';

export interface HighAcuitySpecialtyDefinition {
  id: HighAcuitySpecialtyId;
  label: string;
  specialtyKeywords: string[];
  claimKeywords: string[];
  imrSpecialtyTerms: string[];
}

export const HIGH_ACUITY_SPECIALTIES: HighAcuitySpecialtyDefinition[] = [
  {
    id: 'icu',
    label: 'ICU',
    specialtyKeywords: [
      'icu',
      'intensive care',
      'critical care',
      'intensive care unit',
      'critical care unit',
    ],
    claimKeywords: [
      'icu',
      'intensive care',
      'critical care',
      'ventilator',
      'life support',
      'icu bed',
    ],
    imrSpecialtyTerms: ['critical care', 'intensive care', 'anaesthesiology'],
  },
  {
    id: 'maternity',
    label: 'Maternity',
    specialtyKeywords: [
      'maternity',
      'obstetric',
      'obstetrics',
      'gynaecology',
      'gynecology',
      'maternal',
      'antenatal',
      'prenatal',
      'labour',
      'labor',
    ],
    claimKeywords: [
      'maternity',
      'labour room',
      'labor room',
      'delivery suite',
      'delivery room',
      'obstetric',
      'caesarean',
      'cesarean',
      'c section',
    ],
    imrSpecialtyTerms: ['obstetrics', 'gynaecology', 'gynecology'],
  },
  {
    id: 'emergency',
    label: 'Emergency',
    specialtyKeywords: [
      'emergency',
      'casualty',
      'accident and emergency',
      'accident emergency',
      'emergency medicine',
      'emergency department',
    ],
    claimKeywords: [
      'emergency',
      'casualty',
      'triage',
      'ambulance',
      '24 hour emergency',
      '24x7 emergency',
      'emergency department',
      'accident ward',
    ],
    imrSpecialtyTerms: ['emergency medicine', 'emergency'],
  },
  {
    id: 'oncology',
    label: 'Oncology',
    specialtyKeywords: [
      'oncology',
      'cancer',
      'hemato oncology',
      'haemato oncology',
      'radiation oncology',
      'medical oncology',
      'surgical oncology',
    ],
    claimKeywords: [
      'oncology',
      'chemotherapy',
      'chemo',
      'radiotherapy',
      'radiation therapy',
      'cancer treatment',
      'linear accelerator',
      'pet ct',
    ],
    imrSpecialtyTerms: ['oncology'],
  },
  {
    id: 'trauma',
    label: 'Trauma',
    specialtyKeywords: [
      'trauma',
      'trauma center',
      'trauma centre',
      'orthopaedic trauma',
      'orthopedic trauma',
    ],
    claimKeywords: [
      'trauma',
      'polytrauma',
      'trauma care',
      'trauma center',
      'trauma centre',
      'accident trauma',
    ],
    imrSpecialtyTerms: ['trauma', 'orthopaedic trauma', 'orthopedic trauma'],
  },
  {
    id: 'nicu',
    label: 'NICU',
    specialtyKeywords: [
      'nicu',
      'neonatal',
      'neonatology',
      'neonatal intensive',
      'newborn intensive',
    ],
    claimKeywords: [
      'nicu',
      'neonatal intensive',
      'neonatal icu',
      'incubator',
      'neonatal ventilator',
      'nicu bed',
    ],
    imrSpecialtyTerms: ['neonatology', 'neonatal'],
  },
];

export const HIGH_ACUITY_STATUS_LABELS: Record<HighAcuityVerificationStatus, string> = {
  verified: 'Corroborated by multiple signals',
  partial: 'Single signal only — needs confirmation',
  unverified: 'Claimed but not corroborated',
  not_claimed: 'Not indicated on record',
};

export const HIGH_ACUITY_OVERALL_LABELS: Record<string, string> = {
  ok: 'High-acuity services corroborated',
  weak: 'Some high-acuity claims lack corroboration',
  unverified: 'High-acuity claims not corroborated',
  none: 'No high-acuity services indicated',
};

function normalizedCorpus(values: unknown[]): string {
  return values
    .flatMap((value) => parseDedupedClaimList(value))
    .map((item) => normalizeForMatch(item))
    .filter(Boolean)
    .join(' ');
}

function matchesKeywords(corpus: string, keywords: string[]): string[] {
  if (!corpus) return [];
  return keywords.filter((keyword) => {
    const normalized = normalizeForMatch(keyword);
    return normalized.length > 0 && corpus.includes(normalized);
  });
}

function doctorMatchesHighAcuitySpecialty(
  doctor: Pick<FacilityImrDoctorRecord, 'qualification' | 'additionalQualifications' | 'blacklisted'>,
  definition: HighAcuitySpecialtyDefinition,
): boolean {
  if (doctor.blacklisted) return false;

  const qualifications = collectDoctorQualifications(doctor);
  if (qualifications.length === 0) return false;

  for (const term of definition.imrSpecialtyTerms) {
    for (const qualification of qualifications) {
      if (qualificationMatchesSpecialty(qualification, term)) {
        return true;
      }
    }
  }

  return false;
}

export interface HighAcuitySpecialtyResult {
  id: HighAcuitySpecialtyId;
  label: string;
  claimed: boolean;
  status: HighAcuityVerificationStatus;
  evidence: HighAcuityEvidenceSource[];
  matchedTerms: string[];
}

export interface HighAcuityVerificationResult {
  overallStatus: 'ok' | 'weak' | 'unverified' | 'none';
  overallLabel: string;
  claimedCount: number;
  verifiedCount: number;
  partialCount: number;
  specialties: HighAcuitySpecialtyResult[];
}

function resolveSpecialtyStatus(
  claimed: boolean,
  evidence: HighAcuityEvidenceSource[],
): HighAcuityVerificationStatus {
  if (!claimed) return 'not_claimed';
  if (evidence.length >= 2) return 'verified';
  if (evidence.length === 1) return 'partial';
  return 'unverified';
}

export function resolveHighAcuitySpecialtyVerification(input: {
  specialties?: unknown;
  procedure?: unknown;
  equipment?: unknown;
  capability?: unknown;
  description?: string | null;
  imrDoctors?: Pick<
    FacilityImrDoctorRecord,
    'qualification' | 'additionalQualifications' | 'blacklisted'
  >[];
}): HighAcuityVerificationResult {
  const specialtyCorpus = normalizedCorpus([input.specialties]);
  const claimCorpus = normalizedCorpus([
    input.procedure,
    input.equipment,
    input.capability,
    input.description,
  ]);
  const doctors = input.imrDoctors ?? [];

  const specialties = HIGH_ACUITY_SPECIALTIES.map((definition) => {
    const specialtyMatches = matchesKeywords(specialtyCorpus, definition.specialtyKeywords);
    const claimMatches = matchesKeywords(claimCorpus, definition.claimKeywords);
    const imrMatch = doctors.some((doctor) => doctorMatchesHighAcuitySpecialty(doctor, definition));

    const evidence: HighAcuityEvidenceSource[] = [];
    if (specialtyMatches.length > 0) evidence.push('specialty');
    if (claimMatches.length > 0) evidence.push('claims');
    if (imrMatch) evidence.push('imr');

    const claimed = specialtyMatches.length > 0 || claimMatches.length > 0;
    const matchedTerms = [...new Set([...specialtyMatches, ...claimMatches])];

    return {
      id: definition.id,
      label: definition.label,
      claimed,
      status: resolveSpecialtyStatus(claimed, evidence),
      evidence,
      matchedTerms,
    };
  });

  const claimed = specialties.filter((item) => item.claimed);
  const verifiedCount = claimed.filter((item) => item.status === 'verified').length;
  const partialCount = claimed.filter((item) => item.status === 'partial').length;

  let overallStatus: HighAcuityVerificationResult['overallStatus'];
  if (claimed.length === 0) {
    overallStatus = 'none';
  } else if (verifiedCount === claimed.length) {
    overallStatus = 'ok';
  } else if (verifiedCount > 0) {
    overallStatus = 'weak';
  } else {
    overallStatus = 'unverified';
  }

  return {
    overallStatus,
    overallLabel: HIGH_ACUITY_OVERALL_LABELS[overallStatus],
    claimedCount: claimed.length,
    verifiedCount,
    partialCount,
    specialties,
  };
}

/** Trust score bonus (0–5) for corroborated high-acuity service claims. */
export function highAcuityServicesScore(verification: HighAcuityVerificationResult): number {
  if (verification.claimedCount === 0) return 0;

  if (verification.verifiedCount === verification.claimedCount && verification.verifiedCount >= 2) {
    return 5;
  }
  if (verification.verifiedCount >= 1) return 3;
  if (verification.partialCount >= 1) return 2;
  return 0;
}

export function countImrDoctorsMatchingHighAcuity(
  doctors: Pick<
    FacilityImrDoctorRecord,
    'qualification' | 'additionalQualifications' | 'blacklisted'
  >[],
): number {
  return doctors.filter((doctor) => {
    if (doctor.blacklisted) return false;
    return HIGH_ACUITY_SPECIALTIES.some((definition) =>
      doctorMatchesHighAcuitySpecialty(doctor, definition),
    );
  }).length;
}
