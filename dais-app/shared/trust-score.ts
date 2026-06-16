/**

 * Deterministic facility trust score (0–100).

 *

 * Formula (weights sum to 100 before penalties):

 * - Link validation (30): website 15 + Facebook 15

 * - Contact completeness (25): phone 12.5 + email 12.5

 * - Social engagement (20): scaled from followers/posts/channels when present; 10 neutral if absent

 * - Profile richness (15): specialties 5 + procedure/capability 5 + description 5 (facility-reported)

 * - Operational (10): location exists (batch geocode + map cross-check, up to 5) +
 *   specialty/claim consistency (procedure/equipment/capability vs specialties, up to 5)
 *
 * - Credentialing (0–5 bonus): NMC IMR doctors saved for this facility whose qualifications
 *   match listed specialties (not blacklisted)

 *

 * Penalties (subtracted after sum, floor at 0):

 * - Deactivated: score forced to 0

 * - Broken website when URL on record: -5

 * - Broken Facebook when link on record: -3

 * - Website reachable but wrong site (cross-check): -12 (weak: -4)

 * - Step 4 location not found / likely mismatch: -12 (weak: -3)

 * - Batch geocode partial: -8

 * - Batch geocode failed: -10

 *

 * Bonuses (added before penalties, capped at component max):

 * - Location and claim consistency are scored together in Operational (see operationalScore).

 *

 * locationQuestionable is set when batch geocode fails/partially confirms, or step 4 cross-check

 * indicates the facility is not at the listed location.

 *

 * Recommendation tiers: ≥80 high, ≥60 moderate, ≥40 low, <40 very low.

 */



import {

  formatAddressMismatchSummary,

  resolveAddressVerificationTrustStatus,

  type AddressVerificationTrustStatus,

} from './address-verification';

import { resolveClaimValidationDisplay } from './claim-validation';

import { parseDedupedClaimList } from './parse-claim-list';

import type { LocationVerdict, WebsiteRelevanceVerdict } from './verification-types';



export interface TrustScoreInput {

  website_status?: string | null;

  facebook_status?: string | null;

  official_website?: string | null;

  facebook_link?: string | null;

  official_phone?: string | null;

  email?: string | null;

  distinct_social_media_presence_count?: string | number | null;

  post_metrics_post_count?: string | number | null;

  engagement_metrics_n_followers?: string | number | null;

  engagement_metrics_n_engagements?: string | number | null;

  specialties?: string | null;

  procedure?: string | null;

  equipment?: string | null;

  capability?: string | null;

  description?: string | null;

  claim_rule_status?: string | null;

  claim_rule_score?: string | number | null;

  year_established?: string | null;

  number_doctors?: string | null;

  address_city?: string | null;

  address_state_or_region?: string | null;

  latitude?: string | number | null;

  longitude?: string | number | null;

  website_relevance_verdict?: WebsiteRelevanceVerdict | null;

  location_verdict?: LocationVerdict | null;

  address_geocode_status?: string | null;

  address_mismatch_flags?: string | null;

  is_deactivated?: boolean;

  verified_imr_doctors_count?: number | null;

  verified_imr_doctors_blacklisted_count?: number | null;

  /** Active saved doctors whose qualifications match facility specialties. */
  verified_imr_doctors_specialty_matched_count?: number | null;

}



export interface TrustScoreBreakdown {

  linkValidation: number;

  contact: number;

  social: number;

  profileRichness: number;

  operational: number;

  addressVerification: number;

  credentialing: number;

  penalties: number;

}



export interface TrustScoreResult {

  score: number;

  recommendation: string;

  breakdown: TrustScoreBreakdown;

  hasUnverifiedClaims: boolean;

  addressVerificationStatus: AddressVerificationTrustStatus;

  locationQuestionable: boolean;

  locationQuestionableReasons: string[];

}



function hasText(value: string | null | undefined): boolean {

  return value != null && String(value).trim() !== '' && String(value).trim() !== '—';

}



function toNumber(value: string | number | null | undefined): number {

  if (value == null || value === '') return 0;

  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));

  return Number.isFinite(n) ? n : 0;

}



function linkPoints(status: string | null | undefined, hasUrl: boolean, max: number): number {

  if (status === 'ok') return max;

  if (!hasUrl) return Math.round(max * 0.5);

  if (status === 'missing') return Math.round(max * 0.35);

  return 0;

}



