import { normalizeForMatch } from './name-match';

const TITLE_PREFIX =
  /^(dr|doctor|mr|mrs|ms|miss|prof|professor|shri|smt|kumari)\.?\s+/i;

export interface NormalizedImrSearchName {
  original: string;
  /** Single token sent to NMC (their API errors on spaces). */
  apiName: string;
  /** Tokens used to narrow results after the API returns matches. */
  filterTokens: string[];
  usedSurnameOnly: boolean;
}

export function normalizeImrDoctorSearchName(input: string): NormalizedImrSearchName {
  let cleaned = input.trim().replace(/\s+/g, ' ');
  while (TITLE_PREFIX.test(cleaned)) {
    cleaned = cleaned.replace(TITLE_PREFIX, '').trim();
  }

  const tokens = cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  if (tokens.length === 0) {
    return {
      original: input,
      apiName: cleaned,
      filterTokens: [],
      usedSurnameOnly: false,
    };
  }

  const apiName = tokens.length === 1 ? tokens[0] : tokens[tokens.length - 1];

  return {
    original: input,
    apiName,
    filterTokens: tokens,
    usedSurnameOnly: tokens.length > 1,
  };
}

export function doctorNameMatchesSearchTokens(
  doctorName: string,
  fatherName: string | null | undefined,
  tokens: string[],
): boolean {
  if (tokens.length <= 1) return true;

  const haystack = normalizeForMatch(`${doctorName} ${fatherName ?? ''}`);
  return tokens.every((token) => haystack.includes(normalizeForMatch(token)));
}
