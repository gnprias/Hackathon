import { z } from 'zod';
import { Application } from 'express';
import { computeTrustScore, type TrustScoreInput } from '../../shared/trust-score';
import type { LocationVerdict, WebsiteRelevanceVerdict } from '../../shared/verification-types';

const TrustNarrativeBody = z.object({
  facility: z.record(z.string(), z.unknown()),
  trustScore: z.object({
    score: z.number(),
    recommendation: z.string(),
    breakdown: z.object({
      linkValidation: z.number(),
      contact: z.number(),
      social: z.number(),
      profileRichness: z.number(),
      operational: z.number(),
      addressVerification: z.number(),
      credentialing: z.number(),
      highAcuityServices: z.number(),
      penalties: z.number(),
    }),
    hasUnverifiedClaims: z.boolean(),
    addressVerificationStatus: z.enum([
      'verified',
      'partial_mismatch',
      'partial_geocode',
      'failed',
      'unchecked',
    ]),
    locationQuestionable: z.boolean(),
    locationQuestionableReasons: z.array(z.string()),
  }),
});

function facilityToTrustInput(facility: Record<string, unknown>): TrustScoreInput {
  const str = (key: string): string | null => {
    const value = facility[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  };

  return {
    website_status: str('website_status'),
    facebook_status: str('facebook_status'),
    official_website: str('official_website'),
    facebook_link: str('facebook_link'),
    official_phone: str('official_phone'),
    email: str('email'),
    distinct_social_media_presence_count:
      facility.distinct_social_media_presence_count as string | number | null,
    post_metrics_post_count: facility.post_metrics_post_count as string | number | null,
    engagement_metrics_n_followers: facility.engagement_metrics_n_followers as
      | string
      | number
      | null,
    engagement_metrics_n_engagements: facility.engagement_metrics_n_engagements as
      | string
      | number
      | null,
    specialties: str('specialties'),
    procedure: str('procedure'),
    equipment: str('equipment'),
    capability: str('capability'),
    description: str('description'),
    claim_rule_status: str('claim_rule_status'),
    claim_rule_score: facility.claim_rule_score as string | number | null,
    year_established: str('year_established'),
    number_doctors: str('number_doctors'),
    address_city: str('address_city'),
    address_state_or_region: str('address_state_or_region'),
    latitude: facility.latitude as string | number | null,
    longitude: facility.longitude as string | number | null,
    website_relevance_verdict:
      typeof facility.website_relevance_verdict === 'string'
        ? (facility.website_relevance_verdict as WebsiteRelevanceVerdict)
        : null,
    location_verdict:
      typeof facility.location_verdict === 'string'
        ? (facility.location_verdict as LocationVerdict)
        : null,
    address_geocode_status: str('address_geocode_status'),
    address_mismatch_flags: str('address_mismatch_flags'),
    is_deactivated: facility.is_deactivated === true,
    verified_imr_doctors_count: toTrustCount(facility.verified_imr_doctors_count),
    verified_imr_doctors_blacklisted_count: toTrustCount(
      facility.verified_imr_doctors_blacklisted_count,
    ),
    verified_imr_doctors_specialty_matched_count: toTrustCount(
      facility.verified_imr_doctors_specialty_matched_count,
    ),
  };
}

function toTrustCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function generateOpenAiNarrative(
  facility: Record<string, unknown>,
  trustScore: z.infer<typeof TrustNarrativeBody>['trustScore'],
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const facilityName =
    typeof facility.name === 'string' ? facility.name : 'Unknown facility';
  const facts = {
    name: facilityName,
    website_status: facility.website_status ?? null,
    facebook_status: facility.facebook_status ?? null,
    has_phone: Boolean(facility.official_phone),
    has_email: Boolean(facility.email),
    trust_score: trustScore.score,
    breakdown: trustScore.breakdown,
    rules_recommendation: trustScore.recommendation,
    website_relevance_verdict: facility.website_relevance_verdict ?? null,
    location_verdict: facility.location_verdict ?? null,
    address_geocode_status: facility.address_geocode_status ?? null,
    address_mismatch_flags: facility.address_mismatch_flags ?? null,
    location_questionable: trustScore.locationQuestionable,
    location_questionable_reasons: trustScore.locationQuestionableReasons,
    unverified_claim_fields: ['specialties', 'procedure', 'capability', 'description'].filter(
      (key) => {
        const value = facility[key];
        return typeof value === 'string' && value.trim() !== '';
      },
    ),
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content:
            'You summarize facility trust assessments for outreach reviewers. Use ONLY the JSON facts provided. Do not invent registration numbers, doctor names, accreditations, or verification outcomes. Mention that clinical claims are facility-reported unless explicitly verified elsewhere. Write 2-3 concise sentences in plain English.',
        },
        {
          role: 'user',
          content: JSON.stringify(facts),
        },
      ],
    }),
  });

  if (!response.ok) {
    console.warn('[trust] OpenAI narrative failed:', response.status, await response.text());
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  return content || null;
}

export function setupTrustRoutes(app: Application): void {
  app.post('/api/trust/score', (req, res) => {
    const facility = z
      .object({ facility: z.record(z.string(), z.unknown()) })
      .safeParse(req.body);
    if (!facility.success) {
      res.status(400).json({ error: 'facility object is required' });
      return;
    }

    const trustScore = computeTrustScore(facilityToTrustInput(facility.data.facility));
    res.json({ trustScore, source: 'rules' });
  });

  app.post('/api/trust/narrative', async (req, res) => {
    const parsed = TrustNarrativeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'facility and trustScore are required' });
      return;
    }

    try {
      const narrative = await generateOpenAiNarrative(parsed.data.facility, parsed.data.trustScore);
      res.json({
        narrative,
        source: narrative ? 'openai' : 'rules-only',
        fallbackRecommendation: parsed.data.trustScore.recommendation,
      });
    } catch (err) {
      console.warn('[trust] narrative error:', err);
      res.json({
        narrative: null,
        source: 'rules-only',
        fallbackRecommendation: parsed.data.trustScore.recommendation,
      });
    }
  });
}
