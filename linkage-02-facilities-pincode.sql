-- Facilities joined to India Post pincode directory on zip/pincode
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
joined AS (
  SELECT DISTINCT f.unique_id
  FROM valid_zip f
  INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory p
    ON CAST(TRIM(f.address_zipOrPostcode) AS BIGINT) = p.pincode
)
SELECT
  (SELECT COUNT(*) FROM valid_zip) AS facility_rows_with_numeric_zip,
  (SELECT COUNT(DISTINCT unique_id) FROM valid_zip) AS distinct_facilities_with_numeric_zip,
  (SELECT COUNT(*) FROM joined) AS distinct_facilities_matched_to_pincode,
  ROUND(100.0 * (SELECT COUNT(*) FROM joined) / NULLIF((SELECT COUNT(DISTINCT unique_id) FROM india), 0), 2) AS pct_india_facilities_matched
