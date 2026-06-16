-- Near-miss district names: same state in NFHS, different district spelling
WITH pincode_pairs AS (
  SELECT DISTINCT
    district,
    statename,
    UPPER(TRIM(district)) AS district_norm,
    UPPER(TRIM(statename)) AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
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
  SELECT p.district, p.statename, p.district_norm, p.state_norm
  FROM pincode_pairs p
  LEFT JOIN nfhs_pairs n
    ON p.district_norm = n.district_norm
   AND p.state_norm = n.state_norm
  WHERE n.district_name IS NULL
)
SELECT
  u.district AS pincode_district,
  u.statename AS pincode_state,
  n.district_name AS nfhs_district_candidate,
  n.state_ut AS nfhs_state
FROM unmatched u
INNER JOIN nfhs_pairs n
  ON u.state_norm = n.state_norm
 AND (
      u.district_norm LIKE CONCAT('%', n.district_norm, '%')
   OR n.district_norm LIKE CONCAT('%', u.district_norm, '%')
 )
ORDER BY u.district, n.district_name
LIMIT 40
