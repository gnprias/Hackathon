SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN website_status = 'ok' THEN 1 ELSE 0 END) AS website_ok,
  SUM(CASE WHEN website_status = 'missing' THEN 1 ELSE 0 END) AS website_missing,
  SUM(CASE WHEN website_status IN ('fail', 'timeout', 'error') THEN 1 ELSE 0 END) AS website_not_working,
  SUM(CASE WHEN facebook_status = 'ok' THEN 1 ELSE 0 END) AS facebook_ok,
  SUM(CASE WHEN facebook_status = 'missing' THEN 1 ELSE 0 END) AS facebook_missing,
  SUM(CASE WHEN facebook_status IN ('fail', 'timeout', 'error', 'blocked') THEN 1 ELSE 0 END) AS facebook_not_working
FROM workspace.gold.facility_link_validation;
