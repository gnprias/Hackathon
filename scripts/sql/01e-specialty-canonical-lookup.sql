-- Rebuild specialty tables with canonical deduplication (case, spacing, camelCase, & /)

CREATE OR REPLACE TABLE workspace.gold.specialty_canonical_lookup
COMMENT 'One canonical specialty label per normalized specialty key'
AS
WITH exploded AS (
  SELECT
    f.unique_id,
    TRIM(specialty) AS specialty_raw
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  LATERAL VIEW explode(from_json(f.specialties, 'array<string>')) t AS specialty
  WHERE f.specialties IS NOT NULL
    AND TRIM(f.specialties) NOT IN ('', '[]', 'null')
    AND specialty IS NOT NULL
    AND TRIM(specialty) <> ''
),
normalized AS (
  SELECT
    unique_id,
    specialty_raw,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(specialty_raw, '([a-z])([A-Z])', '$1 $2'),
              '&', ' and '
            ),
            '/', ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS specialty_canonical
  FROM exploded
),
variant_stats AS (
  SELECT
    specialty_canonical,
    specialty_raw,
    INITCAP(
      REGEXP_REPLACE(
        REGEXP_REPLACE(specialty_canonical, '\\band\\b', 'and'),
        '\\s+',
        ' '
      )
    ) AS specialty_display,
    COUNT(DISTINCT unique_id) AS facility_count
  FROM normalized
  WHERE specialty_canonical <> ''
  GROUP BY specialty_canonical, specialty_raw
),
ranked AS (
  SELECT
    specialty_canonical,
    specialty_raw,
    specialty_display,
    facility_count,
    ROW_NUMBER() OVER (
      PARTITION BY specialty_canonical
      ORDER BY
        facility_count DESC,
        CASE WHEN specialty_raw RLIKE '^[a-z]+([A-Z][a-z]*)+$' THEN 0 ELSE 1 END,
        LENGTH(specialty_raw) DESC,
        specialty_raw
    ) AS pick_rank
  FROM variant_stats
)
SELECT
  specialty_canonical,
  specialty_raw AS source_specialty,
  specialty_display,
  facility_count,
  current_timestamp() AS built_at
FROM ranked
WHERE pick_rank = 1;
