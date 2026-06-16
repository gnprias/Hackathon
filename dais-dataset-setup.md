# DAIS 2026 Hackathon — Virtue Foundation Dataset Setup

**Last updated:** 2026-06-15  
**Workspace:** `dbc-69c2f85e-61ee` (https://dbc-69c2f85e-61ee.cloud.databricks.com)  
**Profile:** `dbc-69c2f85e-61ee`  
**User:** `gnp26@cornell.edu`  
**Workspace ID:** `7474647788793451`

> Previous maidimi workspace (`dbc-bcb4241a-fb96`) is no longer used for this hackathon app.

---

## Summary

| Item | Status |
|------|--------|
| **Virtue Foundation Dataset (DAIS 2026) installed?** | **Yes** |
| **Catalog** | `databricks_virtue_foundation_dataset_dais_2026` |
| **Schema** | `virtue_foundation_dataset` |
| **Catalog Explorer** | [Open schema](https://dbc-bcb4241a-fb96.cloud.databricks.com/explore/data/databricks_virtue_foundation_dataset_dais_2026/virtue_foundation_dataset) |
| **Tables discovered (schema discovery run)** | 3 confirmed — see below; run `tables list` for authoritative full list |
| **Lakebase project `hackathon-app`** | **Pending** — run `complete-lakebase-setup.ps1` |
| **UC catalog `hackathon_lb`** | **Pending** — created by setup script |
| **Lakebase synced tables** | **Pending** — SNAPSHOT mode (read-only marketplace catalog) |
| **App scaffolded** | **No** — run `databricks apps init` after Lakebase |

---

## 1. Installed dataset

Marketplace catalog is present. User-confirmed names:

| Unity Catalog path | Value |
|--------------------|-------|
| Catalog | `databricks_virtue_foundation_dataset_dais_2026` |
| Schema | `virtue_foundation_dataset` |
| Full prefix | `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset` |

Verify:

```powershell
databricks catalogs list --profile dbc-bcb4241a-fb96
databricks tables list databricks_virtue_foundation_dataset_dais_2026 virtue_foundation_dataset --profile dbc-bcb4241a-fb96
```

---

## 2. Tables and primary key candidates

Schema discovery was completed for three tables before the prior session was interrupted. **Run `complete-lakebase-setup.ps1` to list all tables** and refresh discovery output in `setup-run-output.txt`.

| Table | Rows | PK candidate | Notes |
|-------|------|--------------|-------|
| `facilities` | 10,088 | `unique_id` | 0 nulls; UUID-style facility identifier |
| `india_post_pincode_directory` | 165,627 | `pincode`, `officename` | Composite — same pincode maps to multiple post offices |
| `nfhs_5_district_health_indicators` | 706 | `district_name`, `state_ut` | Composite — district names repeat across states |

### `facilities` — key columns

Healthcare facilities and clinics (India-focused sample). Notable columns: `unique_id`, `name`, `organization_type`, `specialties`, `procedure`, `equipment`, `address_*`, `latitude`/`longitude`, `cluster_id`.

### `india_post_pincode_directory` — key columns

India Post pincode reference: `pincode`, `officename`, `district`, `statename`, `latitude`, `longitude`.

### `nfhs_5_district_health_indicators` — key columns

NFHS-5 district-level health indicators: `district_name`, `state_ut`, plus ~100 survey percentage fields (maternal health, vaccination, anemia, etc.).

### Sync mode

Marketplace catalogs are **read-only** — `ALTER TABLE ... SET TBLPROPERTIES (delta.enableChangeDataFeed = true)` is not available. Use **SNAPSHOT** scheduling for all synced tables.

---

## 3. Lakebase setup (run once)

### Automated (recommended)

From `C:\Users\gnpri\Documents\hackathon-app`:

```powershell
powershell -ExecutionPolicy Bypass -File .\complete-lakebase-setup.ps1
```

This script:

1. Lists all tables in `virtue_foundation_dataset`
2. Runs `discover-schema` per table
3. Creates Lakebase project `hackathon-app` if missing
4. Registers UC catalog `hackathon_lb`
5. Creates **SNAPSHOT** synced tables into `hackathon_lb.public.<table>`
6. Writes full log to `setup-run-output.txt`

### Manual commands (reference)

**Create project:**

```powershell
databricks postgres create-project hackathon-app `
  --json '{"spec": {"display_name": "Hackathon App"}}' `
  --profile dbc-bcb4241a-fb96
```

**Register Lakebase catalog:**

```powershell
databricks postgres create-catalog hackathon_lb `
  --json '{
    "spec": {
      "postgres_database": "databricks_postgres",
      "branch": "projects/hackathon-app/branches/production"
    }
  }' `
  --profile dbc-bcb4241a-fb96
```

**Synced table example (`facilities`):**

```powershell
databricks postgres create-synced-table hackathon_lb.public.facilities `
  --json '{
    "spec": {
      "source_table_full_name": "databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities",
      "primary_key_columns": ["unique_id"],
      "scheduling_policy": "SNAPSHOT",
      "branch": "projects/hackathon-app/branches/production",
      "postgres_database": "databricks_postgres",
      "create_database_objects_if_missing": true,
      "new_pipeline_spec": {
        "storage_catalog": "workspace",
        "storage_schema": "default"
      }
    }
  }' `
  --profile dbc-bcb4241a-fb96
```

**Check sync status:**

```powershell
databricks postgres get-synced-table "synced_tables/hackathon_lb.public.facilities" --profile dbc-bcb4241a-fb96
```

Repeat for `india_post_pincode_directory` (PK: `pincode`, `officename`) and `nfhs_5_district_health_indicators` (PK: `district_name`, `state_ut`), plus any additional tables from `tables list`.

---

## 4. Next steps — `databricks apps init`

After Lakebase project exists and synced tables reach **ONLINE**:

```powershell
# Default SQL warehouse
databricks experimental aitools tools get-default-warehouse --profile dbc-bcb4241a-fb96

# Branch + database resource paths
databricks postgres list-branches projects/hackathon-app --profile dbc-bcb4241a-fb96
databricks postgres list-databases projects/hackathon-app/branches/production --profile dbc-bcb4241a-fb96

# Scaffold app (replace <WAREHOUSE_ID> and <DATABASE_RESOURCE_PATH>)
databricks apps init --name hackathon-app --features analytics,lakebase `
  --set "analytics.sql-warehouse.id=<WAREHOUSE_ID>" `
  --set "lakebase.postgres.branch=projects/hackathon-app/branches/production" `
  --set "lakebase.postgres.database=<DATABASE_RESOURCE_PATH>" `
  --description "DAIS 2026 Apps & Agents for Good hackathon app" `
  --run none `
  --profile dbc-bcb4241a-fb96
```

**Deploy before local dev** (Lakebase schema ownership):

```powershell
databricks apps deploy hackathon-app --profile dbc-bcb4241a-fb96
```

After deploy, grant the app service principal SELECT on synced tables in `public` (see databricks-lakebase skill).

---

## 5. Session log

| Step | Agent result |
|------|----------------|
| Catalog verified installed | User confirmed + prior CLI `catalogs list` |
| `tables list` | Interrupted — run `complete-lakebase-setup.ps1` |
| `discover-schema` | Completed for 3 tables (see Section 2) |
| Lakebase `hackathon-app` | Not created in agent session (shell sandbox blocked on Windows) |
| `hackathon_lb` catalog | Not created in agent session |
| Synced tables | Not created in agent session — script ready |

**Agent limitation:** Cursor agent shell on Windows could not execute Databricks CLI in this workspace (sandbox policy). Run `complete-lakebase-setup.ps1` locally in the IDE terminal to finish Lakebase + sync.

---

## Reference

- Marketplace listing: `19326b3d-db63-4627-abc0-cf4e8131a305`
- Setup script: `complete-lakebase-setup.ps1`
- CLI log output: `setup-run-output.txt` (after script run)
- Prior captures: `dais-dataset-status.txt`, `setup-status.txt`
- CLI: Databricks CLI v1.3.0, profile valid
- Hackathon stack: Lakebase + Agent Bricks + Databricks Apps (Apps & Agents for Good, DAIS 2026)
