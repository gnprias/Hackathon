-- Facilities-pincode join with cleaned zip (digits only)
WITH india AS (
  SELECT *,
    TRY_CAST(REGEXP_REPLACE(TRIM(address_zipOrPostcode), '[^0-9]', '') AS BIGINT) AS zip_clean
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities
  WHERE address_countryCode = 'IN' OR address_country = 'India'
),
valid_zip AS (
  SELECT * FROM india
  WHERE zip_clean IS NOT NULL AND zip_clean BETWEEN 100000 AND 999999
),
joined AS (
  SELECT DISTINCT f.unique_id
  FROM valid_zip f
  INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory p
    ON f.zip_clean = p.pincode
)
SELECT
  (SELECT COUNT(DISTINCT unique_id) FROM valid_zip) AS distinct_facilities_with_6digit_zip,
  (SELECT COUNT(*) FROM joined) AS distinct_facilities_matched_to_pincode,
  ROUND(100.0 * (SELECT COUNT(*) FROM joined) / NULLIF((SELECT COUNT(DISTINCT unique_id) FROM india), 0), 2) AS pct_india_facilities_matched
