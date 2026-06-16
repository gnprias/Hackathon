import {
  parseAdditionalQualifications,
  parseQualificationYear,
  type AdditionalQualification,
} from '../../shared/imr-doctor-record';
import {
  doctorNameMatchesSearchTokens,
  normalizeImrDoctorSearchName,
} from '../../shared/imr-search-name';
import { formatNmcRequestError, nmcHttpRequest } from './nmc-http';

const NMC_BASE = 'https://www.nmc.org.in/MCIRest/open/getDataFromService';
const NMC_PAGINATED_BASE = 'https://www.nmc.org.in/MCIRest/open/getPaginatedData';
const NMC_IMR_URL = 'https://www.nmc.org.in/information-desk/indian-medical-register/';
const NMC_BLACKLIST_URL =
  'https://www.nmc.org.in/information-desk/indian-medical-register/black-list-doctors/';
const MIN_INTERVAL_MS = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_NAME_PAGE_SIZE = 25;
const MAX_NAME_PAGE_SIZE = 50;

export interface ImrDoctorResult {
  doctorId: string;
  registrationNumber: string;
  smcId: number;
  smcName: string;
  doctorName: string;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  qualification: string | null;
  qualificationYear: number | null;
  yearOfRegistration: number | null;
  registrationDate: string | null;
  permanentAddress: string | null;
  additionalQualifications: AdditionalQualification[];
  profileUrl: string;
  blacklisted: boolean;
  removedStatus: boolean;
  raw: Record<string, unknown>;
  checkedAt: string;
}

export interface ImrDoctorSummary {
  doctorId: string;
  registrationNumber: string;
  smcId: number | null;
  smcName: string;
  doctorName: string;
  fatherName: string | null;
  yearOfRegistration: number | null;
}

export interface ImrNameSearchResult {
  doctors: ImrDoctorSummary[];
  total: number;
  start: number;
  length: number;
  truncated: boolean;
}

interface CacheEntry {
  expiresAt: number;
  value: ImrDoctorResult;
}

const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;

const NMC_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  Origin: 'https://www.nmc.org.in',
  Referer: NMC_IMR_URL,
  'X-Requested-With': 'XMLHttpRequest',
} as const;

