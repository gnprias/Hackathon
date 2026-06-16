-- @param country_code STRING
-- @param city STRING
-- @param zip STRING
SELECT DISTINCT
  COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), fs.address_state_or_region) AS state
FROM workspace.gold.facility_specialties fs
LEFT JOIN workspace.gold.facility_address_validation av
  ON av.unique_id = fs.unique_id
WHERE COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), fs.address_state_or_region) IS NOT NULL
  AND TRIM(COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), fs.address_state_or_region)) <> ''
  AND (:country_code = '' OR LOWER(fs.address_country_code) = LOWER(:country_code))
  AND (
    :city = ''
    OR LOWER(COALESCE(NULLIF(TRIM(av.verified_city), ''), fs.address_city)) = LOWER(:city)
  )
  AND (
    :zip = ''
    OR COALESCE(NULLIF(TRIM(av.verified_zip_or_postcode), ''), fs.address_zip_or_postcode) = :zip
  )
ORDER BY state;
