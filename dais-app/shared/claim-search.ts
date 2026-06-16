import { normalizeForMatch, tokenizeForMatch } from './name-match';

/** Lay terms mapped to needles searched in procedure/equipment/capability/specialties text. */
const CLAIM_TERM_SYNONYMS: Record<string, string[]> = {
  mri: ['mri', 'magnetic resonance'],
  mris: ['mri', 'magnetic resonance'],
  ct: ['ct scan', 'computed tomography', ' ct '],
  scan: ['scan'],
  xray: ['x ray', 'xray', 'radiograph'],
  ultrasound: ['ultrasound', 'sonography'],
  dialysis: ['dialysis'],
  chemotherapy: ['chemotherapy', 'chemo'],
  endoscopy: ['endoscopy'],
  ventilator: ['ventilator'],
};

const CLAIM_STOP_WORDS = new Set([
  'cardiologist',
  'cardiologists',
  'cardiology',
  'cardiac',
  'heart',
  'doctor',
  'doctors',
  'hospital',
  'facility',
  'facilities',
  'looking',
  'offers',
  'offer',
  'need',
  'want',
  'find',
]);

/**
 * Extract procedure/equipment/capability terms from natural language (not specialty names).
 * Returns lowercase search needles for facility claim fields.
 */
export function extractClaimTermsFromQuery(query: string, maxTerms = 3): string[] {
  const normalized = normalizeForMatch(query);
  const tokens = tokenizeForMatch(query, 2).filter((t) => !CLAIM_STOP_WORDS.has(t));
  const found: string[] = [];

  const addNeedle = (needle: string) => {
    const n = needle.trim().toLowerCase();
    if (n.length >= 2 && !found.includes(n)) {
      found.push(n);
    }
  };

  for (const [key, synonyms] of Object.entries(CLAIM_TERM_SYNONYMS)) {
    if (normalized.includes(key) || tokens.includes(key)) {
      for (const synonym of synonyms) {
        addNeedle(synonym.trim());
      }
    }
  }

  for (const token of tokens) {
    if (token.length >= 4 && !CLAIM_STOP_WORDS.has(token)) {
      const synonyms = CLAIM_TERM_SYNONYMS[token];
      if (!synonyms && !Object.keys(CLAIM_TERM_SYNONYMS).includes(token)) {
        addNeedle(token);
      }
    }
  }

  return found.slice(0, maxTerms);
}

export function formatClaimTermsLabel(terms: string[]): string {
  if (terms.length === 0) return '';
  return terms.join(', ');
}
