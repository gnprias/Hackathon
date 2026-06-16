import { describe, expect, it } from 'vitest';
import {
  computeImrDoctorTrustCounts,
  doctorMatchesFacilitySpecialties,
  qualificationMatchesSpecialty,
} from './imr-specialty-match';
import type { FacilityImrDoctorRecord } from './imr-doctor-record';

function doctor(
  overrides: Partial<FacilityImrDoctorRecord> = {},
): FacilityImrDoctorRecord {
  return {
    id: 1,
    uniqueId: 'fac-1',
    doctorId: '1',
    firstName: 'Test',
    lastName: 'Doctor',
    yearOfRegistration: 2010,
    registrationNumber: '123',
    smcId: 1,
    smcName: 'Test Council',
    qualification: 'MBBS',
    qualificationYear: 2008,
    additionalQualifications: [],
    blacklisted: false,
    lookedUpAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('qualificationMatchesSpecialty', () => {
  it('matches ophthalmology qualifications for an eye hospital specialty', () => {
    expect(qualificationMatchesSpecialty('MS Ophthalmology', 'ophthalmology')).toBe(true);
    expect(qualificationMatchesSpecialty('DOMS', 'Ophthalmology')).toBe(true);
    expect(qualificationMatchesSpecialty('DNB (Ophthalmology)', 'ophthalmology')).toBe(true);
  });

  it('does not match MBBS alone', () => {
    expect(qualificationMatchesSpecialty('MBBS', 'ophthalmology')).toBe(false);
  });

  it('matches cardiology qualifications', () => {
    expect(qualificationMatchesSpecialty('DM Cardiology', 'cardiology')).toBe(true);
    expect(qualificationMatchesSpecialty('MD (Medicine)', 'cardiology')).toBe(false);
  });
});

describe('doctorMatchesFacilitySpecialties', () => {
  it('matches when an additional qualification fits the facility specialty', () => {
    const record = doctor({
      qualification: 'MBBS',
      additionalQualifications: [{ qualification: 'MS Ophthalmology', year: 2012 }],
    });

    expect(doctorMatchesFacilitySpecialties(record, '["ophthalmology"]')).toBe(true);
  });

  it('does not match unrelated postgraduate qualifications', () => {
    const record = doctor({
      qualification: 'MS General Surgery',
    });

    expect(doctorMatchesFacilitySpecialties(record, '["ophthalmology"]')).toBe(false);
  });

  it('ignores blacklisted doctors', () => {
    const record = doctor({
      qualification: 'MS Ophthalmology',
      blacklisted: true,
    });

    expect(doctorMatchesFacilitySpecialties(record, '["ophthalmology"]')).toBe(false);
  });
});

describe('computeImrDoctorTrustCounts', () => {
  it('counts only specialty-matched active doctors', () => {
    const counts = computeImrDoctorTrustCounts(
      [
        doctor({ qualification: 'MS Ophthalmology' }),
        doctor({ id: 2, qualification: 'MS General Surgery' }),
        doctor({ id: 3, qualification: 'MS Ophthalmology', blacklisted: true }),
      ],
      '["ophthalmology"]',
    );

    expect(counts.total).toBe(3);
    expect(counts.specialtyMatched).toBe(1);
    expect(counts.activeSpecialtyMatched).toBe(1);
  });
});
