-- Sample checks after running validate_facility_claims.py
SELECT rule_status, COUNT(*) AS n
FROM workspace.gold.facility_claim_validation
GROUP BY rule_status
ORDER BY n DESC;

SELECT consistency_status, consistency_provider, COUNT(*) AS n
FROM workspace.gold.facility_claim_validation
GROUP BY consistency_status, consistency_provider
ORDER BY n DESC;

SELECT mismatch_flags, COUNT(*) AS n
FROM workspace.gold.facility_claim_validation
WHERE COALESCE(mismatch_flags, '') <> ''
GROUP BY mismatch_flags
ORDER BY n DESC
LIMIT 30;

SELECT
  name,
  unsupported_specialties,
  orphan_claim_terms,
  rule_score,
  consistency_score,
  consistency_summary
FROM workspace.gold.facility_claim_validation cv
INNER JOIN databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  ON f.unique_id = cv.unique_id
WHERE cv.rule_status IN ('weak', 'mismatch')
   OR cv.consistency_status IN ('weak', 'mismatch')
ORDER BY COALESCE(cv.consistency_score, cv.rule_score) ASC NULLS LAST
LIMIT 25;
