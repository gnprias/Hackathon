-- NFHS Maharashtra and Karnataka district names (major metros)
SELECT district_name, state_ut
FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators
WHERE UPPER(TRIM(state_ut)) IN ('MAHARASHTRA', 'KARNATAKA', 'DELHI', 'JHARKHAND')
ORDER BY state_ut, district_name
