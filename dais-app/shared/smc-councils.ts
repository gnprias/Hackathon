/** State Medical Council IDs used by NMC MCIRest (partial list; extend as needed). */
import { normalizeForMatch } from './name-match';

export const STATE_MEDICAL_COUNCILS = [
  { id: 1, name: 'Andhra Pradesh Medical Council' },
  { id: 2, name: 'Arunachal Pradesh Medical Council' },
  { id: 3, name: 'Assam Medical Council' },
  { id: 4, name: 'Bihar Medical Council' },
  { id: 5, name: 'Chhattisgarh Medical Council' },
  { id: 6, name: 'Delhi Medical Council' },
  { id: 7, name: 'Goa Medical Council' },
  { id: 8, name: 'Gujarat Medical Council' },
  { id: 9, name: 'Haryana Medical Council' },
  { id: 10, name: 'Himachal Pradesh Medical Council' },
  { id: 11, name: 'Jammu & Kashmir Medical Council' },
  { id: 12, name: 'Jharkhand Medical Council' },
  { id: 13, name: 'Karnataka Medical Council' },
  { id: 14, name: 'Kerala Medical Council' },
  { id: 15, name: 'Madhya Pradesh Medical Council' },
  { id: 16, name: 'Maharashtra Medical Council' },
  { id: 17, name: 'Manipur Medical Council' },
  { id: 18, name: 'Meghalaya Medical Council' },
  { id: 19, name: 'Mizoram Medical Council' },
  { id: 20, name: 'Nagaland Medical Council' },
  { id: 21, name: 'Orissa Council of Medical Registration' },
  { id: 22, name: 'Punjab Medical Council' },
  { id: 23, name: 'Rajasthan Medical Council' },
  { id: 24, name: 'Sikkim Medical Council' },
  { id: 25, name: 'Tamil Nadu Medical Council' },
  { id: 26, name: 'Telangana State Medical Council' },
  { id: 27, name: 'Tripura State Medical Council' },
  { id: 28, name: 'Uttar Pradesh Medical Council' },
  { id: 29, name: 'Uttarakhand Medical Council' },
  { id: 30, name: 'West Bengal Medical Council' },
] as const;

export type SmcCouncil = (typeof STATE_MEDICAL_COUNCILS)[number];

export function getSmcName(smcId: number): string | undefined {
  return STATE_MEDICAL_COUNCILS.find((c) => c.id === smcId)?.name;
}

export function getSmcIdByName(smcName: string): number | undefined {
  const normalized = smcName.trim().toLowerCase();
  return STATE_MEDICAL_COUNCILS.find((c) => c.name.toLowerCase() === normalized)?.id;
}

function councilStateLabel(name: string): string {
  return normalizeForMatch(
    name
      .replace(/\s+medical council$/i, '')
      .replace(/\s+council of medical registration$/i, '')
      .replace(/\s+state medical council$/i, ''),
  );
}

const STATE_REGION_ALIASES: Record<string, number> = {
  odisha: 21,
  orissa: 21,
  'nct of delhi': 6,
  'new delhi': 6,
  delhi: 6,
  'jammu and kashmir': 11,
  'jammu & kashmir': 11,
  'uttar pradesh': 28,
  up: 28,
  'madhya pradesh': 15,
  mp: 15,
  'tamil nadu': 25,
  tn: 25,
  'west bengal': 30,
  wb: 30,
  telangana: 26,
  'andhra pradesh': 1,
  ap: 1,
  maharashtra: 16,
  mh: 16,
  gujarat: 8,
  gj: 8,
  rajasthan: 23,
  rj: 23,
  karnataka: 13,
  ka: 13,
  kerala: 14,
  kl: 14,
  punjab: 22,
  pb: 22,
  haryana: 9,
  hr: 9,
  bihar: 4,
  br: 4,
  assam: 3,
  as: 3,
  chhattisgarh: 5,
  cg: 5,
  jharkhand: 12,
  jh: 12,
  uttarakhand: 29,
  uk: 29,
  himachal: 10,
  'himachal pradesh': 10,
  hp: 10,
  goa: 7,
  manipur: 17,
  meghalaya: 18,
  mizoram: 19,
  nagaland: 20,
  sikkim: 24,
  tripura: 27,
  'arunachal pradesh': 2,
};

const STATE_REGION_TO_SMC_ID = (() => {
  const map = new Map<string, number>();
  for (const council of STATE_MEDICAL_COUNCILS) {
    map.set(councilStateLabel(council.name), council.id);
  }
  for (const [alias, id] of Object.entries(STATE_REGION_ALIASES)) {
    map.set(normalizeForMatch(alias), id);
  }
  return map;
})();

/** Map a facility state/region (verified or source) to an NMC State Medical Council id. */
export function getSmcIdByStateRegion(stateOrRegion: string | null | undefined): number | undefined {
  const normalized = normalizeForMatch(stateOrRegion ?? '');
  if (!normalized) return undefined;

  const direct = STATE_REGION_TO_SMC_ID.get(normalized);
  if (direct != null) return direct;

  for (const [label, id] of STATE_REGION_TO_SMC_ID.entries()) {
    if (normalized.includes(label) || label.includes(normalized)) {
      return id;
    }
  }

  return undefined;
}

export function getSmcNameByStateRegion(stateOrRegion: string | null | undefined): string | undefined {
  const id = getSmcIdByStateRegion(stateOrRegion);
  return id == null ? undefined : getSmcName(id);
}
