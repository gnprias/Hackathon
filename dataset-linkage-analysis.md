# Virtue Foundation Dataset — Table Linkage Analysis

**Workspace:** `dbc-69c2f85e-61ee`  
**Catalog:** `databricks_virtue_foundation_dataset_dais_2026`  
**Schema:** `virtue_foundation_dataset`  
**Analysis date:** 2026-06-15  
**SQL files:** `linkage-01-baseline.sql` through `linkage-14-improved-chain.sql`

---

## Executive answer: Can you link facilities?

**Yes — but only indirectly, and only for ~63–73% of India facilities today.**

There is **no direct key** between `facilities` and `nfhs_5_district_health_indicators`. The workable path is a **two-hop bridge**:

```
facilities  ──(zip/pincode)──►  india_post_pincode_directory  ──(district + state)──►  nfhs_5_district_health_indicators
```

| Hop | Match rate | Notes |
|-----|------------|-------|
| Facilities → pincode | **97.2%** of India facilities | Strong; zip codes are reliable |
| Pincode → NFHS (district) | **72.2%** of pincodes | Moderate; naming mismatches |
| **Full chain** (basic join) | **63.0%** of India facilities (6,294 / 9,989) | Usable for district-level correlation |
| **Full chain** (with alias map) | **72.7%** of India facilities (7,261 / 9,989) | Recommended for analysis |

Roughly **one in four India facilities cannot reach NFHS** without additional fuzzy matching, geocoding, or manual district alias tables.

---

## Table overview

| Table | Rows | Primary key | Role in linkage |
|-------|------|-------------|-----------------|
| `facilities` | 10,088 | `unique_id` | Facility grain — specialties, location, org type |
| `india_post_pincode_directory` | 165,627 | `pincode`, `officename` | Bridge: zip → district + state |
| `nfhs_5_district_health_indicators` | 706 | `district_name`, `state_ut` | District grain — ~100 NFHS-5 health % columns |

**Scope note:** 10,000 of 10,088 facility rows are India (`address_countryCode = 'IN'` or `address_country = 'India'`). Analysis below uses the India subset (9,989 distinct `unique_id` values).

---

## Join path 1: Facilities → Pincode

### Keys

```sql
-- Clean zip: strip non-digits, cast to BIGINT
TRY_CAST(REGEXP_REPLACE(TRIM(f.address_zipOrPostcode), '[^0-9]', '') AS BIGINT) = p.pincode
```

### Results

| Metric | Count | % of India facilities |
|--------|------:|----------------------:|
| India facilities (distinct) | 9,989 | 100% |
| Valid 6-digit zip | 9,912 | 99.2% |
| Matched to pincode directory | **9,707** | **97.2%** |
| Zip present but no pincode match | 205 | 2.1% |
| No valid zip | 77 | 0.8% |

### Assessment

**Strong link.** Pincode is the best join key for facilities. Failures are mostly malformed zips (e.g. `560 052` with a space), invalid codes, or rare pincodes missing from the directory.

**Caveat:** One pincode maps to **multiple post offices** (`officename` is part of the PK). For district assignment, use `SELECT DISTINCT pincode, district, statename` or aggregate to one district per pincode before joining to NFHS.

---

## Join path 2: Pincode → NFHS (district + state)

### Keys tested

| Method | Pincode match rate | Verdict |
|--------|-------------------:|---------|
| Exact (`district = district_name AND statename = state_ut`) | **0%** | Unusable — case and spelling differ |
| Normalized (`UPPER(TRIM(...))` on both sides) | **72.2%** (14,146 / 19,586 pincodes) | Baseline |

### Why exact match fails

| Pincode `statename` | NFHS `state_ut` | Issue |
|--------------------|-----------------|-------|
| `MAHARASHTRA` | `Maharastra` | **Typo in NFHS** — `UPPER` yields `MAHARASHTRA` vs `MAHARASHTRA` (missing `H`) |
| `DELHI` | `NCT of Delhi` | Different administrative label |
| `ORISSA` | `Odisha` | Renamed state |

### District name mismatches (top unmatched pincode districts)

| Pincode `district` | Pincode `statename` | Pincodes affected | Likely NFHS name |
|--------------------|--------------------|------------------:|------------------|
| `NA` | `NA` | 338 | — (data quality) |
| `PUNE` | `MAHARASHTRA` | 150 | `Pune` (blocked by state typo until aliased) |
| `24 PARAGANAS NORTH` | `WEST BENGAL` | 144 | `North Twenty Four Pargana` |
| `BENGALURU URBAN` | `KARNATAKA` | 117 | `Bangalore` |
| `BELAGAVI` | `KARNATAKA` | 113 | `Belgaum` |
| `TUTICORIN` | `TAMIL NADU` | 92 | `Thoothukkudi` |
| `MEDINIPUR EAST` | `WEST BENGAL` | 88 | `Purba Medinipur` |
| `VISAKHAPATANAM` | `ANDHRA PRADESH` | 72 | `Visakhapatnam` (pincode typo) |
| `MYSURU` | `KARNATAKA` | 69 | `Mysore` |
| `GURUGRAM` | `HARYANA` | — | `Gurgaon` |

