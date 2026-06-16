-- Example district-level correlation: facility count vs institutional birth rate
WITH india AS (
  SELECT *,
    TRY_CAST(REGEXP_REPLACE(TRIM(address_zipOrPostcode), '[^0-9]', '') AS BIGINT) AS zip_clean
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities
  WHERE address_countryCode = 'IN' OR address_country = 'India'
),
pincode_districts AS (
  SELECT DISTINCT pincode, district, statename,
    UPPER(TRIM(district)) AS district_norm,
    UPPER(TRIM(statename)) AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
),
facility_district AS (
  SELECT DISTINCT
    n.district_name,
    n.state_ut,
    f.unique_id
  FROM india f
  INNER JOIN pincode_districts p ON f.zip_clean = p.pincode
  INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators n
    ON UPPER(TRIM(p.district)) = UPPER(TRIM(n.district_name))
   AND UPPER(TRIM(p.statename)) = UPPER(TRIM(n.state_ut))
  WHERE f.zip_clean BETWEEN 100000 AND 999999
),
district_counts AS (
  SELECT district_name, state_ut, COUNT(DISTINCT unique_id) AS facility_count
  FROM facility_district
  GROUP BY 1, 2
)
SELECT
  d.district_name,
  d.state_ut,
  d.facility_count,
  n.institutional_birth_5y_pct,
  n.all_w15_49_who_are_anaemic_pct,
  n.child_6_59m_who_are_anaemic_lt_11_0_g_dl_22_pct,
  n.births_attended_by_skilled_hp_5y_10_pct
FROM district_counts d
INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators n
  ON d.district_name = n.district_name AND d.state_ut = n.state_ut
ORDER BY d.facility_count DESC
LIMIT 20
