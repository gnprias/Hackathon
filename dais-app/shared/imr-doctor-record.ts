export interface AdditionalQualification {
  qualification: string;
  year: number | null;
}

export interface FacilityImrDoctorRecord {
  id: number;
  uniqueId: string;
  doctorId: string | null;
  firstName: string;
  lastName: string;
  yearOfRegistration: number | null;
  registrationNumber: string;
  smcId: number;
  smcName: string;
  qualification: string | null;
  qualificationYear: number | null;
  additionalQualifications: AdditionalQualification[];
  blacklisted: boolean;
  lookedUpAt: string;
  createdAt: string;
}

export function parseDoctorNameParts(
  doctorName: string,
  firstName?: string | null,
  lastName?: string | null,
): { firstName: string; lastName: string } {
  const explicitFirst = firstName?.trim() ?? '';
  const explicitLast = lastName?.trim() ?? '';
  if (explicitFirst || explicitLast) {
    return { firstName: explicitFirst, lastName: explicitLast };
  }

  const parts = doctorName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function parseYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseAdditionalQualifications(
  detail: Record<string, unknown>,
): AdditionalQualification[] {
  const results: AdditionalQualification[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const qualification =
      typeof detail[`addlqual${index}`] === 'string'
        ? (detail[`addlqual${index}`] as string).trim()
        : '';
    if (!qualification) continue;

    const year = parseYear(
      detail[`addlqual${index}Year`] ??
        detail[`addlqualYear${index}`] ??
        detail[`addl_qual_year${index}`],
    );

    results.push({ qualification, year });
  }

  return results;
}

export function parseQualificationYear(detail: Record<string, unknown>): number | null {
  return parseYear(
    detail.qualYear ??
      detail.qualificationYear ??
      detail.degreeYear ??
      detail.yearOfQualification,
  );
}
