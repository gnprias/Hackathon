export interface ReferenceLocationInput {
  referenceAddress: string;
  city: string;
  state: string;
  zip: string;
  countryCode: string;
}

export function buildReferenceGeocodeQuery(criteria: ReferenceLocationInput): string {
  return [
    criteria.referenceAddress.trim(),
    criteria.city.trim(),
    criteria.state.trim(),
    criteria.zip.trim(),
    criteria.countryCode.trim(),
  ]
    .filter(Boolean)
    .join(', ');
}

export function hasReferenceLocation(
  criteria: Pick<ReferenceLocationInput, 'referenceAddress' | 'city'>,
): boolean {
  return criteria.city.trim() !== '' || criteria.referenceAddress.trim() !== '';
}
