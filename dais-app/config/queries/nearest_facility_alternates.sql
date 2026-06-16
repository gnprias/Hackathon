-- @param ref_lat DOUBLE
-- @param ref_lon DOUBLE
-- @param specialty_canonical STRING
-- @param claim_search STRING
-- @param claim_search_2 STRING
WITH contact_filtered AS (
  SELECT
    f.unique_id,
    f.name,
    TRY_CAST(f.latitude AS DOUBLE) AS lat,
    TRY_CAST(f.longitude AS DOUBLE) AS lon,
    f.address_city,
    f.address_stateOrRegion AS address_state_or_region,
    LOWER(CONCAT_WS(
      ' ',
      COALESCE(CAST(f.procedure AS STRING), ''),
      COALESCE(CAST(f.equipment AS STRING), ''),
      COALESCE(CAST(f.capability AS STRING), ''),
      COALESCE(CAST(f.specialties AS STRING), '')
    )) AS claims_text
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  WHERE TRY_CAST(f.latitude AS DOUBLE) BETWEEN -90 AND 90
    AND TRY_CAST(f.longitude AS DOUBLE) BETWEEN -180 AND 180
),
with_distance AS (
  SELECT
    cf.*,
    6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS((cf.lat - :ref_lat) / 2)), 2) +
      COS(RADIANS(:ref_lat)) * COS(RADIANS(cf.lat)) *
      POWER(SIN(RADIANS((cf.lon - :ref_lon) / 2)), 2)
    )) AS distance_km
  FROM contact_filtered cf
),
specialty_ranked AS (
  SELECT
    'specialty' AS match_type,
    wd.unique_id,
    wd.name,
    wd.address_city,
    wd.address_state_or_region,
    wd.distance_km,
    ROW_NUMBER() OVER (ORDER BY wd.distance_km, wd.name) AS rn
  FROM with_distance wd
  INNER JOIN workspace.gold.facility_specialties fs
    ON fs.unique_id = wd.unique_id
  WHERE fs.specialty_canonical = :specialty_canonical
),
claims_ranked AS (
  SELECT
    'claims' AS match_type,
    wd.unique_id,
    wd.name,
    wd.address_city,
    wd.address_state_or_region,
    wd.distance_km,
    ROW_NUMBER() OVER (ORDER BY wd.distance_km, wd.name) AS rn
  FROM with_distance wd
  WHERE :claim_search <> ''
    AND wd.claims_text LIKE CONCAT('%', LOWER(:claim_search), '%')
    AND (
      :claim_search_2 = ''
      OR wd.claims_text LIKE CONCAT('%', LOWER(:claim_search_2), '%')
    )
)
SELECT
  match_type,
  unique_id,
  name,
  address_city,
  address_state_or_region,
  distance_km
FROM specialty_ranked
WHERE rn <= 30
UNION ALL
SELECT
  match_type,
  unique_id,
  name,
  address_city,
  address_state_or_region,
  distance_km
FROM claims_ranked
WHERE rn <= 30
ORDER BY match_type, distance_km, name;
