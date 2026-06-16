-- @param country_code STRING
-- @param state STRING
-- @param zip STRING
SELECT DISTINCT
  CASE
    WHEN LENGTH(TRIM(COALESCE(av.verified_city, ''))) > 1
    THEN NULLIF(TRIM(av.verified_city), '')
    ELSE NULLIF(TRIM(fs.address_city), '')
  END AS city
FROM workspace.gold.facility_specialties fs
LEFT JOIN workspace.gold.facility_address_validation av
  ON av.unique_id = fs.unique_id
WHERE CASE
    WHEN LENGTH(TRIM(COALESCE(av.verified_city, ''))) > 1
    THEN NULLIF(TRIM(av.verified_city), '')
    ELSE NULLIF(TRIM(fs.address_city), '')
  END IS NOT NULL
  AND LENGTH(TRIM(CASE
    WHEN LENGTH(TRIM(COALESCE(av.verified_city, ''))) > 1
    THEN NULLIF(TRIM(av.verified_city), '')
    ELSE NULLIF(TRIM(fs.address_city), '')
  END)) > 1
  AND (:country_code = '' OR LOWER(fs.address_country_code) = LOWER(:country_code))
  AND (
    :state = ''
    OR LOWER(COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), fs.address_state_or_region)) = LOWER(:state)
  )
  AND (
    :zip = ''
    OR COALESCE(NULLIF(TRIM(av.verified_zip_or_postcode), ''), fs.address_zip_or_postcode) = :zip
  )
ORDER BY city;
