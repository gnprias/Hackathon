-- @param zip STRING
-- @param city STRING
-- @param state STRING
-- @param country_code STRING
-- @param specialty_canonical STRING
-- @param claim_search STRING
-- @param claim_search_2 STRING
-- @param filter_has_phone BOOLEAN
-- @param filter_has_email BOOLEAN
-- @param filter_has_working_website BOOLEAN
-- @param filter_has_working_facebook BOOLEAN
-- @param filter_has_social BOOLEAN
WITH contact_filtered AS (
  SELECT
    f.unique_id,
    f.name,
    f.facilityTypeId AS facility_type_id,
    f.operatorTypeId AS operator_type_id,
    f.yearEstablished AS year_established,
    f.procedure,
    f.equipment,
    f.capability,
    f.specialties,
    f.email,
    f.officialPhone AS official_phone,
    f.numberDoctors AS number_doctors,
    COALESCE(lv.website_working_url, f.officialWebsite) AS website,
    lv.website_status,
    lv.facebook_status,
    LOWER(CONCAT_WS(
      ' ',
      COALESCE(CAST(f.procedure AS STRING), ''),
      COALESCE(CAST(f.equipment AS STRING), ''),
      COALESCE(CAST(f.capability AS STRING), ''),
      COALESCE(CAST(f.specialties AS STRING), '')
    )) AS claims_text
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  LEFT JOIN workspace.gold.facility_link_validation lv
    ON lv.unique_id = f.unique_id
  WHERE (
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
),
specialty_matches AS (
  SELECT DISTINCT fs.unique_id
  FROM workspace.gold.facility_specialties fs
  INNER JOIN contact_filtered cf
    ON cf.unique_id = fs.unique_id
  LEFT JOIN workspace.gold.facility_address_validation av
    ON av.unique_id = fs.unique_id
  WHERE fs.specialty_canonical = :specialty_canonical
    AND (
      :zip = ''
      OR COALESCE(NULLIF(TRIM(av.verified_zip_or_postcode), ''), fs.address_zip_or_postcode) = :zip
    )
    AND (
      :city = ''
      OR LOWER(COALESCE(NULLIF(TRIM(av.verified_city), ''), fs.address_city)) = LOWER(:city)
    )
    AND (
      :state = ''
      OR LOWER(COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), fs.address_state_or_region)) = LOWER(:state)
    )
    AND (:country_code = '' OR LOWER(fs.address_country_code) = LOWER(:country_code))
),
in_area AS (
  SELECT DISTINCT fs.unique_id
  FROM workspace.gold.facility_specialties fs
  LEFT JOIN workspace.gold.facility_address_validation av
    ON av.unique_id = fs.unique_id
  WHERE (
    :zip = ''
    OR COALESCE(NULLIF(TRIM(av.verified_zip_or_postcode), ''), fs.address_zip_or_postcode) = :zip
  )
    AND (
      :city = ''
      OR LOWER(COALESCE(NULLIF(TRIM(av.verified_city), ''), fs.address_city)) = LOWER(:city)
    )
    AND (
      :state = ''
      OR LOWER(COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), fs.address_state_or_region)) = LOWER(:state)
    )
    AND (:country_code = '' OR LOWER(fs.address_country_code) = LOWER(:country_code))
  UNION
  SELECT DISTINCT f.unique_id
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  LEFT JOIN workspace.gold.facility_address_validation av
    ON av.unique_id = f.unique_id
  WHERE (
    :zip = ''
    OR COALESCE(NULLIF(TRIM(av.verified_zip_or_postcode), ''), f.address_zipOrPostcode) = :zip
  )
    AND (
      :city = ''
      OR LOWER(COALESCE(NULLIF(TRIM(av.verified_city), ''), f.address_city)) = LOWER(:city)
    )
    AND (
      :state = ''
      OR LOWER(COALESCE(NULLIF(TRIM(av.verified_state_or_region), ''), f.address_stateOrRegion)) = LOWER(:state)
    )
    AND (:country_code = '' OR LOWER(f.address_countryCode) = LOWER(:country_code))
),
claims_matches AS (
  SELECT DISTINCT cf.unique_id
  FROM contact_filtered cf
  INNER JOIN in_area ia
    ON ia.unique_id = cf.unique_id
  WHERE :claim_search <> ''
    AND cf.claims_text LIKE CONCAT('%', LOWER(:claim_search), '%')
    AND (
      :claim_search_2 = ''
      OR cf.claims_text LIKE CONCAT('%', LOWER(:claim_search_2), '%')
    )
),
candidate_ids AS (
  SELECT unique_id FROM specialty_matches
  UNION
  SELECT unique_id FROM claims_matches
),
tiered AS (
  SELECT
    c.unique_id,
    CASE
      WHEN :claim_search = '' THEN CAST(NULL AS STRING)
      WHEN sm.unique_id IS NOT NULL AND cm.unique_id IS NOT NULL THEN 'full'
      WHEN sm.unique_id IS NOT NULL THEN 'specialty_only'
      ELSE 'claims_only'
    END AS match_tier,
    CASE
      WHEN :claim_search = '' THEN 0
      WHEN sm.unique_id IS NOT NULL AND cm.unique_id IS NOT NULL THEN 0
      WHEN sm.unique_id IS NOT NULL THEN 1
      ELSE 2
    END AS tier_sort
  FROM candidate_ids c
  LEFT JOIN specialty_matches sm
    ON sm.unique_id = c.unique_id
  LEFT JOIN claims_matches cm
    ON cm.unique_id = c.unique_id
)
SELECT
  cf.unique_id,
  cf.name,
  cf.facility_type_id,
  cf.operator_type_id,
  cf.year_established,
  cf.procedure,
  cf.equipment,
  cf.capability,
  cf.specialties,
  cf.email,
  cf.website,
  cf.official_phone,
  cf.number_doctors,
  cf.website_status,
  cf.facebook_status,
  t.match_tier
FROM tiered t
INNER JOIN contact_filtered cf
  ON cf.unique_id = t.unique_id
ORDER BY t.tier_sort, cf.name
LIMIT 500;
