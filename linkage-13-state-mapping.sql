-- State name mapping fixes for pincode -> NFHS join
WITH pincode_states AS (
  SELECT DISTINCT statename, UPPER(TRIM(statename)) AS state_raw
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
),
nfhs_states AS (
  SELECT DISTINCT state_ut, UPPER(TRIM(state_ut)) AS state_raw
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators
),
mapped AS (
  SELECT
    p.statename AS pincode_state,
    n.state_ut AS nfhs_state,
    CASE
      WHEN p.state_raw = n.state_raw THEN 'exact_norm'
      WHEN p.state_raw = 'MAHARASHTRA' AND n.state_raw = 'MAHARASHTRA' THEN 'maharashtra_typo'
      WHEN p.state_raw = 'DELHI' AND n.state_raw = 'NCT OF DELHI' THEN 'delhi_alias'
      WHEN p.state_raw IN ('JAMMU & KASHMIR', 'JAMMU AND KASHMIR') AND n.state_raw = 'JAMMU & KASHMIR' THEN 'j_k'
      WHEN p.state_raw = 'ORISSA' AND n.state_raw = 'ODISHA' THEN 'odisha_alias'
      ELSE NULL
    END AS match_type
  FROM pincode_states p
  CROSS JOIN nfhs_states n
  WHERE
    p.state_raw = n.state_raw
    OR (p.state_raw = 'MAHARASHTRA' AND n.state_raw = 'MAHARASHTRA')
    OR (p.state_raw = 'DELHI' AND n.state_raw = 'NCT OF DELHI')
    OR (p.state_raw IN ('JAMMU & KASHMIR', 'JAMMU AND KASHMIR') AND n.state_raw = 'JAMMU & KASHMIR')
    OR (p.state_raw = 'ORISSA' AND n.state_raw = 'ODISHA')
)
SELECT pincode_state, nfhs_state, match_type
FROM mapped
ORDER BY pincode_state
