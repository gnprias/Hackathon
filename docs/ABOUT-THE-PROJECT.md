# About the Project — Facility Trust Explorer (`dais-app`)

**Hackathon:** DAIS 2026 — Apps & Agents for Good  
**Dataset:** [Virtue Foundation Healthcare Facility Dataset](https://github.com/gnprias/Hackathon) (~10,000 facilities in India)  
**Repository:** [github.com/gnprias/Hackathon](https://github.com/gnprias/Hackathon)  
**Deployed app:** Databricks App on workspace `dbc-69c2f85e-61ee`

---

## What inspired the project

When I opened the Virtue Foundation dataset for DAIS 2026, I was struck by a tension that anyone doing global health outreach recognizes immediately: the directory is rich—names, specialties, procedures, websites, social profiles—but **richness is not the same as trust**. A donor or NGO partner deciding where to invest time and money needs more than a spreadsheet row. They need to know whether the facility is reachable, whether its online presence matches its stated identity, whether its self-reported capabilities hang together, and—where possible—whether the clinicians behind those claims are credentialed with a primary source.

The Virtue Foundation data is explicitly positioned for partners evaluating healthcare facilities in India. That use case became the north star: **build a verification layer that turns facility claims into evidence-backed outreach decisions**, without pretending the dataset is ground truth. I wanted something a program officer could actually open during a hackathon demo—a guided search flow, a facility detail page with transparent scoring, and hooks into real external registries—not another static dashboard.

The DAIS “Apps & Agents for Good” framing pushed me toward Databricks-native architecture: keep analytics on the warehouse where the marketplace dataset lives, use Lakebase for operational state partners generate during review, and reserve AI for tasks where language understanding helps (search intent, claim parsing, narrative summaries) while keeping verification facts deterministic wherever possible.

---

## How I built the project

### Data foundation and enrichment

The app reads from the Unity Catalog marketplace catalog `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset`, centered on **10,088 facility records** (roughly 10,000 India-focused). I also analyzed linkage paths to companion tables—the India Post pincode directory and NFHS-5 district health indicators—documented in `dataset-linkage-analysis.md`. There is no direct facility-to-NFHS key; the workable bridge runs facilities → pincode → district/state → NFHS, reaching about **63–73% of India facilities** depending on normalization and alias rules. That analysis informed how I think about regional context, even though the app’s primary UX is facility-grain verification.

Because the marketplace catalog is read-only, I configured **Lakebase synced tables** (SNAPSHOT scheduling) into a `hackathon_lb` catalog so the app can co-locate transactional data alongside mirrored facility data. On Lakebase itself, the app maintains partner-generated state in Postgres: **`app.deactivated_facilities`** (hide bad leads with a reason) and **`app.facility_imr_doctors`** (doctors looked up via NMC and saved to a facility).

### Batch pipelines → gold tables

Before the UI can score anything, I built resumable Python batch jobs—each with JSONL checkpoints and SQL batch uploads—that populate **`workspace.gold.*`** enrichment tables via the Databricks CLI:

| Pipeline | Gold table | What it does |
|----------|------------|--------------|
| Link validation | `facility_link_validation` | HTTP checks on official websites and Facebook links |
| Geocoding | `facility_address_validation` | Google Maps (preferred) or OpenStreetMap Nominatim; normalizes city/state/zip and flags mismatches |
| Specialty parsing | `facility_specialties` | Canonicalizes specialty strings for consistent search |
| Claim validation | `facility_claim_validation` | Rule-based consistency between specialties and procedure/equipment/capability text; optional OpenAI semantic scoring |

These tables join directly into typed SQL queries under `dais-app/config/queries/`, executed through AppKit’s **Analytics plugin** against a SQL Warehouse.

### The Databricks App (`dais-app`)

I scaffolded the app with **`databricks apps init`** using AppKit plugins for **Analytics**, **Lakebase**, and **Server**, then deployed it with a **Declarative Automation Bundle** (`databricks.yml`) to workspace `dbc-69c2f85e-61ee`. The stack is React + TypeScript + Tailwind on the client, Express on the server, and shared TypeScript modules for scoring logic so the UI and API stay aligned.

The core experience is a **four-step facility browser**: choose a region (state/city/zip), pick a specialty (including AI-assisted search), review a filterable facility list, and open a detail view. Search supports contact and link-quality filters (working website, Facebook, phone, email, social presence) and ranks matches into tiers—full specialty match, specialty only, or claims-only procedure/equipment match.

### Verification and trust scoring

The detail page assembles several evidence cards:

- **Trust & outreach score (0–100)** — a deterministic composite of link validation, contact completeness, social engagement, profile richness, operational signals, and penalties for broken links or questionable locations. Optional **OpenAI narrative** explains the score in plain language when an API key is configured; otherwise the rules-based recommendation stands alone.
- **Live verification** — on demand, the server fetches the facility website and runs forward/reverse geocoding to assess whether the site and map location plausibly match the listing.
- **Address verification** — surfaces batch geocode status and mismatch flags from the gold table.
- **Claim verification** — shows rule/AI claim consistency results from the batch pipeline.
- **High-acuity specialty verification** — for ICU, maternity, emergency, oncology, trauma, and NICU claims, checks corroboration across specialty text, facility-reported procedures/equipment, and saved IMR doctor qualifications.
- **NMC IMR lookup** — proxies the public Indian Medical Register REST layer for registration-number lookup and name search; verified doctors can be saved to Lakebase and feed credentialing bonuses in the trust score.
- **Deactivation** — partners can mark a facility inactive with a reason, forcing trust score to zero until reactivated.

AI appears where it helps search, not where it invents facts: **`/api/search/match-specialty`** maps natural language to canonical specialties (OpenAI with a rules fallback) and extracts claim terms like “MRI” or “dialysis” to filter procedure text. **`/api/search/geocode-reference`** geocodes a reference address for nearest-alternate facility suggestions.

---

## What I learned

**Verification UX is an exercise in epistemic humility.** The dataset mixes excellent rows with wrong pincodes, stale social links, and internally inconsistent specialty claims. The most useful thing an app can do is show *why* a facility received a score—broken website, geocode partial match, unverified high-acuity claim—rather than collapsing everything into a single boolean.

**Joining Indian administrative data is its own project.** Pincode joins work well (~97% of India facilities), but district names diverge across sources (`BENGALURU URBAN` vs `Bangalore`, `DELHI` vs `NCT of Delhi`, and an NFHS typo `Maharastra`). Building alias maps taught me that “data linkage” hackathon work is often 80% string normalization and 20% SQL.

**Lakebase and the warehouse serve different masters.** Analytics queries belong on the SQL Warehouse against Delta gold tables and the marketplace catalog; partner workflow state (deactivations, saved IMR doctors) belongs in Lakebase Postgres with low-latency CRUD. Trying to store review state only in Delta would have fought the grain of how outreach teams actually work.

**IMR validates people, not hospitals.** The National Medical Commission register confirms doctor registration and blacklist status, but facilities rarely ship structured rosters. I learned to separate “facility-reported claims” from “primary-source credential evidence” and to resist the temptation to let an LLM infer registration facts. OpenAI parses language; NMC answers registration.

**Geocoding India addresses is surprisingly adversarial.** Google’s `locality` field often returns zone suffixes (`Mumbai Zone 2`) or sector labels in union territories. I ended up with dedicated city-resolution logic, unit tests for cases like Mumbai and Chandigarh, and an `--invalid-cities-only` repair mode in the geocoding batch job.

---

## Challenges I faced

1. **Read-only marketplace constraints.** I could not enable Change Data Feed on marketplace tables, so Lakebase sync had to use SNAPSHOT mode and accept refresh latency. Local development also required deploying the app before Lakebase schema ownership behaved predictably.

2. **Scale vs. hackathon time.** Full link validation, geocoding, and claim scoring across ~10K facilities is feasible in batch form but not instant. Checkpointed scripts and `--upload-only` resume paths were essential when runs interrupted mid-stream.

3. **External API fragility.** NMC’s IMR portal exposes an undocumented `MCIRest` layer— workable for demos and on-demand lookup, but without official rate limits or bulk licensing. I scoped IMR to manual lookup plus saved doctors per facility rather than attempting a full roster scrape.

4. **Trust score calibration.** Every new signal—website relevance, location cross-check, IMR specialty match, high-acuity corroboration—changed the score distribution. Shared TypeScript modules and tests (`trust-score.test.ts`, `high-acuity-specialty-verification.test.ts`) kept the formula explainable as it grew.

5. **Tooling friction on Windows.** Databricks CLI automation from agent sandboxes was unreliable during early setup; I documented manual and scripted paths in `dais-dataset-setup.md` and ran enrichment locally. Removing install-time typegen was necessary for deploy success on the Apps platform.

6. **Drawing the line on AI.** Claim validation optionally uses OpenAI, but registration status, blacklist checks, and trust penalties remain rule-driven. The hardest product decision was labeling what is *verified* versus *facility-reported* versus *unverifiable with current sources*—and reflecting that honestly in the UI.

---

## Where to explore next

- **App:** `/facilities` — search and verification workflow  
- **Docs:** `dais-dataset-setup.md`, `dataset-linkage-analysis.md`, `docs/imr-nmc-integration-plan.md`  
- **Batch jobs:** `scripts/python/validate_facility_links.py`, `geocode_facilities.py`, `validate_facility_claims.py`  
- **Deploy:** `databricks bundle deploy` from `dais-app/`

The goal was never to declare facilities “approved” or “rejected” from a hackathon build. It was to give Virtue Foundation partners a **transparent, Databricks-native trust layer**—warehouse analytics for enrichment, Lakebase for review state, and targeted AI for search—so outreach decisions start with evidence instead of hope.
