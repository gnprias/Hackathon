-- Pincode district/state joined to NFHS (exact vs normalized)
WITH pincode_districts AS (
  SELECT DISTINCT
    pincode,
    district,
    statename,
    UPPER(TRIM(district)) AS district_norm,
    UPPER(TRIM(statename)) AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
),
nfhs AS (
  SELECT
    district_name,
    state_ut,
    UPPER(TRIM(district_name)) AS district_norm,
    UPPER(TRIM(state_ut)) AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators
),
exact_match AS (
  SELECT DISTINCT p.pincode, p.district, p.statename
  FROM pincode_districts p
  INNER JOIN nfhs n
    ON p.district = n.district_name
   AND p.statename = n.state_ut
),
norm_match AS (
  SELECT DISTINCT p.pincode, p.district, p.statename
  FROM pincode_districts p
  INNER JOIN nfhs n
    ON p.district_norm = n.district_norm
   AND p.state_norm = n.state_norm
)
SELECT
  (SELECT COUNT(*) FROM pincode_districts) AS distinct_pincode_district_pairs,
  (SELECT COUNT(DISTINCT pincode) FROM pincode_districts) AS distinct_pincodes,
  (SELECT COUNT(*) FROM exact_match) AS pincode_district_pairs_exact_nfhs,
  (SELECT COUNT(DISTINCT pincode) FROM exact_match) AS pincodes_exact_nfhs,
  (SELECT COUNT(*) FROM norm_match) AS pincode_district_pairs_norm_nfhs,
  (SELECT COUNT(DISTINCT pincode) FROM norm_match) AS pincodes_norm_nfhs,
  ROUND(100.0 * (SELECT COUNT(DISTINCT pincode) FROM exact_match) / NULLIF((SELECT COUNT(DISTINCT pincode) FROM pincode_districts), 0), 2) AS pct_pincodes_exact,
  ROUND(100.0 * (SELECT COUNT(DISTINCT pincode) FROM norm_match) / NULLIF((SELECT COUNT(DISTINCT pincode) FROM pincode_districts), 0), 2) AS pct_pincodes_norm
