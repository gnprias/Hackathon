-- Facilities chained to NFHS via pincode (normalized district+state)
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
chain_norm AS (
  SELECT DISTINCT f.unique_id
  FROM valid_zip f
  INNER JOIN pincode_districts p
    ON CAST(TRIM(f.address_zipOrPostcode) AS BIGINT) = p.pincode
  INNER JOIN nfhs n
    ON p.district_norm = n.district_norm
   AND p.state_norm = n.state_norm
),
chain_exact AS (
  SELECT DISTINCT f.unique_id
  FROM valid_zip f
  INNER JOIN pincode_districts p
    ON CAST(TRIM(f.address_zipOrPostcode) AS BIGINT) = p.pincode
  INNER JOIN nfhs n
    ON p.district = n.district_name
   AND p.statename = n.state_ut
)
SELECT
  (SELECT COUNT(DISTINCT unique_id) FROM india) AS india_facilities_total,
  (SELECT COUNT(*) FROM chain_exact) AS facilities_linked_nfhs_exact,
  (SELECT COUNT(*) FROM chain_norm) AS facilities_linked_nfhs_norm,
  ROUND(100.0 * (SELECT COUNT(*) FROM chain_exact) / NULLIF((SELECT COUNT(DISTINCT unique_id) FROM india), 0), 2) AS pct_india_exact,
  ROUND(100.0 * (SELECT COUNT(*) FROM chain_norm) / NULLIF((SELECT COUNT(DISTINCT unique_id) FROM india), 0), 2) AS pct_india_norm
