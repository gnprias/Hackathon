import { normalizeForMatch } from './name-match';

export type SearchQueryIntent =
  | 'specialty'
  | 'facility_name'
  | 'doctor_name'
  | 'location_only'
  | 'mixed';

const FACILITY_HINTS =
  /\b(hospital|hospitals|clinic|clinics|centre|center|nursing home|eye care|healthcare|medical college)\b/i;
const DOCTOR_HINT = /\bdr\.?\s+[a-z]/i;
const LOCATION_ONLY =
  /^(?:in\s+)?([a-z][a-z\s]+,?\s*)?(?:state|region|city|area)?$/i;

export interface ParsedFacilityQuery {
  intent: SearchQueryIntent;
  facilitySearchText: string | null;
  city: string;
  state: string;
}

export function classifySearchQuery(query: string): SearchQueryIntent {
  const text = query.trim();
  if (text.length < 2) return 'mixed';

  if (DOCTOR_HINT.test(text) && FACILITY_HINTS.test(text)) return 'facility_name';
  if (FACILITY_HINTS.test(text)) return 'facility_name';
  if (DOCTOR_HINT.test(text)) return 'doctor_name';
  if (LOCATION_ONLY.test(text) && text.split(/\s+/).length <= 4) return 'location_only';

  return 'specialty';
}

export function shouldPrioritizeFacilitySearch(intent: SearchQueryIntent): boolean {
  return intent === 'facility_name' || intent === 'doctor_name';
}

/** Split "Clinic Name, City" or "specialty in State" style queries. */
export function parseFacilityQuery(query: string): ParsedFacilityQuery {
  let text = query.trim().replace(/\bnear\s+.+$/i, '').trim();
  let city = '';
  let state = '';

  const commaMatch = text.match(/^(.+?),\s*([A-Za-z][A-Za-z\s.'-]{1,40})$/);
  if (commaMatch) {
    text = commaMatch[1].trim();
    city = commaMatch[2].trim();
  }

  const inMatch = text.match(/^(.+?)\s+in\s+([A-Za-z][A-Za-z\s,'-]{2,})$/i);
  if (!city && inMatch) {
    text = inMatch[1].trim();
    const location = inMatch[2].trim();
    if (location.split(/\s+/).length <= 2) {
      city = location;
    } else {
      state = location;
    }
  }

  const intent = classifySearchQuery(query);
  let facilitySearchText: string | null = null;

  if (intent === 'facility_name') {
    facilitySearchText = text
      .replace(/\b(find|search|looking for|need|want)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (intent === 'doctor_name') {
    const doctorMatch = text.match(/\bdr\.?\s+([a-z][\w'.-]*(?:\s+[a-z][\w'.-]*){0,4})/i);
    facilitySearchText = doctorMatch?.[1]?.trim() ?? text;
  } else if (intent === 'mixed') {
    facilitySearchText = text.length >= 3 ? text : null;
  }

  if (facilitySearchText && facilitySearchText.length < 3) {
    facilitySearchText = null;
  }

  return { intent, facilitySearchText, city, state };
}

/** @deprecated Use parseFacilityQuery().facilitySearchText */
export function extractFacilitySearchText(query: string): string | null {
  return parseFacilityQuery(query).facilitySearchText;
}

export function facilityNameMatchScore(query: string, facilityName: string): number {
  const normalizedQuery = normalizeForMatch(query);
  const normalizedName = normalizeForMatch(facilityName);
  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedName === normalizedQuery) return 1;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
    const shorter = Math.min(normalizedQuery.length, normalizedName.length);
    const longer = Math.max(normalizedQuery.length, normalizedName.length);
    return 0.75 + (shorter / longer) * 0.2;
  }
  return 0;
}

export function buildSpecialtySearchGuidance(options: {
  hasLocation: boolean;
  intent: SearchQueryIntent;
  specialtyMatched: boolean;
  facilityMatches: number;
}): string | null {
  const { hasLocation, intent, specialtyMatched, facilityMatches } = options;

  if (facilityMatches > 0 && shouldPrioritizeFacilitySearch(intent)) {
    return null;
  }

  if (!hasLocation && intent === 'doctor_name') {
    return 'Searching facility names for that doctor — clinician rosters are not in this dataset. Add a city or state above to narrow results.';
  }

  if (!hasLocation && intent === 'facility_name' && facilityMatches === 0) {
    return 'No clinic name match yet. Try the full facility name including city (e.g. "Dr Verma Eye Hospital, Durg").';
  }

  if (!hasLocation && specialtyMatched) {
    return 'Specialty matched. Add a state or city above to list facilities in that area, or pick a region below.';
  }

  if (!hasLocation && intent === 'location_only') {
    return 'Enter that location in the search fields above, then search again.';
  }

  if (!hasLocation && intent === 'specialty') {
    return 'Add a state, city, or zip above to list facilities for this specialty, or choose a region below.';
  }

  return null;
}
