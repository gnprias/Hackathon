import { describe, expect, it } from 'vitest';
import { assessWebsiteRelevance } from './website-relevance';
import { nameMatchScore } from './name-match';

describe('website relevance', () => {
  it('flags government finance pages that do not match a hospital name', () => {
    const result = assessWebsiteRelevance({
      facilityName: 'Marble City Hospital Kishangarh Ajmer',
      city: 'Ajmer',
      state: 'Rajasthan',
      url: 'https://finance.rajasthan.gov.in/content/finance/en/home.html',
      finalUrl: 'https://finance.rajasthan.gov.in/content/finance/en/home.html',
      pageTitle: 'Department of Finance, Government of Rajasthan',
      metaDescription: 'Finance department portal for Rajasthan government',
      visibleText: 'Department of Finance Government of Rajasthan budget treasury',
      httpStatus: 200,
    });

    expect(result.verdict).toBe('likely_mismatch');
    expect(result.suspiciousDomain).toBe(true);
    expect(result.nameScore).toBeLessThan(0.35);
  });

  it('accepts pages whose content matches the facility name', () => {
    const facilityName = 'Apollo Hospital Delhi';
    const pageText = 'Apollo Hospital Delhi emergency cardiology outpatient services New Delhi';
    expect(nameMatchScore(facilityName, pageText)).toBeGreaterThan(0.5);

    const result = assessWebsiteRelevance({
      facilityName,
      city: 'New Delhi',
      state: 'Delhi',
      url: 'https://delhi.apollohospitals.com',
      finalUrl: 'https://delhi.apollohospitals.com',
      pageTitle: 'Apollo Hospitals Delhi',
      visibleText: pageText,
      httpStatus: 200,
    });

    expect(result.verdict).toBe('likely_match');
  });
});
