-- India facility baseline (zip cleaned: digits only)
WITH india AS (
  SELECT *
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities
  WHERE address_countryCode = 'IN' OR address_country = 'India'
),
valid_zip AS (
  SELECT *,
    TRY_CAST(REGEXP_REPLACE(TRIM(address_zipOrPostcode), '[^0-9]', '') AS BIGINT) AS zip_clean
  FROM india
  WHERE address_zipOrPostcode IS NOT NULL
    AND REGEXP_REPLACE(TRIM(address_zipOrPostcode), '[^0-9]', '') RLIKE '^[0-9]+$'
)
SELECT
  (SELECT COUNT(*) FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities) AS all_facilities_total,
  (SELECT COUNT(*) FROM india) AS india_facilities_total,
  (SELECT COUNT(*) FROM valid_zip) AS india_with_clean_numeric_zip,
  (SELECT COUNT(*) FROM valid_zip WHERE zip_clean BETWEEN 100000 AND 999999) AS india_with_6digit_zip,
  (SELECT COUNT(*) FROM india WHERE address_zipOrPostcode IS NULL OR TRIM(address_zipOrPostcode) = '') AS india_missing_zip,
  (SELECT COUNT(*) FROM india WHERE address_zipOrPostcode IS NOT NULL AND TRIM(address_zipOrPostcode) RLIKE '[^0-9]') AS india_zip_with_non_digits