function socialEngagementScore(input: TrustScoreInput): number {

  const channels = toNumber(input.distinct_social_media_presence_count);

  const posts = toNumber(input.post_metrics_post_count);

  const followers = toNumber(input.engagement_metrics_n_followers);

  const engagements = toNumber(input.engagement_metrics_n_engagements);



  if (channels === 0 && posts === 0 && followers === 0 && engagements === 0) {

    return 10;

  }



  let score = 0;

  score += Math.min(6, channels * 2);

  score += Math.min(5, posts > 0 ? 2 + Math.log10(posts + 1) * 1.5 : 0);

  score += Math.min(5, followers > 0 ? 2 + Math.log10(followers + 1) : 0);

  score += Math.min(4, engagements > 0 ? 1 + Math.log10(engagements + 1) : 0);

  return Math.min(20, Math.round(score));

}



function profileRichnessScore(input: TrustScoreInput): number {

  let score = 0;

  if (hasText(input.specialties) && input.specialties !== '[]') score += 5;

  if (hasText(input.procedure) && input.procedure !== '[]') score += 5;

  if (hasText(input.capability) && input.capability !== '[]') score += 5;

  if (hasText(input.description)) score += 5;

  return Math.min(15, score);

}



function facilityHasClaimText(input: TrustScoreInput): boolean {

  return (

    parseDedupedClaimList(input.procedure).length > 0 ||

    parseDedupedClaimList(input.equipment).length > 0 ||

    parseDedupedClaimList(input.capability).length > 0

  );

}



function operationalScore(input: TrustScoreInput): number {

  const addressStatus = resolveAddressVerificationTrustStatus(

    input.address_geocode_status,

    input.address_mismatch_flags,

  );



  let locationPoints = 0;

  if (addressStatus === 'verified' || addressStatus === 'partial_mismatch') {

    locationPoints += 3;

  } else if (addressStatus === 'partial_geocode') {

    locationPoints += 1;

  }



  if (input.location_verdict === 'likely_match' && hasCoordinates(input)) {

    locationPoints += 2;

  } else if (input.location_verdict === 'weak_match') {

    locationPoints += 1;

  }



  locationPoints = Math.min(5, locationPoints);



  const hasClaimText = facilityHasClaimText(input);

  const claimDisplay = resolveClaimValidationDisplay({

    procedure: input.procedure,

    equipment: input.equipment,

    capability: input.capability,

    claim_rule_status: input.claim_rule_status,

    claim_rule_score: input.claim_rule_score,

    claim_consistency_status: null,

    claim_consistency_score: null,

    claim_consistency_summary: null,

    claim_unsupported_specialties: null,

    claim_orphan_terms: null,

    claim_mismatch_flags: null,

    hasClaimText,

  });



  let claimsPoints = 0;

  if (hasClaimText) {

    if (claimDisplay.ruleStatus === 'ok') {

      const ruleScore = toNumber(claimDisplay.ruleScore);

      claimsPoints = Math.max(3, Math.round((ruleScore > 0 ? ruleScore : 1) * 5));

    } else if (claimDisplay.ruleStatus === 'weak') {

      claimsPoints = 2;

    }

  }



  claimsPoints = Math.min(5, claimsPoints);



  return Math.min(10, locationPoints + claimsPoints);

}



function credentialingScore(input: TrustScoreInput): number {
  const specialtyMatched = toNumber(input.verified_imr_doctors_specialty_matched_count);
  if (specialtyMatched <= 0) return 0;
  if (specialtyMatched === 1) return 3;
  return 5;
}



