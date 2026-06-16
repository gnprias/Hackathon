import type { AdditionalQualification, FacilityImrDoctorRecord } from './imr-doctor-record';
import { normalizeForMatch } from './name-match';
import { parseDedupedClaimList } from './parse-claim-list';

/** Degrees that do not establish a clinical specialty on their own. */
const GENERIC_QUALIFICATIONS = new Set([
  'mbbs',
  'bams',
  'bhms',
  'bums',
  'bnys',
  'bsms',
  'bpt',
  'bpharm',
  'bds',
]);

/** Common qualification abbreviations and synonyms per specialty keyword. */
const QUALIFICATION_ALIASES: Record<string, string[]> = {
  ophthalmology: ['ophthalm', 'opthalm', 'doms', 'eye'],
  cardiology: ['cardio', 'cardiac', 'heart'],
  dermatology: ['dermat', 'dvl', 'venereology', 'skin'],
  orthopedics: ['orthop', 'orthopaedic', 'orthopedic'],
  orthopaedics: ['orthop', 'orthopaedic', 'orthopedic'],
  paediatrics: ['pediatric', 'pediatrics', 'paediatric', 'dch'],
  pediatrics: ['pediatric', 'paediatrics', 'dch'],
  radiology: ['radiol', 'radiodiagnosis'],
  anaesthesiology: ['anesthesiology', 'anesthesia', 'anaesthesia', 'anesth'],
  anesthesiology: ['anaesthesiology', 'anaesthesia', 'anesth'],
  psychiatry: ['psychiatric', 'dpm'],
  gynaecology: ['gynecology', 'obstetric', 'obg', 'obstetrics'],
  gynecology: ['gynaecology', 'obstetric', 'obg', 'obstetrics'],
  obstetrics: ['gynaecology', 'gynecology', 'obg'],
  neurology: ['neuro', 'neurological'],
  nephrology: ['nephro', 'renal', 'kidney'],
  urology: ['urological', 'urologic'],
  gastroenterology: ['gastro', 'gi'],
  pulmonology: ['pulmonary', 'respiratory', 'chest'],
  oncology: ['onco', 'cancer'],
  endocrinology: ['endocrine', 'diabetes'],
  pathology: ['pathological', 'histopathology'],
  microbiology: ['microbio'],
  surgery: ['surgical', 'ms', 'mch'],
  ent: ['otorhinolaryngology', 'otolaryngology', 'ent'],
  otorhinolaryngology: ['ent', 'otolaryngology'],
};

const SPECIALTY_STOP_TOKENS = new Set(['general', 'medicine', 'health', 'care', 'and', 'the']);

export function collectDoctorQualifications(doctor: {
  qualification?: string | null;
  additionalQualifications?: AdditionalQualification[];
}): string[] {
  const results: string[] = [];
  const primary = doctor.qualification?.trim();
  if (primary) results.push(primary);

  for (const entry of doctor.additionalQualifications ?? []) {
    const text = entry.qualification?.trim();
    if (text) results.push(text);
  }

  return results;
}

function isGenericQualification(normalizedQualification: string): boolean {
  const stripped = normalizedQualification.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped) return true;

  const tokens = stripped.split(' ').filter(Boolean);
  if (tokens.length === 1 && GENERIC_QUALIFICATIONS.has(tokens[0])) {
    return true;
  }

  return tokens.every((token) => GENERIC_QUALIFICATIONS.has(token));
}

function specialtyMatchTokens(specialty: string): string[] {
  const normalized = normalizeForMatch(specialty);
  if (!normalized) return [];

  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= 4 && !SPECIALTY_STOP_TOKENS.has(token));

  return [normalized, ...tokens];
}

export function qualificationMatchesSpecialty(qualification: string, specialty: string): boolean {
  const normQual = normalizeForMatch(qualification);
  if (!normQual || isGenericQualification(normQual)) return false;

  for (const token of specialtyMatchTokens(specialty)) {
    if (token.length >= 4 && normQual.includes(token)) {
      return true;
    }

    const aliases = QUALIFICATION_ALIASES[token] ?? [];
    for (const alias of aliases) {
      if (normQual.includes(alias)) {
        return true;
      }
    }
  }

  return false;
}

export function doctorMatchesFacilitySpecialties(
  doctor: Pick<FacilityImrDoctorRecord, 'qualification' | 'additionalQualifications' | 'blacklisted'>,
  facilitySpecialties: unknown,
): boolean {
  if (doctor.blacklisted) return false;

  const specialties = parseDedupedClaimList(facilitySpecialties);
  if (specialties.length === 0) return false;

  const qualifications = collectDoctorQualifications(doctor);
  if (qualifications.length === 0) return false;

  for (const specialty of specialties) {
    for (const qualification of qualifications) {
      if (qualificationMatchesSpecialty(qualification, specialty)) {
        return true;
      }
    }
  }

  return false;
}

export function computeImrDoctorTrustCounts(
  records: FacilityImrDoctorRecord[],
  facilitySpecialties: unknown,
): {
  total: number;
  blacklisted: number;
  active: number;
  specialtyMatched: number;
  activeSpecialtyMatched: number;
} {
  const blacklisted = records.filter((record) => record.blacklisted).length;
  const specialtyMatched = records.filter((record) =>
    doctorMatchesFacilitySpecialties(record, facilitySpecialties),
  ).length;

  return {
    total: records.length,
    blacklisted,
    active: records.length - blacklisted,
    specialtyMatched,
    activeSpecialtyMatched: specialtyMatched,
  };
}
