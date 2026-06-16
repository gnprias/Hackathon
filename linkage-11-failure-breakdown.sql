-- Breakdown of full-chain failures by reason
WITH india AS (
  SELECT *,
    TRY_CAST(REGEXP_REPLACE(TRIM(address_zipOrPostcode), '[^0-9]', '') AS BIGINT) AS zip_clean
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities
  WHERE address_countryCode = 'IN' OR address_country = 'India'
),
valid_zip AS (
  SELECT * FROM india WHERE zip_clean BETWEEN 100000 AND 999999
),
pincode_hit AS (
  SELECT DISTINCT f.unique_id
  FROM valid_zip f
  INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory p
    ON f.zip_clean = p.pincode
),
nfhs_hit AS (
  SELECT DISTINCT f.unique_id
  FROM valid_zip f
  INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory p
    ON f.zip_clean = p.pincode
  INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators n
    ON UPPER(TRIM(p.district)) = UPPER(TRIM(n.district_name))
   AND UPPER(TRIM(p.statename)) = UPPER(TRIM(n.state_ut))
)
SELECT
  (SELECT COUNT(DISTINCT unique_id) FROM india) AS india_total,
  (SELECT COUNT(DISTINCT unique_id) FROM valid_zip) AS with_valid_zip,
  (SELECT COUNT(DISTINCT unique_id) FROM india WHERE unique_id NOT IN (SELECT unique_id FROM valid_zip)) AS no_valid_zip,
  (SELECT COUNT(DISTINCT unique_id) FROM valid_zip WHERE unique_id NOT IN (SELECT unique_id FROM pincode_hit)) AS zip_no_pincode_match,
  (SELECT COUNT(DISTINCT unique_id) FROM pincode_hit WHERE unique_id NOT IN (SELECT unique_id FROM nfhs_hit)) AS pincode_no_nfhs_match,
  (SELECT COUNT(DISTINCT unique_id) FROM nfhs_hit) AS full_chain_success
