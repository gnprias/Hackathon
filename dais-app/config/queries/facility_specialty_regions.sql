-- @param specialty_canonical STRING
SELECT
  COALESCE(
    NULLIF(TRIM(av.verified_state_or_region), ''),
    fs.address_state_or_region,
    'Unknown region'
  ) AS state_or_region,
  COUNT(DISTINCT fs.unique_id) AS facility_count
FROM workspace.gold.facility_specialties fs
LEFT JOIN workspace.gold.facility_address_validation av
  ON av.unique_id = fs.unique_id
WHERE fs.specialty_canonical = :specialty_canonical
GROUP BY 1
ORDER BY facility_count DESC, state_or_region
LIMIT 25
