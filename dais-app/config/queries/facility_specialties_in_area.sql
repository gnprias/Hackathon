-- @param zip STRING
-- @param city STRING
-- @param state STRING
-- @param country_code STRING
-- @param filter_has_phone BOOLEAN
-- @param filter_has_email BOOLEAN
-- @param filter_has_working_website BOOLEAN
-- @param filter_has_working_facebook BOOLEAN
-- @param filter_has_social BOOLEAN
WITH filtered_facilities AS (
  SELECT DISTINCT
    fs.specialty_canonical,
    fs.specialty_display,
    fs.unique_id
  FROM workspace.gold.facility_specialties fs
  INNER JOIN databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
    ON f.unique_id = fs.unique_id
  LEFT JOIN workspace.gold.facility_link_validation lv
    ON lv.unique_id = fs.unique_id
  LEFT JOIN workspace.gold.facility_address_validation av
    ON av.unique_id = fs.unique_id
  WHERE (
    :zip = ''
    OR COALESCE(NULLIF(TRIM(av.verified_zip_or_postcode), ''), fs.address_zip_or_postcode) = :zip
  )
    AND (
      :city = ''
      OR LOWER(CASE
      WHEN LENGTH(TRIM(COALESCE(av.verified_city, ''))) > 1
      THEN NULLIF(TRIM(av.verified_city), '')
      ELSE NULLIF(TRIM(fs.address_city), '')
    END) = LOWER(:city)
    )
    AND (
      :state = ''
      OR LOWER(COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), fs.address_state_or_region)) = LOWER(:state)
    )
    AND (:country_code = '' OR LOWER(fs.address_country_code) = LOWER(:country_code))
    AND (
      :filter_has_phone = false
      OR COALESCE(TRIM(f.officialPhone), '') <> ''
    )
    AND (
      :filter_has_email = false
      OR COALESCE(TRIM(f.email), '') <> ''
    )
    AND (
      :filter_has_working_website = false
      OR lv.website_status = 'ok'
    )
    AND (
      :filter_has_working_facebook = false
      OR lv.facebook_status = 'ok'
    )
    AND (
      :filter_has_social = false
      OR COALESCE(TRY_CAST(f.distinct_social_media_presence_count AS INT), 0) > 0
    )
)
SELECT
  specialty_canonical,
  specialty_display,
  COUNT(DISTINCT unique_id) AS facility_count
FROM filtered_facilities
GROUP BY specialty_canonical, specialty_display
ORDER BY facility_count DESC, specialty_display
LIMIT 200;
