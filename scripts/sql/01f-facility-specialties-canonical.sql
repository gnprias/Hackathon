CREATE OR REPLACE TABLE workspace.gold.facility_specialties
COMMENT 'One row per facility and canonical specialty, deduped for case/spacing variants'
AS
WITH exploded AS (
  SELECT
    f.unique_id,
    TRIM(specialty) AS specialty_raw,
    f.address_zipOrPostcode AS address_zip_or_postcode,
    f.address_city,
    f.address_stateOrRegion AS address_state_or_region,
    f.address_country,
    f.address_countryCode AS address_country_code
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  LATERAL VIEW explode(from_json(f.specialties, 'array<string>')) t AS specialty
  WHERE f.specialties IS NOT NULL
    AND TRIM(f.specialties) NOT IN ('', '[]', 'null')
    AND specialty IS NOT NULL
    AND TRIM(specialty) <> ''
),
normalized AS (
  SELECT
    unique_id,
    specialty_raw,
    address_zip_or_postcode,
    address_city,
    address_state_or_region,
    address_country,
    address_country_code,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(specialty_raw, '([a-z])([A-Z])', '$1 $2'),
              '&', ' and '
            ),
            '/', ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS specialty_canonical
  FROM exploded
),
facility_canonical AS (
  SELECT DISTINCT
    unique_id,
    specialty_canonical,
    address_zip_or_postcode,
    address_city,
    address_state_or_region,
    address_country,
    address_country_code
  FROM normalized
  WHERE specialty_canonical <> ''
)
SELECT
  fc.unique_id,
  lk.source_specialty AS specialty,
  fc.specialty_canonical,
  lk.specialty_display,
  fc.address_zip_or_postcode,
  fc.address_city,
  fc.address_state_or_region,
  fc.address_country,
  fc.address_country_code,
  current_timestamp() AS built_at
FROM facility_canonical fc
INNER JOIN workspace.gold.specialty_canonical_lookup lk
  ON fc.specialty_canonical = lk.specialty_canonical;
