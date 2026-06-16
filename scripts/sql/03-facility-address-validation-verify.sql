-- Sample checks after running geocode_facilities.py
SELECT geocode_status, COUNT(*) AS n
FROM workspace.gold.facility_address_validation
GROUP BY geocode_status
ORDER BY n DESC;

SELECT mismatch_flags, COUNT(*) AS n
FROM workspace.gold.facility_address_validation
WHERE COALESCE(mismatch_flags, '') <> ''
GROUP BY mismatch_flags
ORDER BY n DESC
LIMIT 30;

SELECT
  raw_state_or_region,
  verified_state_or_region,
  raw_city,
  verified_city,
  COUNT(*) AS n
FROM workspace.gold.facility_address_validation
WHERE geocode_status IN ('ok', 'partial')
GROUP BY 1, 2, 3, 4
ORDER BY n DESC
LIMIT 25;
