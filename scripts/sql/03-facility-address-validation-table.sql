CREATE OR REPLACE TABLE workspace.gold.facility_address_validation (
  unique_id STRING NOT NULL COMMENT 'Facility primary key',
  geocode_query STRING COMMENT 'Address string sent to geocoder',
  geocode_provider STRING COMMENT 'google | nominatim | none',
  geocode_status STRING COMMENT 'ok | partial | failed | skipped',
  geocode_formatted_address STRING COMMENT 'Best formatted address from geocoder',
  geocode_lat DOUBLE COMMENT 'Geocoded latitude',
  geocode_lon DOUBLE COMMENT 'Geocoded longitude',
  raw_city STRING COMMENT 'Original address_city from source',
  raw_state_or_region STRING COMMENT 'Original address_stateOrRegion from source',
  raw_zip_or_postcode STRING COMMENT 'Original address_zipOrPostcode from source',
  raw_country_code STRING COMMENT 'Original address_countryCode from source',
  verified_city STRING COMMENT 'Geocoder-resolved city or locality',
  verified_state_or_region STRING COMMENT 'Geocoder-resolved state or admin area',
  verified_zip_or_postcode STRING COMMENT 'Geocoder-resolved postal code',
  verified_country_code STRING COMMENT 'Geocoder-resolved country code',
  mismatch_flags STRING COMMENT 'Comma-separated: city, state, zip, coords',
  checked_at TIMESTAMP NOT NULL COMMENT 'When this row was last validated'
)
COMMENT 'Geocoder-verified facility addresses with normalized city and state/region';
