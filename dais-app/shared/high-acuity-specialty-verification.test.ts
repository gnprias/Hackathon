import { describe, expect, it } from 'vitest';
import {
  highAcuityServicesScore,
  resolveHighAcuitySpecialtyVerification,
} from './high-acuity-specialty-verification';

describe('resolveHighAcuitySpecialtyVerification', () => {
  it('marks oncology verified when specialty and procedure text align', () => {
    const result = resolveHighAcuitySpecialtyVerification({
      specialties: '["oncology", "radiology"]',
      procedure: '["chemotherapy", "radiotherapy"]',
    });

    const oncology = result.specialties.find((item) => item.id === 'oncology');
    expect(oncology?.claimed).toBe(true);
    expect(oncology?.status).toBe('verified');
    expect(oncology?.evidence).toEqual(expect.arrayContaining(['specialty', 'claims']));
    expect(result.overallStatus).toBe('ok');
  });

  it('marks ICU partial when only specialty is listed', () => {
    const result = resolveHighAcuitySpecialtyVerification({
      specialties: '["intensive care"]',
    });

    const icu = result.specialties.find((item) => item.id === 'icu');
    expect(icu?.status).toBe('partial');
    expect(icu?.evidence).toEqual(['specialty']);
  });

  it('marks emergency verified with IMR emergency medicine qualification', () => {
    const result = resolveHighAcuitySpecialtyVerification({
      specialties: '["emergency medicine"]',
      imrDoctors: [
        {
          qualification: 'MD Emergency Medicine',
          additionalQualifications: [],
          blacklisted: false,
        },
      ],
    });

    const emergency = result.specialties.find((item) => item.id === 'emergency');
    expect(emergency?.status).toBe('verified');
    expect(emergency?.evidence).toEqual(expect.arrayContaining(['specialty', 'imr']));
  });

  it('returns none when no high-acuity services are indicated', () => {
    const result = resolveHighAcuitySpecialtyVerification({
      specialties: '["dermatology"]',
      procedure: '["skin biopsy"]',
    });

    expect(result.claimedCount).toBe(0);
    expect(result.overallStatus).toBe('none');
  });

  it('covers all required specialties', () => {
    const result = resolveHighAcuitySpecialtyVerification({});
    expect(result.specialties.map((item) => item.id)).toEqual([
      'icu',
      'maternity',
      'emergency',
      'oncology',
      'trauma',
      'nicu',
    ]);
  });

  it('marks maternity verified from obstetrics specialty and delivery claims', () => {
    const result = resolveHighAcuitySpecialtyVerification({
      specialties: '["obstetrics and gynaecology"]',
      capability: '["delivery suite", "caesarean section"]',
    });

    const maternity = result.specialties.find((item) => item.id === 'maternity');
    expect(maternity?.claimed).toBe(true);
    expect(maternity?.status).toBe('verified');
  });

  it('marks NICU partial from claim text only', () => {
    const result = resolveHighAcuitySpecialtyVerification({
      capability: '["NICU beds", "incubator care"]',
    });

    const nicu = result.specialties.find((item) => item.id === 'nicu');
    expect(nicu?.claimed).toBe(true);
    expect(nicu?.status).toBe('partial');
  });

  it('marks trauma verified from specialty and trauma center capability', () => {
    const result = resolveHighAcuitySpecialtyVerification({
      specialties: '["orthopaedic trauma"]',
      capability: '["trauma centre"]',
    });

    const trauma = result.specialties.find((item) => item.id === 'trauma');
    expect(trauma?.status).toBe('verified');
  });
});

describe('highAcuityServicesScore', () => {
  it('awards no points when no high-acuity services are claimed', () => {
    const verification = resolveHighAcuitySpecialtyVerification({
      specialties: '["dermatology"]',
    });
    expect(highAcuityServicesScore(verification)).toBe(0);
  });

  it('awards 3 points for one corroborated service', () => {
    const verification = resolveHighAcuitySpecialtyVerification({
      specialties: '["oncology"]',
      procedure: '["chemotherapy"]',
    });
    expect(highAcuityServicesScore(verification)).toBe(3);
  });

  it('awards 5 points when all claimed services are corroborated and at least two claimed', () => {
    const verification = resolveHighAcuitySpecialtyVerification({
      specialties: '["oncology", "emergency medicine", "intensive care"]',
      procedure: '["chemotherapy", "triage"]',
      capability: '["icu beds"]',
    });
    expect(verification.verifiedCount).toBeGreaterThanOrEqual(2);
    expect(highAcuityServicesScore(verification)).toBe(5);
  });
});
