-- Full chain with state aliases + district normalization
WITH india AS (
  SELECT *,
    TRY_CAST(REGEXP_REPLACE(TRIM(address_zipOrPostcode), '[^0-9]', '') AS BIGINT) AS zip_clean
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities
  WHERE address_countryCode = 'IN' OR address_country = 'India'
),
pincode_districts AS (
  SELECT DISTINCT
    pincode,
    district,
    statename,
    UPPER(TRIM(district)) AS district_norm,
    CASE UPPER(TRIM(statename))
      WHEN 'MAHARASHTRA' THEN 'MAHARASHTRA_CANON'
      WHEN 'DELHI' THEN 'NCT OF DELHI'
      WHEN 'ORISSA' THEN 'ODISHA'
      ELSE UPPER(TRIM(statename))
    END AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
),
nfhs AS (
  SELECT *,
    UPPER(TRIM(district_name)) AS district_norm,
    CASE UPPER(TRIM(state_ut))
      WHEN 'MAHARASHTRA' THEN 'MAHARASHTRA_CANON'  -- NFHS typo: Maharastra
      ELSE UPPER(TRIM(state_ut))
    END AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators
),
district_alias AS (
  SELECT * FROM VALUES
    ('BENGALURU URBAN', 'BANGALORE'),
    ('BENGALURU RURAL', 'BANGALORE RURAL'),
    ('MYSURU', 'MYSORE'),
    ('BELAGAVI', 'BELGAUM'),
    ('TUMAKURU', 'TUMKUR'),
    ('GURUGRAM', 'GURGAON'),
    ('TUTICORIN', 'THOOTHUKKUDI'),
    ('VISAKHAPATANAM', 'VISAKHAPATNAM'),
    ('24 PARAGANAS NORTH', 'NORTH TWENTY FOUR PARGANAS'),
    ('24 PARAGANAS SOUTH', 'SOUTH TWENTY FOUR PARGANAS'),
    ('PURBA BARDHAMAN', 'PURBA BARDHAMAN'),
    ('PASCHIM BARDHAMAN', 'PASCHIM BARDHAMAN'),
    ('EAST SINGHBUM', 'PURBI SINGHBHUM'),
    ('MEDCHAL MALKAJGIRI', 'MEDCHAL MALKAJGIRI'),
    ('S.A.S NAGAR', 'SAHIBZADA AJIT SINGH NAGAR'),
    ('S.A.S. NAGAR', 'SAHIBZADA AJIT SINGH NAGAR')
  AS t(pincode_district_norm, nfhs_district_norm)
),
chain AS (
  SELECT DISTINCT f.unique_id
  FROM india f
  INNER JOIN pincode_districts p ON f.zip_clean = p.pincode
  INNER JOIN nfhs n
    ON (
         p.district_norm = n.district_norm
      OR EXISTS (
        SELECT 1 FROM district_alias a
        WHERE a.pincode_district_norm = p.district_norm
          AND a.nfhs_district_norm = n.district_norm
      )
    )
   AND p.state_norm = n.state_norm
  WHERE f.zip_clean BETWEEN 100000 AND 999999
)
SELECT
  (SELECT COUNT(DISTINCT unique_id) FROM india) AS india_total,
  (SELECT COUNT(*) FROM chain) AS facilities_with_mapped_chain,
  ROUND(100.0 * (SELECT COUNT(*) FROM chain) / NULLIF((SELECT COUNT(DISTINCT unique_id) FROM india), 0), 2) AS pct_india_mapped
