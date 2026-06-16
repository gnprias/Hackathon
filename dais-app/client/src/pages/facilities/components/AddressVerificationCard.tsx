import { Badge, Card, CardContent, CardHeader, CardTitle } from '@databricks/appkit-ui/react';
import { MapPin } from 'lucide-react';
import {
  formatAddressMismatchSummary,
  parseAddressMismatchFlags,
  resolvedAddressField,
  ADDRESS_MISMATCH_LABELS,
} from '../../../../../shared/address-verification';
import { EMPTY_FIELD, formatFieldValue, hasFieldValue } from '../../../../../shared/format-field-value';

interface AddressVerificationCardProps {
  facility: {
    address_city?: string | null;
    address_state_or_region?: string | null;
    address_zip_or_postcode?: string | null;
    address_country_code?: string | null;
    address_geocode_status?: string | null;
    address_geocode_provider?: string | null;
    geocode_formatted_address?: string | null;
    verified_city?: string | null;
    verified_state_or_region?: string | null;
    verified_zip_or_postcode?: string | null;
    address_mismatch_flags?: string | null;
    address_checked_at?: string | null;
  };
}

export function AddressVerificationCard({ facility }: AddressVerificationCardProps) {
  const hasVerification = hasFieldValue(facility.address_geocode_status);
  if (!hasVerification) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Verified address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Address not geocode-verified yet. Run{' '}
            <code className="text-xs">scripts/python/geocode_facilities.py</code> to populate verified
            city and state/region.
          </p>
        </CardContent>
      </Card>
    );
  }

  const mismatchFlags = parseAddressMismatchFlags(facility.address_mismatch_flags);
  const resolvedCity = resolvedAddressField(facility.verified_city, facility.address_city);
  const resolvedState = resolvedAddressField(
    facility.verified_state_or_region,
    facility.address_state_or_region,
  );
  const resolvedZip = resolvedAddressField(
    facility.verified_zip_or_postcode,
    facility.address_zip_or_postcode,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Verified address
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Resolved city</dt>
            <dd>{formatFieldValue(resolvedCity)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Resolved state / region</dt>
            <dd>{formatFieldValue(resolvedState)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Resolved postcode</dt>
            <dd>{formatFieldValue(resolvedZip)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Geocode status</dt>
            <dd>{formatFieldValue(facility.address_geocode_status)}</dd>
          </div>
        </div>

        {hasFieldValue(facility.geocode_formatted_address) && (
          <div>
            <dt className="text-xs text-muted-foreground">Geocoder result</dt>
            <dd className="break-words">{formatFieldValue(facility.geocode_formatted_address)}</dd>
          </div>
        )}

        {mismatchFlags.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Source record differs from {facility.address_geocode_provider ?? 'geocoder'} result:
            </p>
            <div className="flex flex-wrap gap-2">
              {mismatchFlags.map((flag) => (
                <Badge key={flag} variant="outline">
                  {ADDRESS_MISMATCH_LABELS[flag]}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Raw: {formatFieldValue(facility.address_city)},{' '}
              {formatFieldValue(facility.address_state_or_region)},{' '}
              {formatFieldValue(facility.address_zip_or_postcode)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Source city/state/postcode align with the geocoded address.
          </p>
        )}

        {formatAddressMismatchSummary(facility.address_mismatch_flags) && (
          <p className="text-xs text-muted-foreground">
            Search filters use verified values when available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
