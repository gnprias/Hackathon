CREATE OR REPLACE TABLE workspace.gold.facility_link_validation (
  unique_id STRING NOT NULL COMMENT 'Facility primary key',
  official_website_raw STRING COMMENT 'Original officialWebsite value from source',
  websites_all_raw STRING COMMENT 'JSON array of all raw website URLs collected for checking',
  websites_checked_count INT COMMENT 'Number of distinct website URLs checked',
  official_website_url STRING COMMENT 'First working URL, or officialWebsite normalized if none work',
  website_working_url STRING COMMENT 'First URL that returned ok',
  website_status STRING COMMENT 'ok if any URL works; fail if all fail; missing if no URLs',
  website_http_code INT COMMENT 'HTTP code from first working URL, or last attempted',
  website_error STRING COMMENT 'Summary when no URL works',
  facebook_url_raw STRING COMMENT 'Original facebookLink value from source',
  facebook_url STRING COMMENT 'Normalized Facebook URL used for the check',
  facebook_status STRING COMMENT 'ok | fail | timeout | missing | blocked | error',
  facebook_http_code INT COMMENT 'Last HTTP status code, if any',
  facebook_error STRING COMMENT 'Error detail when status is fail/timeout/blocked/error',
  checked_at TIMESTAMP NOT NULL COMMENT 'When this row was last validated'
)
COMMENT 'Precomputed website and Facebook reachability checks per facility';