Near-miss examples (substring matches within same state):

| Pincode district | NFHS district |
|-----------------|---------------|
| `BHADOHI` | `Sant Ravidas Nagar (Bhadohi)` |
| `CHAMARAJANAGARA` | `Chamarajanagar` |
| `EAST NIMAR` | `Khandwa (East Nimar)` |
| `KAMRUP METRO` | `Kamrup Metropolitan` |
| `WARANGAL` | `Warangal Rural` / `Warangal Urban` |
| `SRI MUKTSAR SAHIB` | `Muktsar` |

### Assessment

**Moderate link with required normalization.** A simple `UPPER(TRIM())` join recovers ~72% of pincodes. The remaining ~28% need a **district alias lookup table** and **state alias rules** (see recommended path below).

---

## Join path 3: Full chain (Facilities → NFHS)

### Failure breakdown (India facilities)

| Stage | Facilities lost | Cumulative linked |
|-------|----------------:|------------------:|
| Start | — | 9,989 |
| No valid 6-digit zip | 77 | 9,912 |
| Zip not in pincode directory | 205 | 9,707 |
| Pincode district/state not in NFHS | **3,413** | **6,294** |
| **Full chain success (basic)** | — | **6,294 (63.0%)** |
| **With state + district aliases** | — | **7,261 (72.7%)** |

### Sample unmatched facilities (pincode found, NFHS failed)

| Facility | City | Zip | Pincode district | Root cause |
|----------|------|-----|------------------|------------|
| Dr DY Patil Medical College | Pune | 411018 | PUNE | State typo `Maharastra` (fixable) |
| St. Martha's Hospital | Bengaluru | 560001 | BENGALURU URBAN | District rename → `Bangalore` |
| Jaslok Hospital | Mumbai | 400026 | MUMBAI | State typo (fixable with alias) |
| Bhagat Hospital | Janakpuri | 110045 | SOUTH WEST | Delhi: `DELHI` vs `NCT of Delhi` |
| Tata Main Hospital | Jamshedpur | 831001 | EAST SINGHBUM | `Purbi Singhbhum` |
| Aravind Eye Hospital | Hyderabad | 110002 | CENTRAL (Delhi) | **Wrong zip code** in source data |

---

## Recommended join path

```sql
-- Step 1: India facilities with cleaned zip
WITH facilities_in AS (
  SELECT
    f.*,
    TRY_CAST(REGEXP_REPLACE(TRIM(f.address_zipOrPostcode), '[^0-9]', '') AS BIGINT) AS zip_clean
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.facilities f
  WHERE f.address_countryCode = 'IN' OR f.address_country = 'India'
),

-- Step 2: One district per pincode (dedupe post offices)
pincode_district AS (
  SELECT DISTINCT
    pincode,
    district,
    statename,
    UPPER(TRIM(district)) AS district_norm,
    CASE UPPER(TRIM(statename))
      WHEN 'MAHARASHTRA' THEN 'MAHARASHTRA_CANON'
      WHEN 'DELHI'        THEN 'NCT OF DELHI'
      WHEN 'ORISSA'       THEN 'ODISHA'
      ELSE UPPER(TRIM(statename))
    END AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.india_post_pincode_directory
),

-- Step 3: NFHS with normalized keys
nfhs AS (
  SELECT
    n.*,
    UPPER(TRIM(n.district_name)) AS district_norm,
    CASE UPPER(TRIM(n.state_ut))
      WHEN 'MAHARASHTRA' THEN 'MAHARASHTRA_CANON'  -- NFHS typo: Maharastra
      ELSE UPPER(TRIM(n.state_ut))
    END AS state_norm
  FROM `databricks_virtue_foundation_dataset_dais_2026`.virtue_foundation_dataset.nfhs_5_district_health_indicators n
)

-- Step 4: Chain join (add district_alias table for renames — see linkage-14-improved-chain.sql)
SELECT f.unique_id, f.name, f.specialties, p.district, n.district_name, n.state_ut,
       n.institutional_birth_5y_pct, n.all_w15_49_who_are_anaemic_pct
FROM facilities_in f
JOIN pincode_district p ON f.zip_clean = p.pincode
JOIN nfhs n
  ON p.district_norm = n.district_norm   -- plus alias table for renames
 AND p.state_norm = n.state_norm
WHERE f.zip_clean BETWEEN 100000 AND 999999;
```