function recommendationForScore(

  score: number,

  hasUnverifiedClaims: boolean,

  verificationNotes: string[],

  locationQuestionable: boolean,

  locationQuestionableReasons: string[],

  verifiedImrDoctorsCount: number,

  verifiedImrDoctorsSpecialtyMatched: number,

): string {

  const claimNote = hasUnverifiedClaims

    ? ' Specialties, procedures, and capabilities shown are facility-reported and not independently verified.'

    : '';

  const verificationNote =

    verificationNotes.length > 0 ? ` ${verificationNotes.join(' ')}` : '';

  const questionableNote = locationQuestionable

    ? ` Questionable location — this listing may not be trustworthy until the address is confirmed. ${locationQuestionableReasons.join(' ')}`

    : '';

  const credentialingNote =
    verifiedImrDoctorsSpecialtyMatched > 0
      ? ` ${verifiedImrDoctorsSpecialtyMatched} clinician${verifiedImrDoctorsSpecialtyMatched === 1 ? '' : 's'} on record with NMC qualifications matching this facility's specialty.`
      : verifiedImrDoctorsCount > 0
        ? ` ${verifiedImrDoctorsCount} clinician${verifiedImrDoctorsCount === 1 ? '' : 's'} on record via NMC IMR, but qualifications do not match listed specialties.`
        : '';



  if (score >= 80) {

    return `High confidence — contact details and online presence look solid.${credentialingNote || ' Verify clinician credentials separately via NMC IMR.'}${questionableNote}${verificationNote}${claimNote}`;

  }

  if (score >= 60) {

    return `Moderate confidence — some gaps in contact, links, or cross-check signals. Request additional verification before relying on this listing.${credentialingNote}${questionableNote}${verificationNote}${claimNote}`;

  }

  if (score >= 40) {

    return `Low confidence — missing contact information, broken links, or mismatched website/location signals. Proceed with caution and confirm details directly with the facility.${credentialingNote}${questionableNote}${verificationNote}${claimNote}`;

  }

  return `Very low confidence — limited verifiable information available for this facility.${credentialingNote}${questionableNote}${verificationNote}${claimNote}`;

}



function verificationPenaltyNotes(input: TrustScoreInput): {

  penalties: number;

  notes: string[];

  locationQuestionable: boolean;

  locationQuestionableReasons: string[];

} {

  let penalties = 0;

  const notes: string[] = [];

  let locationQuestionable = false;

  const locationQuestionableReasons: string[] = [];



  if (input.website_relevance_verdict === 'likely_mismatch') {

    penalties += 12;

    notes.push('The listed website appears to belong to a different organization.');

  } else if (input.website_relevance_verdict === 'weak_match') {

    penalties += 4;

    notes.push('The website is reachable but only partially matches this facility.');

  }



  if (input.location_verdict === 'likely_mismatch') {

    penalties += 12;

    locationQuestionable = true;

    locationQuestionableReasons.push(

      'Step 4 map cross-check: the facility name does not align with the geocoded location.',

    );

    notes.push('Map/geocoding results do not align with this facility name or coordinates.');

  } else if (input.location_verdict === 'not_found') {

    penalties += 10;

    locationQuestionable = true;

    locationQuestionableReasons.push(

      'Step 4 map cross-check: could not verify this facility at the listed location.',

    );

    notes.push('Could not verify this facility at the listed coordinates or address.');

  } else if (input.location_verdict === 'weak_match') {

    penalties += 3;

    notes.push('Map cross-check only weakly matches this facility name or location.');

  }



  return { penalties, notes, locationQuestionable, locationQuestionableReasons };

}



function addressVerificationAdjustments(input: TrustScoreInput): {

  points: number;

  penalties: number;

  status: AddressVerificationTrustStatus;

  notes: string[];

  locationQuestionable: boolean;

  locationQuestionableReasons: string[];

} {

  const status = resolveAddressVerificationTrustStatus(

    input.address_geocode_status,

    input.address_mismatch_flags,

  );



  if (status === 'verified') {

    return {

      points: 0,

      penalties: 0,

      status,

      notes: ['Batch geocoding found a real place at this address.'],

      locationQuestionable: false,

      locationQuestionableReasons: [],

    };

  }



  if (status === 'partial_mismatch') {

    const mismatchSummary = formatAddressMismatchSummary(input.address_mismatch_flags);

    return {

      points: 0,

      penalties: 0,

      status,

      notes: mismatchSummary

        ? [`Batch geocoding found the place; source record differs: ${mismatchSummary}.`]

        : ['Batch geocoding found a real place at this address.'],

      locationQuestionable: false,

      locationQuestionableReasons: [],

    };

  }



  if (status === 'partial_geocode') {

    return {

      points: 0,

      penalties: 8,

      status,

      notes: ['Batch geocoding only partially matched this facility address.'],

      locationQuestionable: true,

      locationQuestionableReasons: [

        'Batch geocoding could not fully confirm city and state for this address.',

      ],

    };

  }



  if (status === 'failed') {

    return {

      points: 0,

      penalties: 10,

      status,

      notes: ['Batch geocoding could not resolve this facility address.'],

      locationQuestionable: true,

      locationQuestionableReasons: [

        'Batch geocoding could not verify that a facility exists at this address.',

      ],

    };

  }



  return {

    points: 0,

    penalties: 0,

    status,

    notes: [],

    locationQuestionable: false,

    locationQuestionableReasons: [],

  };

}



