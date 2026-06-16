WITH normalized AS (
  SELECT
    TRIM(specialty) AS specialty_raw,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(TRIM(specialty), '([a-z])([A-Z])', '$1 $2'),
              '&', ' and '
            ),
            '/', ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS specialty_canonical
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  LATERAL VIEW explode(from_json(f.specialties, 'array<string>')) t AS specialty
),
filtered AS (
  SELECT * FROM normalized WHERE specialty_canonical <> ''
)
SELECT
  COUNT(DISTINCT specialty_raw) AS raw_variant_codes,
  COUNT(DISTINCT specialty_canonical) AS canonical_specialties,
  COUNT(DISTINCT specialty_raw) - COUNT(DISTINCT specialty_canonical) AS variants_merged
FROM filtered;
