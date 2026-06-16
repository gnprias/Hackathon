-- @param country_code STRING
-- @param state STRING
-- @param zip STRING
SELECT DISTINCT
  COALESCE(NULLIF(TRIM(av.verified_city), ''), fs.address_city) AS city
FROM workspace.gold.facility_specialties fs
LEFT JOIN workspace.gold.facility_address_validation av
  ON av.unique_id = fs.unique_id
WHERE COALESCE(NULLIF(TRIM(av.verified_city), ''), fs.address_city) IS NOT NULL
  AND TRIM(COALESCE(NULLIF(TRIM(av.verified_city), ''), fs.address_city)) <> ''
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
