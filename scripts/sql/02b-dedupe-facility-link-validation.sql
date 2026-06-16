CREATE OR REPLACE TABLE workspace.gold.facility_link_validation
COMMENT 'Precomputed website and Facebook reachability checks per facility (deduped)'
AS
SELECT
  unique_id,
  official_website_raw,
  websites_all_raw,
  websites_checked_count,
  official_website_url,
  website_working_url,
  website_status,
  website_http_code,
  website_error,
  facebook_url_raw,
  facebook_url,
  facebook_status,
  facebook_http_code,
  facebook_error,
  checked_at
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY unique_id ORDER BY checked_at DESC) AS rn
  FROM workspace.gold.facility_link_validation
)
WHERE rn = 1;
