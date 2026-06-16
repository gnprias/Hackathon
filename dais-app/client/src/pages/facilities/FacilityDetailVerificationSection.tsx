import { FacilityVerificationCard } from './components/FacilityVerificationCard';
import { TrustScoreCard } from './components/TrustScoreCard';
import { useFacilityVerification } from './use-facility-verification';
import type { TrustScoreInput } from '../../../../shared/trust-score';

interface FacilityDetailVerificationSectionProps {
  facility: {
    unique_id?: string | null;
    name?: string | null;
    official_website?: string | null;
    website_working_url?: string | null;
    website_status?: string | null;
    facebook_status?: string | null;
    facebook_link?: string | null;
    official_phone?: string | null;
    email?: string | null;
    address_city?: string | null;
    address_state_or_region?: string | null;
    address_country?: string | null;
    address_geocode_status?: string | null;
    address_mismatch_flags?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    distinct_social_media_presence_count?: string | number | null;
    post_metrics_post_count?: string | number | null;
    engagement_metrics_n_followers?: string | number | null;
    engagement_metrics_n_engagements?: string | number | null;
    specialties?: unknown;
    procedure?: unknown;
    capability?: unknown;
    description?: string | null;
    year_established?: string | null;
    number_doctors?: string | null;
  };
  isDeactivated: boolean;
  imrDoctorTrustCounts: {
    total: number;
    blacklisted: number;
    active: number;
    specialtyMatched: number;
    activeSpecialtyMatched: number;
  };
}

export function FacilityDetailVerificationSection({
  facility,
  isDeactivated,
  imrDoctorTrustCounts,
}: FacilityDetailVerificationSectionProps) {
  const { loading, error, result, refresh } = useFacilityVerification(facility);

  return (
    <>
      <FacilityVerificationCard
        facility={facility}
        loading={loading}
        error={error}
        result={result}
        onRefresh={() => void refresh()}
      />
      <TrustScoreCard
        facility={{
          ...(facility as TrustScoreInput & { name?: string | null }),
          is_deactivated: isDeactivated,
          verified_imr_doctors_count: imrDoctorTrustCounts.total,
          verified_imr_doctors_blacklisted_count: imrDoctorTrustCounts.blacklisted,
          verified_imr_doctors_specialty_matched_count:
            imrDoctorTrustCounts.activeSpecialtyMatched,
        }}
        verification={result}
        verificationLoading={loading}
      />
    </>
  );
}
