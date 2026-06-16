-- NFHS district names for high-impact unmatched pincode districts
SELECT district_name, state_ut
FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators
WHERE UPPER(TRIM(state_ut)) IN ('MAHARASHTRA', 'KARNATAKA', 'WEST BENGAL', 'TAMIL NADU', 'ANDHRA PRADESH', 'DELHI', 'JHARKHAND', 'HARYANA', 'PUNJAB')
  AND (
    UPPER(TRIM(district_name)) LIKE '%PUNE%'
    OR UPPER(TRIM(district_name)) LIKE '%BENGALUR%'
    OR UPPER(TRIM(district_name)) LIKE '%BANGALORE%'
    OR UPPER(TRIM(district_name)) LIKE '%MUMBAI%'
    OR UPPER(TRIM(district_name)) LIKE '%NORTH 24%'
    OR UPPER(TRIM(district_name)) LIKE '%24 PARAGANAS%'
    OR UPPER(TRIM(district_name)) LIKE '%TUTICORIN%'
    OR UPPER(TRIM(district_name)) LIKE '%THOOTH%'
    OR UPPER(TRIM(district_name)) LIKE '%VISAKH%'
    OR UPPER(TRIM(district_name)) LIKE '%EAST SINGH%'
    OR UPPER(TRIM(district_name)) LIKE '%GURUGRAM%'
    OR UPPER(TRIM(district_name)) LIKE '%GURGAON%'
    OR UPPER(TRIM(district_name)) LIKE '%MOHALI%'
    OR UPPER(TRIM(district_name)) LIKE '%SAS NAGAR%'
    OR UPPER(TRIM(district_name)) LIKE '%MEDCHAL%'
    OR UPPER(TRIM(district_name)) LIKE '%CHENGAL%'
  )
ORDER BY state_ut, district_name
