-- Verify canonical specialty deduplication

SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT unique_id) AS facilities,
  COUNT(DISTINCT specialty_canonical) AS canonical_specialties,
  COUNT(DISTINCT specialty) AS source_specialty_codes,
  COUNT(DISTINCT specialty_display) AS display_labels
FROM workspace.gold.facility_specialties;

SELECT
  specialty_canonical,
  specialty_display,
  COUNT(DISTINCT unique_id) AS facility_count
FROM workspace.gold.facility_specialties
WHERE REGEXP_REPLACE(TRIM(address_zip_or_postcode), '[^0-9]', '') = '151001'
GROUP BY specialty_canonical, specialty_display
ORDER BY facility_count DESC, specialty_display
LIMIT 12;
