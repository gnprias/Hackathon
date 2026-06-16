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
  specialty_canonical,
  COUNT(DISTINCT specialty) AS variant_count,
  COLLECT_SET(specialty) AS variants
FROM expanded
GROUP BY specialty_canonical
HAVING COUNT(DISTINCT specialty) > 1
ORDER BY variant_count DESC
LIMIT 20;
