import { describe, expect, it } from 'vitest';
import { computeTrustScore } from '../shared/trust-score';

describe('computeTrustScore', () => {
  it('scores a strong facility highly', () => {
    const result = computeTrustScore({
      website_status: 'ok',
      facebook_status: 'ok',
      official_website: 'https://example.org',
      facebook_link: 'https://facebook.com/example',
      official_phone: '+91 123',
      email: 'info@example.org',
      distinct_social_media_presence_count: 2,
      post_metrics_post_count: 20,
      engagement_metrics_n_followers: 500,
      specialties: '["cardiology"]',
      procedure: '["CT scan"]',
      claim_rule_status: 'ok',
      claim_rule_score: 1,
      address_geocode_status: 'ok',
      year_established: '1998',
      number_doctors: '12',
      address_city: 'Delhi',
      address_state_or_region: 'Delhi',
    });

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.hasUnverifiedClaims).toBe(true);
    expect(result.breakdown.operational).toBeGreaterThanOrEqual(8);
  });

  it('returns zero for deactivated facilities', () => {
    const result = computeTrustScore({
      is_deactivated: true,
      website_status: 'ok',
      official_phone: '+91 123',
    });

    expect(result.score).toBe(0);
    expect(result.recommendation).toMatch(/inactive/i);
  });

  it('applies penalties for broken links when URLs exist', () => {
    const withBroken = computeTrustScore({
      website_status: 'error',
      official_website: 'https://broken.example',
      facebook_status: 'error',
      facebook_link: 'https://facebook.com/broken',
    });

    const withoutUrls = computeTrustScore({
      website_status: 'missing',
      facebook_status: 'missing',
    });

    expect(withBroken.score).toBeLessThan(withoutUrls.score);
  });

  it('applies verification penalties for wrong website and location mismatch', () => {
    const baseline = computeTrustScore({
      website_status: 'ok',
      official_website: 'https://finance.rajasthan.gov.in',
      address_city: 'Ajmer',
      address_state_or_region: 'Rajasthan',
      latitude: '26.45',
      longitude: '74.64',
    });

    const withMismatch = computeTrustScore({
      website_status: 'ok',
      official_website: 'https://finance.rajasthan.gov.in',
      address_city: 'Ajmer',
      address_state_or_region: 'Rajasthan',
      latitude: '26.45',
      longitude: '74.64',
      website_relevance_verdict: 'likely_mismatch',
      location_verdict: 'likely_mismatch',
    });

    expect(withMismatch.score).toBeLessThan(baseline.score);
    expect(withMismatch.breakdown.penalties).toBeGreaterThanOrEqual(24);
    expect(withMismatch.locationQuestionable).toBe(true);
    expect(withMismatch.recommendation).toMatch(/website/i);
  });

  it('adds operational points when location is verified and map cross-check matches', () => {
    const without = computeTrustScore({
      address_geocode_status: 'ok',
    });

    const withMatch = computeTrustScore({
      address_geocode_status: 'ok',
      latitude: '28.6',
      longitude: '77.2',
      location_verdict: 'likely_match',
    });

    expect(withMatch.breakdown.operational).toBeGreaterThan(without.breakdown.operational);
    expect(withMatch.breakdown.operational).toBeGreaterThanOrEqual(5);
  });

  it('adds operational points when claims support specialties', () => {
    const withoutClaims = computeTrustScore({
      address_geocode_status: 'ok',
      specialties: '["cardiology"]',
      claim_rule_status: 'skipped_no_claims',
    });

    const withClaims = computeTrustScore({
      address_geocode_status: 'ok',
      specialties: '["cardiology"]',
      procedure: '["angioplasty"]',
      claim_rule_status: 'ok',
      claim_rule_score: 1,
    });

    expect(withClaims.breakdown.operational).toBeGreaterThan(withoutClaims.breakdown.operational);
    expect(withClaims.breakdown.operational).toBeGreaterThanOrEqual(8);
  });

  it('tracks address verification status without a separate score line', () => {
    const unchecked = computeTrustScore({
      address_city: 'Ahmedabad',
      address_state_or_region: 'Gujarat',
    });

    const verified = computeTrustScore({
      address_city: 'Ahmedabad',
      address_state_or_region: 'Gujarat',
      address_geocode_status: 'ok',
      address_mismatch_flags: null,
    });

    expect(unchecked.addressVerificationStatus).toBe('unchecked');
    expect(verified.addressVerificationStatus).toBe('verified');
    expect(verified.breakdown.addressVerification).toBe(0);
    expect(verified.breakdown.operational).toBeGreaterThan(unchecked.breakdown.operational);
  });

  it('flags questionable location when batch geocode fails', () => {
    const result = computeTrustScore({
      address_geocode_status: 'failed',
    });

    expect(result.locationQuestionable).toBe(true);
    expect(result.breakdown.operational).toBe(0);
    expect(result.breakdown.penalties).toBeGreaterThanOrEqual(10);
    expect(result.recommendation).toMatch(/Questionable location/i);
  });

  it('flags questionable location when step 4 cross-check cannot find the facility', () => {
    const result = computeTrustScore({
      address_city: 'Delhi',
      address_state_or_region: 'Delhi',
      location_verdict: 'not_found',
    });

    expect(result.locationQuestionable).toBe(true);
    expect(result.recommendation).toMatch(/Questionable location/i);
    expect(result.recommendation).toMatch(/Step 4/i);
  });

  it('adds credentialing bonus for IMR doctors whose qualifications match facility specialty', () => {
    const without = computeTrustScore({
      website_status: 'ok',
      official_website: 'https://example.org',
      specialties: '["ophthalmology"]',
    });

    const withOne = computeTrustScore({
      website_status: 'ok',
      official_website: 'https://example.org',
      specialties: '["ophthalmology"]',
      verified_imr_doctors_count: 1,
      verified_imr_doctors_blacklisted_count: 0,
      verified_imr_doctors_specialty_matched_count: 1,
    });

    const withTwo = computeTrustScore({
      website_status: 'ok',
      official_website: 'https://example.org',
      specialties: '["ophthalmology"]',
      verified_imr_doctors_count: 2,
      verified_imr_doctors_specialty_matched_count: 2,
    });

    expect(withOne.breakdown.credentialing).toBe(3);
    expect(withTwo.breakdown.credentialing).toBe(5);
    expect(withOne.score).toBeGreaterThan(without.score);
    expect(withOne.recommendation).toMatch(/qualifications matching this facility's specialty/i);
  });

  it('does not award credentialing points when saved doctors do not match specialty', () => {
    const result = computeTrustScore({
      verified_imr_doctors_count: 1,
      verified_imr_doctors_blacklisted_count: 0,
      verified_imr_doctors_specialty_matched_count: 0,
      specialties: '["ophthalmology"]',
    });

    expect(result.breakdown.credentialing).toBe(0);
    expect(result.recommendation).toMatch(/do not match listed specialties/i);
  });

  it('does not award credentialing points for blacklisted saved doctors', () => {
    const result = computeTrustScore({
      verified_imr_doctors_count: 1,
      verified_imr_doctors_blacklisted_count: 1,
      verified_imr_doctors_specialty_matched_count: 0,
      specialties: '["ophthalmology"]',
    });

    expect(result.breakdown.credentialing).toBe(0);
  });
});
