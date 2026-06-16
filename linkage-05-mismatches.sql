-- District/state pairs in pincode directory that fail normalized NFHS join
WITH pincode_pairs AS (
  SELECT DISTINCT
    district,
    statename,
    UPPER(TRIM(district)) AS district_norm,
    UPPER(TRIM(statename)) AS state_norm,
    COUNT(DISTINCT pincode) AS pincode_count
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
  GROUP BY 1, 2, 3, 4
),
nfhs_pairs AS (
  SELECT DISTINCT
    district_name,
    state_ut,
    UPPER(TRIM(district_name)) AS district_norm,
    UPPER(TRIM(state_ut)) AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators
),
unmatched AS (
  SELECT p.*
  FROM pincode_pairs p
  LEFT JOIN nfhs_pairs n
    ON p.district_norm = n.district_norm
   AND p.state_norm = n.state_norm
  WHERE n.district_name IS NULL
)
SELECT district, statename, pincode_count
FROM unmatched
ORDER BY pincode_count DESC
LIMIT 30
