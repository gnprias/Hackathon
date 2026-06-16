export type AddressMismatchFlag = 'city' | 'state' | 'zip' | 'coords';

export const ADDRESS_MISMATCH_LABELS: Record<AddressMismatchFlag, string> = {
  city: 'City differs from source',
  state: 'State/region differs from source',
  zip: 'Postcode differs from source',
  coords: 'Coordinates differ from geocoded location',
};

export function parseAddressMismatchFlags(value: string | null | undefined): AddressMismatchFlag[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is AddressMismatchFlag =>
      part === 'city' || part === 'state' || part === 'zip' || part === 'coords',
    );
}

export function formatAddressMismatchSummary(value: string | null | undefined): string {
  const flags = parseAddressMismatchFlags(value);
  if (flags.length === 0) return '';
  return flags.map((flag) => ADDRESS_MISMATCH_LABELS[flag]).join('; ');
}

export function resolvedAddressField(
  verified: string | null | undefined,
  raw: string | null | undefined,
): string | null | undefined {
  const trimmed = verified?.trim();
  return trimmed ? trimmed : raw;
}

export type AddressVerificationTrustStatus =
  | 'verified'
  | 'partial_mismatch'
  | 'partial_geocode'
  | 'failed'
  | 'unchecked';

export const ADDRESS_VERIFICATION_TRUST_LABELS: Record<AddressVerificationTrustStatus, string> = {
  verified: 'Address found at listed location',
  partial_mismatch: 'Address found (source postcode or city differs)',
  partial_geocode: 'Location only partially confirmed',
  failed: 'Address could not be verified',
  unchecked: 'Address not geocode-checked yet',
};

export function resolveAddressVerificationTrustStatus(
  geocodeStatus: string | null | undefined,
  mismatchFlags: string | null | undefined,
): AddressVerificationTrustStatus {
  const status = geocodeStatus?.trim().toLowerCase();
  if (!status) return 'unchecked';
  if (status === 'failed') return 'failed';
  if (status === 'partial') return 'partial_geocode';
  if (status === 'ok') {
    return parseAddressMismatchFlags(mismatchFlags).length > 0 ? 'partial_mismatch' : 'verified';
  }
  return 'unchecked';
}
