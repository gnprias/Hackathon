-- Quick verification after running 01-facility-specialties.sql

SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT unique_id) AS facilities,
       COUNT(DISTINCT specialty) AS distinct_specialties
FROM workspace.gold.facility_specialties;

-- Sample specialties for pincode 151001 (Bathinda)
SELECT specialty, specialty_display, COUNT(DISTINCT unique_id) AS facility_count
FROM workspace.gold.facility_specialties
WHERE REGEXP_REPLACE(TRIM(address_zip_or_postcode), '[^0-9]', '') = '151001'
GROUP BY specialty, specialty_display
ORDER BY facility_count DESC, specialty_display
LIMIT 15;
