import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { AlertTriangle, ExternalLink, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import type { FacilityVerificationRequest, FacilityVerificationResult } from '../../../../../shared/verification-types';

function verdictVariant(
  verdict: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (verdict === 'likely_match') return 'default';
  if (verdict === 'weak_match') return 'secondary';
  if (verdict === 'skipped' || verdict === 'unknown') return 'outline';
  return 'destructive';
}

function verdictLabel(verdict: string): string {
  return verdict.replace(/_/g, ' ');
}

interface FacilityVerificationCardProps {
  facility: FacilityVerificationRequest;
  loading: boolean;
  error: string | null;
  result: FacilityVerificationResult | null;
  onRefresh: () => void;
}

export function FacilityVerificationCard({
  facility,
  loading,
  error,
  result,
  onRefresh,
}: FacilityVerificationCardProps) {
  const mapLink =
    facility.latitude != null && facility.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${facility.latitude}&mlon=${facility.longitude}#map=15/${facility.latitude}/${facility.longitude}`
      : result?.location.forwardPlace
        ? `https://www.openstreetmap.org/?mlat=${result.location.forwardPlace.lat}&mlon=${result.location.forwardPlace.lon}#map=15/${result.location.forwardPlace.lat}/${result.location.forwardPlace.lon}`
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Website & location cross-check
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Compares the facility website content and map/geocoding results against the listing name
          and location. Results feed into the trust score below.
        </p>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {error && (
          <div className="text-destructive bg-destructive/10 p-3 rounded-md flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && result && (
          <>
            <section className="rounded-md border p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Website relevance</span>
                <Badge variant={verdictVariant(result.website.verdict)}>
                  {verdictLabel(result.website.verdict)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  score {Math.round(result.website.score * 100)}%
                </span>
              </div>
              <p>{result.website.summary}</p>
              {result.website.pageTitle && (
                <p className="text-xs text-muted-foreground">Title: {result.website.pageTitle}</p>
              )}
              {result.website.finalUrl && (
                <a
                  href={result.website.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open checked URL
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {result.website.suspiciousDomain && result.website.suspiciousReason && (
                <p className="text-xs text-destructive flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  {result.website.suspiciousReason}
                </p>
              )}
            </section>

            <section className="rounded-md border p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="font-medium">Map / geocoding</span>
                <Badge variant={verdictVariant(result.location.verdict)}>
                  {verdictLabel(result.location.verdict)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  score {Math.round(result.location.score * 100)}%
                </span>
              </div>
              <p>{result.location.summary}</p>
              {result.location.distanceKm != null && (
                <p className="text-xs text-muted-foreground">
                  Coordinate distance: {result.location.distanceKm.toFixed(1)} km
                </p>
              )}
              {mapLink && (
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View on OpenStreetMap
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                Geocoding provider: {result.providers.geocoding}
                {result.providers.geocoding === 'nominatim' &&
                  ' (set GOOGLE_MAPS_API_KEY for Google Maps accuracy in India)'}
              </p>
            </section>

            <p className="text-xs text-muted-foreground">Checked: {result.checkedAt}</p>
          </>
        )}

        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Re-run checks
        </Button>
      </CardContent>
    </Card>
  );
}
