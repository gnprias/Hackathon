-- Analyze specialty canonicalization (run after table exists)

WITH expanded AS (
  SELECT
    specialty,
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(TRIM(specialty), '([a-z])([A-Z])', '$1 $2'),
        '[^a-z0-9]',
        ''
      )
    ) AS specialty_canonical
  FROM workspace.gold.facility_specialties
)
SELECT
  COUNT(DISTINCT specialty) AS raw_codes,
  COUNT(DISTINCT specialty_canonical) AS canonical_codes,
  COUNT(DISTINCT specialty) - COUNT(DISTINCT specialty_canonical) AS merged_variants
FROM expanded;