function cacheKey(smcId: number, registrationNo: string): string {
  return `${smcId}:${registrationNo.trim().toLowerCase()}`;
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

async function nmcPost(service: string, body: Record<string, unknown>): Promise<unknown> {
  await throttle();
  const url = `${NMC_BASE}?service=${encodeURIComponent(service)}`;
  let response: Awaited<ReturnType<typeof nmcHttpRequest>>;
  try {
    response = await nmcHttpRequest(url, {
      method: 'POST',
      headers: {
        ...NMC_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(formatNmcRequestError(err));
  }

  if (!response.ok) {
    throw new Error(`NMC API returned HTTP ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`NMC API returned unexpected response for ${service}`);
  }
}

async function nmcGetPaginated(
  service: string,
  params: Record<string, string | number>,
): Promise<unknown> {
  await throttle();
  const query = new URLSearchParams({ service, draw: '1' });
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }

  let response: Awaited<ReturnType<typeof nmcHttpRequest>>;
  try {
    response = await nmcHttpRequest(`${NMC_PAGINATED_BASE}?${query}`, {
      method: 'GET',
      headers: NMC_HEADERS,
    });
  } catch (err) {
    throw new Error(formatNmcRequestError(err));
  }

  if (!response.ok) {
    throw new Error(`NMC API returned HTTP ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`NMC API returned unexpected response for ${service}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function parseDoctorIdFromAction(actionHtml: string): string | null {
  const match = /openDoctorDetailsnew\('(\d+)'/i.exec(actionHtml);
  return match?.[1] ?? null;
}

function parsePaginatedRow(row: unknown, smcIdHint?: number): ImrDoctorSummary | null {
  if (!Array.isArray(row) || row.length < 6) return null;

  const yearRaw = row[1];
  const yearOfRegistration =
    typeof yearRaw === 'number'
      ? yearRaw
      : typeof yearRaw === 'string'
        ? Number.parseInt(yearRaw, 10) || null
        : null;
  const registrationNumber = String(row[2] ?? '').trim();
  const smcName = String(row[3] ?? '').trim();
  const doctorName = String(row[4] ?? '').trim();
  const fatherName = String(row[5] ?? '').trim() || null;
  const actionHtml = String(row[6] ?? '');
  const doctorId = parseDoctorIdFromAction(actionHtml);

  if (!doctorId || !registrationNumber || !doctorName) return null;

  return {
    doctorId,
    registrationNumber,
    smcId: smcIdHint ?? null,
    smcName,
    doctorName,
    fatherName,
    yearOfRegistration,
  };
}

async function searchDoctorId(smcId: number, registrationNo: string): Promise<string | null> {
  try {
    const payload = await nmcGetPaginated('getPaginatedDoctor', {
      start: 0,
      length: 5,
      registrationNo: registrationNo,
      smcId,
    });
    const obj = asRecord(payload);
    const rows = Array.isArray(obj?.data) ? (obj.data as unknown[]) : [];
    for (const row of rows) {
      const summary = parsePaginatedRow(row, smcId);
      if (summary?.doctorId) return summary.doctorId;
    }
  } catch {
    // fall through to searchDoctor
  }

  try {
    const payload = await nmcPost('searchDoctor', { registrationNo: registrationNo });
    if (!Array.isArray(payload)) return null;
    for (const item of payload) {
      const record = asRecord(item);
      if (!record) continue;
      const itemSmcId = Number(record.smcId);
      if (itemSmcId === smcId) {
        const id = pickString(record, ['doctorId', 'doctor_id']);
        if (id) return id;
      }
    }
  } catch {
    // no match
  }

  return null;
}

function normalizeDoctorDetail(
  detail: Record<string, unknown>,
  smcId: number,
  registrationNo: string,
  blacklisted: boolean,
): ImrDoctorResult {
  const doctorId = pickString(detail, ['doctorId', 'doctor_id']) ?? '';
  const registrationNumber =
    pickString(detail, ['registrationNo', 'registration_number', 'regnNo']) ?? registrationNo;
  const firstName = pickString(detail, ['firstName', 'doctorName', 'name']) ?? '';
  const lastName = pickString(detail, ['lastName']) ?? '';
  const doctorName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unknown';

  const additionalQualifications = parseAdditionalQualifications(detail);
  const removedStatus = detail.removedStatus === true || detail.removedStatus === 'true';

  return {
    doctorId,
    registrationNumber,
    smcId: Number(detail.smcId ?? smcId),
    smcName: pickString(detail, ['smcName', 'stateMedicalCouncil']) ?? '',
    doctorName,
    firstName,
    lastName,
    fatherName: pickString(detail, ['parentName', 'fatherName']),
    qualification: pickString(detail, ['doctorDegree', 'qualification']),
    qualificationYear: parseQualificationYear(detail),
    yearOfRegistration:
      typeof detail.yearInfo === 'number'
        ? detail.yearInfo
        : typeof detail.yearInfo === 'string'
          ? Number.parseInt(detail.yearInfo, 10) || null
          : null,
    registrationDate: pickString(detail, ['regDate', 'registrationDate']),
    permanentAddress: pickString(detail, ['address', 'addressLine1', 'permanent_address']),
    additionalQualifications,
    profileUrl: `${NMC_IMR_URL}#doctorId=${doctorId}&regNo=${encodeURIComponent(registrationNumber)}`,
    blacklisted: blacklisted || removedStatus,
    removedStatus,
    raw: detail,
    checkedAt: new Date().toISOString(),
  };
}

async function checkBlacklist(smcId: number, registrationNo: string): Promise<boolean> {
  const attempts: Array<{ service: string; body: Record<string, unknown> }> = [
    {
      service: 'searchDoctorInBlackList',
      body: { registrationNo: registrationNo, smcId, regdNoValue: registrationNo },
    },
    {
      service: 'getBlackListDoctorData',
      body: { draw: 1, start: 0, length: 10, registrationNo: registrationNo, smcId },
    },
  ];

  for (const attempt of attempts) {
    try {
      const payload = await nmcPost(attempt.service, attempt.body);
      if (Array.isArray(payload) && payload.length > 0) return true;
      const obj = asRecord(payload);
      if (obj && Array.isArray(obj.data) && obj.data.length > 0) return true;
    } catch {
      // try next service
    }
  }

  return false;
}

function parseSearchDoctorItem(record: Record<string, unknown>): ImrDoctorSummary | null {
  const doctorId = pickString(record, ['doctorId', 'doctor_id']);
  const registrationNumber = pickString(record, ['registrationNo', 'registration_number', 'regnNo']);
  const firstName = pickString(record, ['firstName', 'doctorName', 'name']) ?? '';
  const lastName = pickString(record, ['lastName']) ?? '';
  const doctorName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const smcName = pickString(record, ['smcName', 'stateMedicalCouncil']) ?? '';
  const fatherName = pickString(record, ['parentName', 'fatherName']);
  const smcIdRaw = record.smcId;
  const smcId =
    typeof smcIdRaw === 'number' && Number.isFinite(smcIdRaw)
      ? smcIdRaw
      : typeof smcIdRaw === 'string'
        ? Number.parseInt(smcIdRaw, 10) || null
        : null;
  const yearRaw = record.yearInfo;
  const yearOfRegistration =
    typeof yearRaw === 'number'
      ? yearRaw
      : typeof yearRaw === 'string'
        ? Number.parseInt(yearRaw, 10) || null
        : null;

  if (!doctorId || !registrationNumber || !doctorName) return null;

  return {
    doctorId,
    registrationNumber,
    smcId,
    smcName,
    doctorName,
    fatherName,
    yearOfRegistration,
  };
}

async function searchDoctorsViaSearchDoctor(apiName: string): Promise<ImrDoctorSummary[]> {
  const payload = await nmcPost('searchDoctor', { name: apiName });
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item) => parseSearchDoctorItem(asRecord(item) ?? {}))
    .filter((summary): summary is ImrDoctorSummary => summary != null);
}

function isNmcHttpError(err: unknown, status: number): boolean {
  return err instanceof Error && err.message.includes(`HTTP ${status}`);
}

export async function searchImrDoctorsByName(
  name: string,
  options?: { smcId?: number; start?: number; length?: number },
): Promise<ImrNameSearchResult> {
  const normalized = normalizeImrDoctorSearchName(name);
  const apiName = normalized.apiName.trim();
  if (apiName.length < 3) {
    throw new Error('Doctor name must be at least 3 characters after removing titles');
  }

  const start = options?.start ?? 0;
  const length = Math.min(options?.length ?? DEFAULT_NAME_PAGE_SIZE, MAX_NAME_PAGE_SIZE);
  const params: Record<string, string | number> = {
    start: 0,
    length: Math.max(length, 50),
    name: apiName,
  };
  if (options?.smcId != null) {
    params.smcId = options.smcId;
  }

  let doctors: ImrDoctorSummary[] = [];
  let totalFromApi = 0;

  try {
    const payload = await nmcGetPaginated('getPaginatedDoctor', params);
    const obj = asRecord(payload);
    if (!obj || !Array.isArray(obj.data)) {
      throw new Error('NMC returned an unexpected response for name search');
    }

    totalFromApi =
      typeof obj.recordsFiltered === 'number'
        ? obj.recordsFiltered
        : typeof obj.recordsTotal === 'number'
          ? obj.recordsTotal
          : obj.data.length;

    doctors = (obj.data as unknown[])
      .map((row) => parsePaginatedRow(row, options?.smcId))
      .filter((summary): summary is ImrDoctorSummary => summary != null);
  } catch (err) {
    if (!isNmcHttpError(err, 500)) {
      throw err instanceof Error ? err : new Error('IMR name search failed');
    }

    doctors = await searchDoctorsViaSearchDoctor(apiName);
    totalFromApi = doctors.length;
  }

  if (normalized.filterTokens.length > 1) {
    doctors = doctors.filter((doctor) =>
      doctorNameMatchesSearchTokens(
        doctor.doctorName,
        doctor.fatherName,
        normalized.filterTokens,
      ),
    );
  }

  if (options?.smcId != null) {
    doctors = doctors.filter((doctor) => doctor.smcId === options.smcId);
  }

  const total = normalized.filterTokens.length > 1 ? doctors.length : totalFromApi;
  const page = doctors.slice(start, start + length);

  return {
    doctors: page,
    total,
    start,
    length,
    truncated: total > start + page.length,
  };
}

export async function lookupImrDoctor(
  smcId: number,
  registrationNo: string,
): Promise<ImrDoctorResult> {
  const trimmed = registrationNo.trim();
  if (!trimmed) {
    throw new Error('Registration number is required');
  }

  const key = cacheKey(smcId, trimmed);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const doctorId = await searchDoctorId(smcId, trimmed);
  if (!doctorId) {
    throw new Error('No doctor found for this State Medical Council and registration number');
  }

  const [detailPayload, blacklisted] = await Promise.all([
    nmcPost('getDoctorDetailsByIdImrExt', { doctorId, regdNoValue: trimmed }),
    checkBlacklist(smcId, trimmed),
  ]);

  const detail = asRecord(detailPayload);
  if (!detail || !pickString(detail, ['doctorId', 'registrationNo', 'firstName'])) {
    throw new Error('NMC returned an unexpected response for doctor details');
  }

  const result = normalizeDoctorDetail(detail, smcId, trimmed, blacklisted);
  cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export const NMC_LINKS = {
  imr: NMC_IMR_URL,
  blacklist: NMC_BLACKLIST_URL,
} as const;
