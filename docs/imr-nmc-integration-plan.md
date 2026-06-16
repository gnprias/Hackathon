# NMC Indian Medical Register (IMR) — Integration Plan

**Project:** DAIS 2026 Hackathon — Virtue Foundation facility verification app  
**Date:** 2026-06-15  
**Sources researched:** [NMC IMR portal](https://www.nmc.org.in/information-desk/indian-medical-register/), [blacklist page](https://www.nmc.org.in/information-desk/indian-medical-register/black-list-doctors/), [NMR portal](https://nmr-nmc.abdm.gov.in/nmr/v3/), community documentation of `MCIRest` endpoints (Stack Overflow, Apify actor docs)

---

## 1. Executive summary

NMC publishes doctor registration data through a **public web UI** backed by an **undocumented but widely used REST layer** (`/MCIRest/open/getDataFromService`). There is **no official developer API**, OpenAPI spec, or bulk-download license from NMC.

For hackathon scope, treat IMR as the **source of truth for registration status and blacklist**, and OpenAI as the **parser/synthesizer** for unstructured facility claims (`specialties`, `procedure`, `capability`). Do **not** build a full 1.4M-doctor scraper; instead use **on-demand lookup** (Phase 3 UI) and a **targeted batch pipeline** (Phase 4b) that only queries IMR for doctors names/numbers extracted from facility records or user input.

---

## 2. NMC IMR data access

### 2.1 Public UI (primary official interface)

| Search mode | Inputs | Result columns |
|-------------|--------|----------------|
| Name | Doctor name (browse A–Z or search) | Sl. No., Year of Info, Registration Number, State Medical Council, Name, Father Name, Action (detail) |
| Year of Registration | Calendar year | Same listing |
| Registration Number | Reg. no. (+ implicit SMC context in UI) | Same listing |
| State Medical Council | Council dropdown (30+ SMCs) | Paginated listing |
| Advance Search | Name, reg. no., year, council (combinable) | Filtered listing |
| Black List Doctor | Same dimensions; separate tab + dedicated page | Blacklisted practitioners |

**Detail view (“View IMR Details”)** exposes qualification, university, registration date, permanent address, additional qualifications, etc.

**Data freshness caveat (shown on portal):** Registered doctors across State Medical Councils are published **up to year 2021**, with exceptions noted for Karnataka, Arunachal Pradesh, and Delhi (2021 data). Portal states data is being updated.

### 2.2 Undocumented REST layer (powers the UI)

The IMR DataTables UI calls:

```
POST https://www.nmc.org.in/MCIRest/open/getDataFromService?service=<serviceName>
Content-Type: application/json
```

**Known service (detail lookup):**

| Parameter | Example |
|-----------|---------|
| `service` | `getDoctorDetailsByIdImr` |
| Body | `{"doctorId": "17068", "regdNoValue": "3608"}` |

Listing/search services use the same base URL with different `service` values and DataTables-shaped request/response envelopes (pagination ~500 rows). Community tooling (e.g. Apify `india-nmc-doctor-registry-scraper`) documents filters: `name`, `year`, `smc_id`, `registration_no`.

**Important lookup rules:**

- **Registration numbers are not globally unique** — they are issued per State Medical Council. Always pair **SMC + registration number** (or use `doctorId` from a prior search hit).
- **Name search** is substring, case-insensitive, and can return thousands of homonyms — disambiguate with state, year, or address.
- API is **slow** (~150 ms+ per detail call); no published rate limits, but aggressive bulk enumeration risks blocking.
- **TLS chain** on `nmc.org.in` is occasionally incomplete; clients may need custom SSL handling.

### 2.3 National Medical Register (NMR) — separate system

NMC is migrating to the **National Medical Register** at [nmr-nmc.abdm.gov.in](https://nmr-nmc.abdm.gov.in/nmr/v3/) (mandated under NMC Act 2019). Existing IMR registrants must re-register on NMR. The **public hackathon integration should target IMR** (what NMC still exposes for open search today); note NMR as a future migration path with no confirmed public query API for hackathon use.

### 2.4 Blacklist access

| Item | Detail |
|------|--------|
| UI entry | IMR page tab **“Black List Doctor”** (`#blackListDoc`) |
| Dedicated URL | `/information-desk/indian-medical-register/black-list-doctors/` (“List of Presently Blacklisted Doctors”) |
| Search | Registration number, year, state council, advanced filters — same table pattern as main IMR |
| API | Presumed same `MCIRest` pattern with a blacklist-specific `service` name (not officially documented); treat as **discover during Phase 4b spike**, with UI fallback link to NMC |

**Integration approach:** Periodic **snapshot** of blacklist listings into `workspace.gold.imr_blacklist` (daily or weekly job), keyed by `(smc_id, registration_number, doctor_name)`. On each doctor IMR hit, join against snapshot → `blacklist_flag`.

### 2.5 Terms of use / scraping constraints

- NMC site footer links: [Disclaimer](https://www.nmc.org.in/disclaimer/), [Terms of Use](https://www.nmc.org.in/terms-of-use/) (direct fetch timed out during research; standard government-site restrictions apply).
- **No explicit permission** for bulk reproduction or commercial scraping found on IMR pages.
- **Hackathon-safe posture:**
  - Use **minimal, purpose-driven queries** (known reg. nos., names tied to a facility under review).
  - **Attribute NMC** as source; link `profile_url` / IMR detail page.
  - **Cache results** with `checked_at` timestamp; do not redistribute full registry dumps.
  - **Respectful rate limiting** (≥150 ms between calls, bounded concurrency).
  - Display disclaimer: *“Registration data from NMC IMR; may be incomplete or stale; not a substitute for primary source verification.”*

---

## 3. Virtue Foundation `facilities` fields (doctor-relevant)

From `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities` (10,088 rows; ~10,000 India).

| Column | Type | Verification relevance |
|--------|------|----------------------|
| `name` | string | Often encodes lead physician for clinics (“Dr … Clinic”) |
| `numberDoctors` | string | Claimed headcount (e.g. `"60"`); frequently `null` |
| `specialties` | JSON `array<string>` | camelCase codes (`pediatrics`, `cardiology`, `gynecologyAndObstetrics`) |
| `procedure` | JSON `array<string>` | NL procedure claims (“Offers IVF”, “CT scan available”) |
| `capability` | JSON `array<string>` | Rich claims: named doctors, bed count, departments, accreditations (NABH, ISO), “60 doctors”, “30 departments” |
| `description` | string | Short NL summary |
| `equipment` | JSON `array<string>` | Equipment claims (supporting procedure verification indirectly) |
| `affiliated_staff_presence` | string/bool | Signal that staff info exists on source pages |
| `address_stateOrRegion` | string | Maps to SMC for IMR disambiguation |
| `address_city`, `address_zipOrPostcode` | string | Disambiguate name collisions; pincode bridge already used in Phase 1 |
| `officialWebsite`, `websites` | string/JSON | Phase 2 link validation; future source for doctor name extraction |
| `facilityTypeId` | string | `clinic` vs `hospital` — scopes verification strictness |

**Critical gap:** Facilities have **no doctor registration numbers** and **no structured doctor roster**. IMR verification requires **extracting** physician identities from `name`, `capability`, and optionally website text.

**Example (Sanjivani Multi Speciality Hospital):** `numberDoctors: 60`, 40+ specialty codes, procedures include IVF/IUI/CT/mammography, capability mentions “Dr. Darshana Pillai”, “Dr. Girish Sitharam”, NABH, 30 departments.

---

## 4. What IMR can and cannot verify

| Claim type (from Virtue data) | IMR can verify? | Notes |
|------------------------------|-----------------|-------|
| Doctor is registered | **Yes** | Name + SMC search, or reg. no. + SMC |
| Doctor is blacklisted | **Yes** | Blacklist snapshot join |
| Qualification (MBBS, MD, MS, etc.) | **Partial** | IMR lists degrees, not board-certified subspecialty labels |
| Facility specialty list | **No (direct)** | Map specialty codes → required degrees only heuristically |
| Procedures (IVF, CT, surgery) | **No (direct)** | Not in IMR; need equipment/regulatory sources later |
| `numberDoctors` count | **Partial** | Only if roster extracted and each doctor looked up |
| Named doctor works at facility | **No** | IMR address is doctor’s registered address, not employer |
| Hospital accreditations (NABH) | **No** | Out of IMR scope |

**Design principle:** IMR validates **people**; OpenAI parses **claims**; the app **joins** them and surfaces confidence + gaps.

---

## 5. Architecture

### 5.1 Data flow (target state)

```
Virtue facilities (claims)
        │
        ▼
┌───────────────────┐     ┌─────────────────────┐
│ OpenAI extraction │────►│ facility_claims     │  (structured JSON per facility)
│ (Phase 4b)        │     │ workspace.gold.*    │
└───────────────────┘     └──────────┬──────────┘
                                       │
                    doctor names / reg nos to check
                                       ▼
┌───────────────────┐     ┌─────────────────────┐
│ NMC MCIRest     │────►│ imr_doctor_cache    │  (SMC, reg_no, qualifications, …)
│ (on-demand/batch)│     │ imr_blacklist       │
└───────────────────┘     └──────────┬──────────┘
                                       │
                                       ▼
                        ┌─────────────────────┐
                        │ facility_credential │
                        │ _validation         │  (per facility + per doctor)
                        └──────────┬──────────┘
                                       ▼
                              Databricks App UI
```

### 5.2 Phase 3 — UI hooks (implement now as placeholders)

App is not yet scaffolded (`dais-dataset-setup.md`). When building the facility detail view, add a **Credential Verification** card:

| UI element | Behavior (Phase 3) |
|------------|-------------------|
| **Status badge** | `Unverified` (default) / `Pending` / `Verified` / `Flagged` — driven by `facility_credential_validation` when populated; static placeholder until Phase 4b |
| **Manual IMR lookup** | Form: State Medical Council (dropdown) + Registration Number → calls backend proxy `POST /api/imr/lookup` → shows name, qualification, year, NMC profile link |
| **“Verify credentials” CTA** | Triggers async job for this facility (Phase 4b); Phase 3 shows toast “Queued” or disabled with tooltip |
| **Claims summary** | Read-only chips from `specialties` + top `procedure` items with label *“Facility-reported — not verified”* |
| **Blacklist alert** | Red `Alert` if manual lookup or batch result hits `imr_blacklist` |
| **Source footer** | Link to NMC IMR + `checked_at` + stale-data disclaimer |

**Backend stub (minimal):** One custom endpoint wrapping a single `getDoctorDetailsByIdImr` or reg-no search — enough to demo live lookup without batch infra.

**SQL query hook:** Extend facility detail query to LEFT JOIN `workspace.gold.facility_credential_validation` (create empty table in Phase 3 for schema stability).

### 5.3 Phase 4b — Batch IMR lookup pipeline

Mirror Phase 2 pattern (`scripts/python/validate_facility_links.py`): checkpoint JSONL, Databricks upload, resume.

**Job steps:**

1. **Select cohort** — India facilities (`address_countryCode = 'IN'`), prioritize rows with `affiliated_staff_presence`, non-null `capability`, or `numberDoctors`.
2. **Claim extraction (OpenAI)** — Input: `name`, `description`, `specialties`, `procedure`, `capability` (truncate to token budget). Output JSON:
   ```json
   {
     "claimed_doctor_count": 60,
     "named_doctors": [{"name": "Dr. Susan Kuruvila", "role_hint": "dermatology"}],
     "specialty_labels": ["dermatology", "cardiology"],
     "procedure_labels": ["IVF", "CT scan"],
     "confidence": 0.85
   }
   ```
   Model: `gpt-4o-mini` for bulk; `gpt-4o` for low-confidence re-runs.
3. **IMR search (deterministic, not LLM)** — For each named doctor:
   - Map `address_stateOrRegion` → `smc_id` (lookup table).
   - Query IMR by name + `smc_id` filter.
   - Score candidates: name similarity + city/state token overlap in `permanent_address`.
   - Store top match with `match_score` in `imr_doctor_cache`.
4. **Optional reg-no path** — If website scrape (future) or user input yields reg. no., direct lookup (highest confidence).
5. **Blacklist check** — Join matches to `imr_blacklist`.
6. **Verification synthesis (OpenAI)** — Input: facility claims JSON + IMR match JSON. Output: human-readable report with sections *Verified*, *Unverifiable via IMR*, *Mismatch*, *Blacklist*. **LLM must not invent registration facts** — only narrate structured IMR fields.
7. **Write** `workspace.gold.facility_credential_validation`:
   - `unique_id`, `verification_status`, `doctors_matched`, `doctors_claimed`, `blacklist_hits`, `imr_evidence_json`, `claims_json`, `report_markdown`, `checked_at`

**Throughput guardrails (hackathon):**

| Control | Value |
|---------|-------|
| Pilot batch | 100–250 facilities |
| NMC concurrency | 2–3 workers |
| NMC delay | 150–300 ms/request |
| OpenAI budget | ~$200 total — allocate ~$30–50 IMR pilot extraction+synthesis |
| Full 10K facilities | Not recommended for IMR calls; claims-only extraction OK |

**Databricks artifacts:**

- `scripts/python/imr_lookup.py` — thin MCIRest client + SMC map
- `scripts/python/extract_facility_claims.py` — OpenAI extraction
- `scripts/sql/03-facility-credential-validation-table.sql`
- `scripts/sql/03-imr-blacklist-snapshot.sql`
- Lakeflow job YAML (optional) triggering weekly blacklist refresh

### 5.4 Matching facility claims vs IMR registrations

| Step | Owner | Logic |
|------|-------|-------|
| Parse claims | OpenAI | NL → structured |
| Normalize specialties | SQL + lookup | camelCase → display labels (reuse `specialty_canonical_lookup`) |
| Map specialty → degree expectation | Rules + optional LLM | e.g. `cardiology` → MD/DM Cardiology (heuristic) |
| IMR qualification check | Deterministic | Substring match on `qualification` + `additional_qualifications` |
| Count check | Deterministic | `numberDoctors` vs `len(doctors_matched)` → `count_verification: insufficient_evidence` unless roster complete |
| Blacklist | SQL join | Any matched doctor on blacklist → facility `Flagged` |
| Overall status | Rules | `Verified` if ≥1 named doctor matched and no blacklist; `Partial` if claims exist but no IMR match; `Flagged` on blacklist |

**Do not claim “facility offers cardiology” is verified** only because one MBBS doctor matched — require qualification alignment or downgrade to `Partial`.

### 5.5 OpenAI role (strict separation)

| Task | Use OpenAI? | Source of truth |
|------|-------------|-----------------|
| Extract doctor names & claims from text | **Yes** | — |
| Decide if doctor is registered | **No** | NMC IMR API |
| Blacklist status | **No** | NMC blacklist data |
| Match homonym doctors | **Assist** (tie-break narrative only) | IMR address + SMC + score |
| Write user-facing verification report | **Yes** | Must cite IMR JSON fields verbatim in evidence block |
| Infer procedures/specialties are offered | **No** | Out of scope unless added sources |

---

## 6. Gold tables (proposed schema sketch)

### `workspace.gold.imr_doctor_cache`

| Column | Notes |
|--------|-------|
| `doctor_id`, `registration_number`, `smc_id`, `state_medical_council` | From IMR |
| `doctor_name`, `qualification`, `additional_qualifications`, `year_of_registration`, `permanent_address` | |
| `profile_url`, `raw_json`, `fetched_at` | Audit |

### `workspace.gold.imr_blacklist`

| Column | Notes |
|--------|-------|
| `registration_number`, `smc_id`, `doctor_name`, `year_of_info` | Snapshot |
| `snapshot_at` | |

### `workspace.gold.facility_credential_validation`

| Column | Notes |
|--------|-------|
| `unique_id` | FK to facilities |
| `verification_status` | `unverified` \| `partial` \| `verified` \| `flagged` |
| `claims_json`, `imr_evidence_json` | |
| `doctors_claimed`, `doctors_matched`, `blacklist_hits` | ints |
| `report_markdown` | UI-ready summary |
| `checked_at` | |

---

## 7. Risks and limitations

| Risk | Impact | Mitigation |
|------|--------|------------|
| IMR data stale (≤2021 for many states) | False “not found” | Show freshness disclaimer; prefer NMR when API available |
| No reg. nos. in Virtue data | Weak automation | Manual lookup UI; extract names from `capability` |
| Registration numbers not unique nationally | Wrong doctor match | Always require SMC; show disambiguation list in UI |
| IMR lacks specialty/procedure fields | Cannot fully verify facility claims | Label as “person registered, service claim unverified” |
| Undocumented API changes | Pipeline breakage | Thin client, integration tests on 3 known doctors, fallback to NMC link |
| Legal / ToU ambiguity | Compliance | On-demand + cached snapshots only; no public republication of full registry |
| NMR migration | IMR deprecation over time | Abstract `ImrClient` interface; monitor NMC announcements |
| OpenAI hallucination | False verification | Deterministic status rules; LLM for narrative only |
| `$200` budget | Cannot process 10K × many doctors | Pilot cohort; mini model for extraction |
| Name-only matches | Homonyms | SMC + address scoring; never auto-`Verified` below threshold |

---

## 8. Recommended hackathon MVP

1. **Phase 3:** Facility detail card with manual **SMC + Reg No** lookup, placeholder status badge, NMC link, stale-data disclaimer.
2. **Phase 4b spike:** Python script for **50 facilities** with rich `capability` → OpenAI extract → IMR name search → write validation table; weekly **blacklist snapshot** job.
3. **Demo narrative:** Show one facility where named doctor matches IMR, one homonym `Partial`, one blacklist `Flagged` (seeded lookup).
4. **Defer:** Full registry enumeration, website doctor scraping, NMR integration, procedure/equipment regulatory verification.

---

## 9. References

- NMC IMR search: https://www.nmc.org.in/information-desk/indian-medical-register/
- NMC blacklist: https://www.nmc.org.in/information-desk/indian-medical-register/black-list-doctors/
- NMR portal: https://nmr-nmc.abdm.gov.in/nmr/v3/
- MCIRest detail endpoint (community): `POST …/getDataFromService?service=getDoctorDetailsByIdImr`
- Existing project phases: `scripts/sql/README.md` (Phase 1 specialties, Phase 2 link validation)
- Virtue schema sample: `setup-run-output.txt`
