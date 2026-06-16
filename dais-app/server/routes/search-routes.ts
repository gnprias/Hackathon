import { z } from 'zod';
import { Application } from 'express';
import {
  matchSpecialtiesFromQuery,
  topSpecialtyCandidates,
  type SpecialtyMatchResult,
  type SpecialtyOption,
} from '../../shared/specialty-match';
import { extractClaimTermsFromQuery } from '../../shared/claim-search';
import { buildReferenceGeocodeQuery } from '../../shared/reference-location';
import { forwardGeocode } from '../verification/geocoding';

const SpecialtyRow = z.object({
  specialty_canonical: z.union([z.string(), z.number()]).transform(String),
  specialty_display: z.union([z.string(), z.number()]).transform(String),
  facility_count: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .optional()
    .transform((value) => {
      if (value == null || value === '') return undefined;
      const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
      return Number.isFinite(n) ? n : undefined;
    }),
});

const MatchBody = z.object({
  query: z.string().trim().min(2).max(500),
  specialties: z.array(SpecialtyRow).min(1).max(300),
  hasLocation: z.boolean().optional().default(false),
});

function parseMatchBody(body: unknown):
  | { ok: true; query: string; specialties: SpecialtyOption[]; hasLocation: boolean }
  | { ok: false; error: string } {
  const parsed = MatchBody.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: 'query and specialties are required' };
  }

  const specialties = parsed.data.specialties
    .map((row) => ({
      specialty_canonical: row.specialty_canonical.trim(),
      specialty_display: row.specialty_display.trim(),
      facility_count: row.facility_count,
    }))
    .filter((row) => row.specialty_canonical !== '' && row.specialty_display !== '');

  if (specialties.length === 0) {
    return { ok: false, error: 'At least one valid specialty row is required' };
  }

  return { ok: true, query: parsed.data.query, specialties, hasLocation: parsed.data.hasLocation };
}

interface OpenAiMatch {
  canonical: string;
  confidence: number;
  reason: string;
}

async function matchWithOpenAi(
  query: string,
  specialties: SpecialtyOption[],
): Promise<{ matches: OpenAiMatch[]; claimTerms: string[] } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const candidates = topSpecialtyCandidates(query, specialties, 50).map((specialty) => ({
    canonical: specialty.specialty_canonical,
    display: specialty.specialty_display,
    facility_count: specialty.facility_count ?? null,
  }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You map a natural-language healthcare search to specialties from a provided list. Return JSON: {"matches":[{"canonical":"...","confidence":0.0-1.0,"reason":"..."}],"claimTerms":["mri"]}. Only use canonical values from the list for matches. claimTerms lists procedure/equipment/capability keywords from the user query (e.g. mri, ct scan, dialysis) — not specialty names. Return up to 3 matches sorted by confidence. If the user mentions a doctor name (Dr X) or clinic/hospital name only, return empty matches and explain in reason fields that facility-name search should be used instead.',
        },
        {
          role: 'user',
          content: JSON.stringify({ query, specialties: candidates }),
        },
      ],
    }),
  });

  if (!response.ok) {
    console.warn('[search] OpenAI match failed:', response.status, await response.text());
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as { matches?: OpenAiMatch[]; claimTerms?: string[] };
    if (!Array.isArray(parsed.matches)) return null;

    const allowed = new Set(specialties.map((specialty) => specialty.specialty_canonical));
    const matches = parsed.matches
      .filter(
        (match) =>
          typeof match.canonical === 'string' &&
          allowed.has(match.canonical) &&
          typeof match.confidence === 'number',
      )
      .slice(0, 3);

    return {
      matches,
      claimTerms: Array.isArray(parsed.claimTerms)
        ? parsed.claimTerms.filter((t): t is string => typeof t === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function toResults(
  matches: Array<{ canonical: string; display: string; score: number; reason: string }>,
  source: 'openai' | 'rules',
  claimTerms: string[],
  guidance?: string | null,
) {
  return {
    matches,
    source,
    claimTerms,
    guidance: guidance ?? null,
  };
}

function mergeClaimTerms(query: string, fromAi: string[] | undefined): string[] {
  const rules = extractClaimTermsFromQuery(query);
  const merged = new Set<string>([...rules, ...(fromAi ?? [])].map((t) => t.trim().toLowerCase()).filter(Boolean));
  return [...merged].slice(0, 3);
}

export function setupSearchRoutes(app: Application): void {
  app.post('/api/search/geocode-reference', async (req, res) => {
    const parsed = z
      .object({
        referenceAddress: z.string().optional().default(''),
        city: z.string().optional().default(''),
        state: z.string().optional().default(''),
        zip: z.string().optional().default(''),
        countryCode: z.string().optional().default(''),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid location payload' });
      return;
    }

    const query = buildReferenceGeocodeQuery(parsed.data);
    if (!query) {
      res.status(400).json({ error: 'Enter a city or street address for distance calculations' });
      return;
    }

    try {
      const place = await forwardGeocode(query);
      if (!place) {
        res.status(404).json({ error: 'Could not find that location on the map' });
        return;
      }
      res.json({
        lat: place.lat,
        lon: place.lon,
        displayName: place.displayName,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Geocoding failed';
      console.error('[search] geocode-reference failed:', message);
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/search/match-specialty', async (req, res) => {
    const parsed = parseMatchBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { query, specialties, hasLocation } = parsed;
    const byCanonical = new Map(
      specialties.map((specialty) => [specialty.specialty_canonical, specialty]),
    );

    try {
      const aiResult = await matchWithOpenAi(query, specialties);
      if (aiResult && aiResult.matches.length > 0) {
        const mergedClaims = mergeClaimTerms(query, aiResult.claimTerms);
        const matches: SpecialtyMatchResult[] = aiResult.matches
          .map((match) => {
            const specialty = byCanonical.get(match.canonical);
            if (!specialty) return null;
            const claimNote =
              mergedClaims.length > 0
                ? ` Will filter facilities whose reported procedures/equipment mention: ${mergedClaims.join(', ')}.`
                : '';
            return {
              canonical: specialty.specialty_canonical,
              display: specialty.specialty_display,
              score: Math.max(0, Math.min(1, match.confidence)),
              reason: (match.reason || 'Matched by AI from your description.') + claimNote,
            };
          })
          .filter((match): match is SpecialtyMatchResult => match != null);

        if (matches.length > 0) {
          const guidance = !hasLocation
            ? 'Add a state, city, or zip in step 1 to list facilities in that area, or pick a region below.'
            : null;
          res.json(toResults(matches, 'openai', mergedClaims, guidance));
          return;
        }
      }

      const ruleMatches = matchSpecialtiesFromQuery(query, specialties, 5).map((match) => {
        const claims = mergeClaimTerms(query, undefined);
        if (claims.length === 0) return match;
        return {
          ...match,
          reason: `${match.reason} Will filter facilities whose reported procedures/equipment mention: ${claims.join(', ')}.`,
        };
      });
      const guidance =
        !hasLocation && ruleMatches.length > 0
          ? 'Add a state, city, or zip in step 1 to list facilities in that area, or pick a region below.'
          : null;
      res.json(toResults(ruleMatches, 'rules', mergeClaimTerms(query, undefined), guidance));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Specialty match failed';
      console.error('[search] match-specialty failed:', message);
      res.status(502).json({ error: message });
    }
  });
}
