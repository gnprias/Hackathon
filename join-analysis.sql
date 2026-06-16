SELECT COUNT(*) AS matched_facility_rows, COUNT(DISTINCT f.unique_id) AS distinct_facilities
FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities f
INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory p
  ON CAST(f.address_zipOrPostcode AS BIGINT) = p.pincode
WHERE f.address_zipOrPostcode IS NOT NULL AND f.address_zipOrPostcode RLIKE '^[0-9]+$';

SELECT COUNT(*) AS pincode_rows_matched_nfhs,
  COUNT(DISTINCT CONCAT(p.district, '|', p.statename)) AS distinct_district_state_pairs
FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory p
INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators n
  ON UPPER(TRIM(p.district)) = UPPER(TRIM(n.district_name))
 AND UPPER(TRIM(p.statename)) = UPPER(TRIM(n.state_ut));

SELECT COUNT(DISTINCT f.unique_id) AS facilities_linked_to_nfhs,
  COUNT(*) AS facility_nfhs_rows
FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities f
INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory p
  ON CAST(f.address_zipOrPostcode AS BIGINT) = p.pincode
INNER JOIN `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators n
  ON UPPER(TRIM(p.district)) = UPPER(TRIM(n.district_name))
 AND UPPER(TRIM(p.statename)) = UPPER(TRIM(n.state_ut))
WHERE f.address_zipOrPostcode IS NOT NULL AND f.address_zipOrPostcode RLIKE '^[0-9]+$';

SELECT COUNT(DISTINCT f.unique_id) AS india_facilities_total
FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities f
WHERE f.address_countryCode = 'IN' OR f.address_country = 'India';
