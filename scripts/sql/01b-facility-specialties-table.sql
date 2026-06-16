CREATE OR REPLACE TABLE workspace.gold.facility_specialties
COMMENT 'One row per facility and distinct specialty, with location for regional filters'
AS
WITH exploded AS (
  SELECT
    f.unique_id,
    TRIM(specialty) AS specialty,
    f.address_zipOrPostcode AS address_zip_or_postcode,
    f.address_city,
    f.address_stateOrRegion AS address_state_or_region,
    f.address_country,
    f.address_countryCode AS address_country_code
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  LATERAL VIEW explode(
    from_json(f.specialties, 'array<string>')
  ) t AS specialty
  WHERE f.specialties IS NOT NULL
    AND TRIM(f.specialties) NOT IN ('', '[]', 'null')
    AND specialty IS NOT NULL
    AND TRIM(specialty) <> ''
)
SELECT DISTINCT
  unique_id,
  specialty,
  INITCAP(
    REGEXP_REPLACE(
      REGEXP_REPLACE(specialty, '([a-z])([A-Z])', '$1 $2'),
      'And', 'and'
    )
  ) AS specialty_display,
  address_zip_or_postcode,
  address_city,
  address_state_or_region,
  address_country,
  address_country_code,
  current_timestamp() AS built_at
FROM exploded;
