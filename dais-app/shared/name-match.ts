const STOP_WORDS = new Set([
  'and',
  'the',
  'of',
  'at',
  'in',
  'for',
  'a',
  'an',
  'pvt',
  'ltd',
  'limited',
  'private',
  'hospital',
  'hospitals',
  'medical',
  'health',
  'healthcare',
  'centre',
  'center',
  'clinic',
  'care',
  'trust',
  'institute',
  'foundation',
  'district',
  'general',
  'multi',
  'speciality',
  'specialty',
  'super',
  'speciality',
]);

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeForMatch(text: string, minLength = 3): string[] {
  return normalizeForMatch(text)
    .split(' ')
    .filter((token) => token.length >= minLength && !STOP_WORDS.has(token));
}

/** Fraction of facility name tokens found in the comparison text (0–1). */
export function nameMatchScore(facilityName: string, comparisonText: string): number {
  const nameTokens = tokenizeForMatch(facilityName, 3);
  if (nameTokens.length === 0) return 0;

  const haystack = ` ${normalizeForMatch(comparisonText)} `;
  let hits = 0;

  for (const token of nameTokens) {
    if (haystack.includes(` ${token} `) || haystack.includes(token)) {
      hits += 1;
    }
  }

  return hits / nameTokens.length;
}

export function locationTokenScore(city: string | null | undefined, state: string | null | undefined, text: string): number {
  const tokens = [city, state].filter((part): part is string => Boolean(part && part.trim()));
  if (tokens.length === 0) return 0;

  const haystack = normalizeForMatch(text);
  let hits = 0;

  for (const token of tokens) {
    const normalized = normalizeForMatch(token);
    if (normalized.length >= 3 && haystack.includes(normalized)) {
      hits += 1;
    }
  }

  return hits / tokens.length;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type MatchVerdict = 'likely_match' | 'weak_match' | 'likely_mismatch' | 'unknown';

export function verdictFromScore(score: number): MatchVerdict {
  if (score >= 0.55) return 'likely_match';
  if (score >= 0.25) return 'weak_match';
  if (score > 0) return 'likely_mismatch';
  return 'unknown';
}
