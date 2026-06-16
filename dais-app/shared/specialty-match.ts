import { normalizeForMatch, tokenizeForMatch } from './name-match';

export interface SpecialtyOption {
  specialty_canonical: string;
  specialty_display: string;
  facility_count?: number;
}

export interface SpecialtyMatchResult {
  canonical: string;
  display: string;
  score: number;
  reason: string;
}

const QUERY_STOP_WORDS = new Set([
  'need',
  'looking',
  'find',
  'search',
  'want',
  'with',
  'that',
  'have',
  'offers',
  'offer',
  'provides',
  'provide',
  'facility',
  'facilities',
  'hospital',
  'clinic',
  'doctor',
  'doctors',
  'care',
  'treatment',
  'service',
  'services',
  'near',
  'around',
  'area',
  'for',
  'and',
  'the',
  'am',
  'who',
]);

/** Expand common lay terms to specialty vocabulary. */
const QUERY_SYNONYMS: Record<string, string[]> = {
  cardiologist: ['cardiology', 'cardiac'],
  cardiologists: ['cardiology', 'cardiac'],
  heart: ['cardiology', 'cardiac'],
  mri: ['radiology', 'mri', 'magnetic resonance'],
  mris: ['radiology', 'mri', 'magnetic resonance'],
  pulmonologist: ['pulmonology', 'pulmonary'],
  neurologist: ['neurology', 'neuro'],
  surgeon: ['surgery', 'surgical'],
};

function queryTokens(query: string): string[] {
  const base = tokenizeForMatch(query, 3).filter((token) => !QUERY_STOP_WORDS.has(token));
  const expanded = new Set(base);

  for (const token of base) {
    const synonyms = QUERY_SYNONYMS[token];
    if (synonyms) {
      for (const synonym of synonyms) {
        expanded.add(synonym);
      }
    }
  }

  return [...expanded];
}

function scoreSpecialty(query: string, tokens: string[], specialty: SpecialtyOption): number {
  const canonical = specialty.specialty_canonical;
  const display = specialty.specialty_display;
  const normalizedQuery = normalizeForMatch(query);
  const haystack = `${canonical} ${normalizeForMatch(display)}`;

  if (normalizedQuery.length >= 4 && haystack.includes(normalizedQuery)) {
    return 1;
  }

  if (tokens.length === 0) return 0;

  let hits = 0;
  for (const token of tokens) {
    if (canonical === token || canonical.startsWith(`${token} `) || canonical.startsWith(token)) {
      hits += 1.2;
      continue;
    }
    if (canonical.includes(token) || normalizeForMatch(display).includes(token)) {
      hits += 1;
    }
  }

  return Math.min(1, hits / tokens.length);
}

export function matchSpecialtiesFromQuery(
  query: string,
  specialties: SpecialtyOption[],
  limit = 5,
): SpecialtyMatchResult[] {
  const trimmed = query.trim();
  if (!trimmed || specialties.length === 0) return [];

  const tokens = queryTokens(trimmed);

  return specialties
    .map((specialty) => {
      const score = scoreSpecialty(trimmed, tokens, specialty);
      return {
        canonical: specialty.specialty_canonical,
        display: specialty.specialty_display,
        score,
        reason:
          score >= 0.8
            ? 'Strong keyword match to this specialty.'
            : score >= 0.4
              ? 'Partial keyword match to this specialty.'
              : 'Weak match based on search terms.',
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function topSpecialtyCandidates(
  query: string,
  specialties: SpecialtyOption[],
  limit = 40,
): SpecialtyOption[] {
  const matches = matchSpecialtiesFromQuery(query, specialties, limit);
  if (matches.length > 0) {
    const canonicals = new Set(matches.map((match) => match.canonical));
    return specialties.filter((specialty) => canonicals.has(specialty.specialty_canonical));
  }
  return specialties.slice(0, limit);
}
