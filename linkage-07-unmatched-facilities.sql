-- Sample India facilities that fail the full normalized chain
WITH india AS (
  SELECT *
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities
  WHERE address_countryCode = 'IN' OR address_country = 'India'
),
valid_zip AS (
  SELECT *
  FROM india
  WHERE address_zipOrPostcode IS NOT NULL
    AND TRIM(address_zipOrPostcode) RLIKE '^[0-9]+$'
),
pincode_districts AS (
  SELECT DISTINCT
    pincode,
    district,
    statename,
    UPPER(TRIM(district)) AS district_norm,
    UPPER(TRIM(statename)) AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
),
nfhs AS (
  SELECT
    district_name,
    state_ut,
    UPPER(TRIM(district_name)) AS district_norm,
    UPPER(TRIM(state_ut)) AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators
),
matched AS (
  SELECT DISTINCT f.unique_id
  FROM valid_zip f
  INNER JOIN pincode_districts p
    ON CAST(TRIM(f.address_zipOrPostcode) AS BIGINT) = p.pincode
  INNER JOIN nfhs n
    ON p.district_norm = n.district_norm
   AND p.state_norm = n.state_norm
)
SELECT
  f.name,
  f.address_city,
  f.address_stateOrRegion,
  f.address_zipOrPostcode,
  p.district AS pincode_district,
  p.statename AS pincode_state
FROM valid_zip f
LEFT JOIN matched m ON f.unique_id = m.unique_id
LEFT JOIN pincode_districts p
  ON CAST(TRIM(f.address_zipOrPostcode) AS BIGINT) = p.pincode
WHERE m.unique_id IS NULL
LIMIT 25