function hasCoordinates(input: TrustScoreInput): boolean {

  const lat =

    input.latitude == null || input.latitude === ''

      ? null

      : Number.parseFloat(String(input.latitude));

  const lon =

    input.longitude == null || input.longitude === ''

      ? null

      : Number.parseFloat(String(input.longitude));

  return lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);

}



export function computeTrustScore(input: TrustScoreInput): TrustScoreResult {

  if (input.is_deactivated) {

    return {

      score: 0,

      recommendation: 'This facility has been marked inactive/hidden in this app. Do not use for outreach until reactivated.',

      breakdown: {

        linkValidation: 0,

        contact: 0,

        social: 0,

        profileRichness: 0,

        operational: 0,

        addressVerification: 0,

        credentialing: 0,

        penalties: 0,

      },

      hasUnverifiedClaims: false,

      addressVerificationStatus: 'unchecked',

      locationQuestionable: false,

      locationQuestionableReasons: [],

    };

  }



  const hasWebsite = hasText(input.official_website);

  const hasFacebook = hasText(input.facebook_link);



  const linkValidation =

    linkPoints(input.website_status, hasWebsite, 15) +

    linkPoints(input.facebook_status, hasFacebook, 15);



  const contact =

    (hasText(input.official_phone) ? 12.5 : 0) + (hasText(input.email) ? 12.5 : 0);



  const social = socialEngagementScore(input);

  const profileRichness = profileRichnessScore(input);



  const operational = operationalScore(input);

  const credentialing = credentialingScore(input);



  let penalties = 0;

  if (hasWebsite && input.website_status != null && input.website_status !== 'ok') {

    penalties += 5;

  }

  if (hasFacebook && input.facebook_status != null && input.facebook_status !== 'ok') {

    penalties += 3;

  }



  const verificationAdjustments = verificationPenaltyNotes(input);

  penalties += verificationAdjustments.penalties;



  const addressAdjustments = addressVerificationAdjustments(input);

  penalties += addressAdjustments.penalties;



  const locationQuestionable =

    verificationAdjustments.locationQuestionable || addressAdjustments.locationQuestionable;

  const locationQuestionableReasons = [

    ...verificationAdjustments.locationQuestionableReasons,

    ...addressAdjustments.locationQuestionableReasons,

  ];



  const allNotes = [...verificationAdjustments.notes, ...addressAdjustments.notes];



  const raw =

    linkValidation +

    contact +

    social +

    profileRichness +

    operational +

    credentialing +

    addressAdjustments.points;

  const score = Math.max(0, Math.min(100, Math.round(raw - penalties)));



  const hasUnverifiedClaims =

    profileRichness > 0 ||

    hasText(input.specialties) ||

    hasText(input.procedure) ||

    hasText(input.capability);



  const verifiedImrDoctorsCount = Math.max(
    0,
    toNumber(input.verified_imr_doctors_count) -
      toNumber(input.verified_imr_doctors_blacklisted_count),
  );

  const verifiedImrDoctorsSpecialtyMatched = Math.max(
    0,
    toNumber(input.verified_imr_doctors_specialty_matched_count),
  );



  return {

    score,

    recommendation: recommendationForScore(

      score,

      hasUnverifiedClaims,

      allNotes,

      locationQuestionable,

      locationQuestionableReasons,

      verifiedImrDoctorsCount,

      verifiedImrDoctorsSpecialtyMatched,

    ),

    breakdown: {

      linkValidation,

      contact,

      social,

      profileRichness,

      operational,

      addressVerification: addressAdjustments.points,

      credentialing,

      penalties,

    },

    hasUnverifiedClaims,

    addressVerificationStatus: addressAdjustments.status,

    locationQuestionable,

    locationQuestionableReasons,

  };

}


