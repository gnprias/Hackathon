-- @param search_text STRING
-- @param zip STRING
-- @param city STRING
-- @param state STRING
-- @param country_code STRING
SELECT
  f.unique_id,
  f.name,
  COALESCE(NULLIF(TRIM(av.verified_city), ''), f.address_city) AS city,
  COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), f.address_stateOrRegion) AS state_or_region
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
LEFT JOIN workspace.gold.facility_address_validation av
  ON av.unique_id = f.unique_id
WHERE f.unique_id RLIKE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND :search_text <> ''
  AND (
    LOWER(COALESCE(f.name, '')) LIKE CONCAT('%', LOWER(:search_text), '%')
    OR LOWER(COALESCE(CAST(f.description AS STRING), '')) LIKE CONCAT('%', LOWER(:search_text), '%')
  )
  AND (
    :zip = ''
    OR COALESCE(NULLIF(TRIM(av.verified_zip_or_postcode), ''), f.address_zipOrPostcode) = :zip
  )
  AND (
    :city = ''
    OR LOWER(COALESCE(NULLIF(TRIM(av.verified_city), ''), f.address_city)) = LOWER(:city)
    OR LOWER(COALESCE(f.name, '')) LIKE CONCAT('%', LOWER(:city), '%')
    OR LOWER(COALESCE(CAST(f.description AS STRING), '')) LIKE CONCAT('%', LOWER(:city), '%')
  )
  AND (
    :state = ''
    OR LOWER(COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), f.address_stateOrRegion)) = LOWER(:state)
  )
  AND (
    :country_code = ''
    OR LOWER(COALESCE(f.address_countryCode, '')) = LOWER(:country_code)
  )
ORDER BY
  CASE
    WHEN LOWER(f.name) = LOWER(:search_text) THEN 0
    WHEN LOWER(f.name) LIKE CONCAT(LOWER(:search_text), '%') THEN 1
    WHEN LOWER(f.name) LIKE CONCAT('%', LOWER(:search_text), '%') THEN 2
    ELSE 3
  END,
  f.name
LIMIT 25