**Grain for correlation:** Aggregate facilities to **district × state** before joining NFHS (NFHS is district-level; facilities are point-level).

---

## Meaningful correlations (district-level)

Once facilities are aggregated per district, these NFHS columns pair naturally with facility attributes:

| Analysis | Facility side | NFHS indicator | Hypothesis |
|----------|--------------|----------------|------------|
| Supply vs institutional delivery | `COUNT(DISTINCT unique_id)` per district | `institutional_birth_5y_pct` | More facilities ↔ higher institutional birth rate |
| Supply vs skilled attendance | Facility count | `births_attended_by_skilled_hp_5y_10_pct` | Facility density tracks skilled birth attendance |
| Anemia vs facility access | Facility count (or hospitals only) | `all_w15_49_who_are_anaemic_pct` | Weaker supply in high-anemia districts |
| Child anemia vs density | Facility count | `child_6_59m_who_are_anaemic_lt_11_0_g_dl_22_pct` | Pediatric supply gap signal |
| Specialty mix vs outcomes | `COUNT` where `specialties` contains `obstetrics` / `pediatrics` | ANC / vaccination columns | Specialty availability vs maternal-child indicators |
| Urban access | Facilities in metro districts | `hh_member_covered_health_insurance_pct` | Urban facility concentration vs insurance coverage |

### Sample: Top districts by linked facility count

| District | State | Facilities | Institutional birth % | Women anemia % |
|----------|-------|----------:|----------------------:|---------------:|
| Ahmadabad | Gujarat | 334 | 94.5 | 63.7 |
| Chennai | Tamil Nadu | 296 | 100.0 | 50.3 |
| Hyderabad | Telangana | 224 | 98.3 | 52.7 |
| Jaipur | Rajasthan | 188 | 97.3 | 54.1 |
| Kolkata | West Bengal | 186 | 97.5 | 58.2 |
| Lucknow | Uttar Pradesh | 148 | 91.3 | 55.8 |
| Patna | Bihar | 146 | 89.1 | 67.1 |
| Ernakulam | Kerala | 109 | 99.1 | 31.7 |

**Interpretation:** Facility-rich districts (Ahmedabad, Chennai, Hyderabad) tend to show high institutional birth rates, but anemia rates do not simply invert — Kerala districts show low anemia with moderate facility counts, suggesting socio-economic factors dominate. Use correlation as exploratory, not causal.

---

## Caveats

1. **India-only subset** — ~88 non-India facilities have no pincode/NFHS path.
2. **No direct facility ↔ NFHS key** — all analysis is district-aggregated or ecological; you cannot attribute NFHS rates to individual facilities.
3. **Fuzzy district names** — post-2010 district reorganizations (Bengaluru, Gurugram, Telangana splits) cause systematic mismatches; build and maintain an alias table.
4. **NFHS data quality** — `Maharastra` state typo, trailing spaces in `district_name`, some columns stored as strings with `*` for suppressed values.
5. **Pincode is not district-unique** — multiple post offices per pincode; always dedupe before NFHS join.
6. **Bad facility zips** — some facilities have incorrect postcodes (e.g. Hyderabad city with Delhi pincode `110002`); consider lat/long sanity checks.
7. **Ecological fallacy** — district-level correlation ≠ facility-level effect; control for urban/rural, state fixed effects.
8. **Temporal mismatch** — NFHS-5 (~2019–21) vs current facility directory; treat as cross-sectional snapshot.

---

## SQL files reference

| File | Purpose |
|------|---------|
| `linkage-01-baseline.sql` | India facility and zip counts |
| `linkage-02-facilities-pincode.sql` | Facilities → pincode match rate |
| `linkage-03-pincode-nfhs.sql` | Pincode → NFHS exact vs normalized |
| `linkage-04-full-chain.sql` | End-to-end chain (basic normalization) |
| `linkage-05-mismatches.sql` | Top unmatched pincode districts |
| `linkage-06-near-matches.sql` | Near-miss district name pairs |
| `linkage-07-unmatched-facilities.sql` | Sample facilities failing full chain |
| `linkage-08-nfhs-name-lookup.sql` | NFHS name lookup for major metros |
| `linkage-09-facilities-pincode-clean.sql` | Pincode join with cleaned zip |
| `linkage-10-correlation-sample.sql` | District facility count vs NFHS indicators |
| `linkage-11-failure-breakdown.sql` | Stage-by-stage chain failure counts |
| `linkage-12-metro-nfhs-names.sql` | NFHS district names for key states |
| `linkage-13-state-mapping.sql` | State alias mapping rules |
| `linkage-14-improved-chain.sql` | Full chain with state + district aliases |

Run any file:

```powershell
$databricks = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\databricks.exe"
& $databricks experimental aitools tools query --file .\linkage-01-baseline.sql --profile dbc-69c2f85e-61ee
```
