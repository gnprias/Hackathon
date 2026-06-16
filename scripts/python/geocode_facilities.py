#!/usr/bin/env python3
"""
Geocode facility addresses (Google Maps if GOOGLE_MAPS_API_KEY is set, else Nominatim),
normalize city/state/zip, and load results into workspace.gold.facility_address_validation.

Usage:
  pip install -r scripts/python/requirements.txt
  set GOOGLE_MAPS_API_KEY=...   # recommended for India
  python scripts/python/geocode_facilities.py --profile dbc-69c2f85e-61ee --limit 100
  python scripts/python/geocode_facilities.py --profile dbc-69c2f85e-61ee
  python scripts/python/geocode_facilities.py --profile dbc-69c2f85e-61ee --upload-only
  python scripts/python/geocode_facilities.py --profile dbc-69c2f85e-61ee --invalid-cities-only --dry-run
  python scripts/python/geocode_facilities.py --profile dbc-69c2f85e-61ee --invalid-cities-only

Checkpoint: scripts/output/facility_address_validation_checkpoint.jsonl
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "scripts" / "output"
CSV_PATH = OUTPUT_DIR / "facility_address_validation.csv"
CHECKPOINT_PATH = OUTPUT_DIR / "facility_address_validation_checkpoint.jsonl"
SQL_BATCH_DIR = OUTPUT_DIR / "address_validation_batches"
CHECKPOINT_LOCK = threading.Lock()

ENV_FILE = ROOT / "dais-app" / ".env"


def load_local_env() -> None:
    """Load GOOGLE_MAPS_API_KEY from dais-app/.env when not already in the environment."""
    if os.environ.get("GOOGLE_MAPS_API_KEY", "").strip():
        return
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line.startswith("GOOGLE_MAPS_API_KEY="):
            value = line.split("=", 1)[1].strip()
            if value:
                os.environ["GOOGLE_MAPS_API_KEY"] = value
            return


def resolve_databricks_cli() -> str:
    cli = os.environ.get("DATABRICKS_CLI_PATH", "").strip()
    if cli and Path(cli).exists():
        return cli
    winget = (
        Path(os.environ.get("LOCALAPPDATA", ""))
        / "Microsoft/WinGet/Packages/Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe/databricks.exe"
    )
    if winget.exists():
        return str(winget)
    return "databricks"


def run_subprocess(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
USER_AGENT = os.environ.get(
    "NOMINATIM_USER_AGENT",
    "DAIS-Virtue-Foundation-AddressValidation/1.0 (hackathon outreach review)",
)

INDIA_STATE_ALIASES: dict[str, str] = {
    "andaman and nicobar": "Andaman and Nicobar Islands",
    "andaman & nicobar islands": "Andaman and Nicobar Islands",
    "chattisgarh": "Chhattisgarh",
    "chhatisgarh": "Chhattisgarh",
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
    "delhi ncr": "Delhi",
    "nct of delhi": "Delhi",
    "new delhi": "Delhi",
    "orissa": "Odisha",
    "pondicherry": "Puducherry",
    "maharastra": "Maharashtra",
    "maharashtra": "Maharashtra",
    "uttaranchal": "Uttarakhand",
    "jammu & kashmir": "Jammu and Kashmir",
    "jammu and kashmir": "Jammu and Kashmir",
}

FACILITIES_SELECT = """
SELECT
  unique_id,
  name,
  address_line1,
  address_line2,
  address_line3,
  address_city,
  address_stateOrRegion AS address_state_or_region,
  address_zipOrPostcode AS address_zip_or_postcode,
  address_country,
  address_countryCode AS address_country_code,
  latitude,
  longitude
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
"""

FACILITIES_SQL = f"""
{FACILITIES_SELECT}
WHERE unique_id RLIKE '^[0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}}$'
ORDER BY unique_id
"""

INVALID_CITIES_SQL = """
SELECT unique_id, verified_city
FROM workspace.gold.facility_address_validation
WHERE verified_city IS NOT NULL
  AND LENGTH(TRIM(verified_city)) <= 1
ORDER BY unique_id
"""

CHECKPOINT_FIELDS = [
    "unique_id",
    "geocode_query",
    "geocode_provider",
    "geocode_status",
    "geocode_formatted_address",
    "geocode_lat",
    "geocode_lon",
    "raw_city",
    "raw_state_or_region",
    "raw_zip_or_postcode",
    "raw_country_code",
    "verified_city",
    "verified_state_or_region",
    "verified_zip_or_postcode",
    "verified_country_code",
    "mismatch_flags",
    "checked_at",
]


def parse_unique_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def facilities_sql_for_ids(unique_ids: list[str]) -> str:
    ids_sql = ", ".join(sql_literal(uid) for uid in unique_ids)
    return f"""
{FACILITIES_SELECT}
WHERE unique_id IN ({ids_sql})
ORDER BY unique_id
"""


def resolve_target_unique_ids(
    profile: str,
    *,
    invalid_cities_only: bool,
    unique_ids: list[str],
) -> list[str]:
    ids = set(unique_ids)
    if invalid_cities_only:
        for row in run_databricks_query(profile, INVALID_CITIES_SQL):
            if row.get("unique_id"):
                ids.add(row["unique_id"])
    return sorted(ids)


def run_databricks_query(profile: str, sql: str) -> list[dict[str, Any]]:
    cmd = [
        resolve_databricks_cli(),
        "experimental",
        "aitools",
        "tools",
        "query",
        "--profile",
        profile,
        "--output",
        "json",
        sql,
    ]
    proc = run_subprocess(cmd)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "Databricks query failed")
    payload = proc.stdout.strip()
    if not payload or payload.startswith("Query executed successfully"):
        return []
    return json.loads(payload)


def run_databricks_file(profile: str, path: Path, *, attempts: int = 4) -> None:
    cmd = [
        resolve_databricks_cli(),
        "experimental",
        "aitools",
        "tools",
        "query",
        "--profile",
        profile,
        "--file",
        str(path),
    ]
    last_error = ""
    for attempt in range(1, attempts + 1):
        proc = run_subprocess(cmd)
        if proc.returncode == 0:
            return
        last_error = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
        if attempt < attempts:
            time.sleep(min(30, 2**attempt))
    raise RuntimeError(f"{path.name} failed after {attempts} attempts: {last_error}")


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not (value == value):  # NaN
            return "NULL"
        return str(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def normalize_key(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value.strip().lower())
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_state(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    if not cleaned:
        return None
    alias = INDIA_STATE_ALIASES.get(normalize_key(cleaned))
    if alias:
        return alias
    return cleaned.title() if cleaned.isupper() else cleaned


def normalize_city(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    if not cleaned or len(cleaned) <= 1:
        return None
    return cleaned.title() if cleaned.isupper() else cleaned


def normalize_zip(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"[^0-9]", "", value.strip())
    return digits or None


MISSING_VALUES = {"", "null", "none", "n/a", "na", "undefined"}


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in MISSING_VALUES:
        return None
    return text or None


def build_geocode_query(row: dict[str, Any]) -> str:
    parts = [
        clean_text(row.get("address_line1")),
        clean_text(row.get("address_line2")),
        clean_text(row.get("address_line3")),
        clean_text(row.get("address_city")),
        normalize_state(clean_text(row.get("address_state_or_region"))),
        normalize_zip(clean_text(row.get("address_zip_or_postcode"))),
        clean_text(row.get("address_country")),
    ]
    if not any(parts):
        parts = [clean_text(row.get("name"))]
    return ", ".join(part for part in parts if part)


def parse_google_components(components: list[dict[str, Any]]) -> dict[str, str | None]:
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country_code: str | None = None

    for component in components:
        types = component.get("types") or []
        long_name = component.get("long_name")
        short_name = component.get("short_name")
        if "locality" in types and long_name:
            city = long_name
        elif "postal_town" in types and long_name and not city:
            city = long_name
        elif "administrative_area_level_2" in types and long_name and not city:
            city = long_name
        if "administrative_area_level_1" in types and long_name:
            state = long_name
        if "postal_code" in types and long_name:
            zip_code = long_name
        if "country" in types and short_name:
            country_code = short_name

    return {
        "verified_city": normalize_city(city),
        "verified_state_or_region": normalize_state(state),
        "verified_zip_or_postcode": normalize_zip(zip_code),
        "verified_country_code": country_code,
    }


def parse_nominatim_address(address: dict[str, Any] | None) -> dict[str, str | None]:
    if not address:
        return {
            "verified_city": None,
            "verified_state_or_region": None,
            "verified_zip_or_postcode": None,
            "verified_country_code": None,
        }
    city = address.get("city") or address.get("town") or address.get("village") or address.get("county")
    return {
        "verified_city": normalize_city(clean_text(city)),
        "verified_state_or_region": normalize_state(clean_text(address.get("state"))),
        "verified_zip_or_postcode": normalize_zip(clean_text(address.get("postcode"))),
        "verified_country_code": clean_text(address.get("country_code")) or clean_text(address.get("country")),
    }


def geocode_google(client: httpx.Client, query: str, api_key: str) -> dict[str, Any] | None:
    response = client.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": query, "key": api_key},
        timeout=20.0,
    )
    if response.status_code != 200:
        return None
    payload = response.json()
    results = payload.get("results") or []
    if not results:
        return None
    top = results[0]
    location = (top.get("geometry") or {}).get("location") or {}
    lat = location.get("lat")
    lon = location.get("lng")
    parsed = parse_google_components(top.get("address_components") or [])
    return {
        "geocode_provider": "google",
        "geocode_formatted_address": top.get("formatted_address"),
        "geocode_lat": lat,
        "geocode_lon": lon,
        **parsed,
    }


def geocode_nominatim(client: httpx.Client, query: str) -> dict[str, Any] | None:
    response = client.get(
        f"{NOMINATIM_BASE}/search",
        params={"format": "json", "limit": 1, "addressdetails": 1, "q": query},
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=20.0,
    )
    if response.status_code != 200:
        return None
    results = response.json()
    if not results:
        return None
    top = results[0]
    lat = float(top.get("lat")) if top.get("lat") else None
    lon = float(top.get("lon")) if top.get("lon") else None
    parsed = parse_nominatim_address(top.get("address"))
    return {
        "geocode_provider": "nominatim",
        "geocode_formatted_address": top.get("display_name"),
        "geocode_lat": lat,
        "geocode_lon": lon,
        **parsed,
    }


def values_differ(raw: str | None, verified: str | None) -> bool:
    raw_key = normalize_key(raw)
    verified_key = normalize_key(verified)
    if not raw_key or not verified_key:
        return False
    return raw_key != verified_key


def coords_differ(
    raw_lat: Any,
    raw_lon: Any,
    geocode_lat: float | None,
    geocode_lon: float | None,
    *,
    threshold_km: float = 25.0,
) -> bool:
    try:
        lat1 = float(raw_lat)
        lon1 = float(raw_lon)
    except (TypeError, ValueError):
        return False
    if geocode_lat is None or geocode_lon is None:
        return False
    # Simple haversine
    from math import asin, cos, radians, sin, sqrt

    d_lat = radians(geocode_lat - lat1)
    d_lon = radians(geocode_lon - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(geocode_lat)) * sin(d_lon / 2) ** 2
    km = 6371 * 2 * asin(sqrt(a))
    return km > threshold_km


def compute_mismatch_flags(row: dict[str, Any]) -> str | None:
    flags: list[str] = []
    if values_differ(row.get("raw_city"), row.get("verified_city")):
        flags.append("city")
    if values_differ(row.get("raw_state_or_region"), row.get("verified_state_or_region")):
        flags.append("state")
    raw_zip = normalize_zip(clean_text(row.get("raw_zip_or_postcode")))
    verified_zip = normalize_zip(clean_text(row.get("verified_zip_or_postcode")))
    if raw_zip and verified_zip and raw_zip != verified_zip:
        flags.append("zip")
    if coords_differ(row.get("latitude"), row.get("longitude"), row.get("geocode_lat"), row.get("geocode_lon")):
        flags.append("coords")
    return ",".join(flags) if flags else None


def geocode_facility(
    client: httpx.Client,
    row: dict[str, Any],
    checked_at: str,
    *,
    google_key: str | None,
    nominatim_delay_sec: float,
) -> dict[str, Any]:
    query = build_geocode_query(row)
    result: dict[str, Any] | None = None

    if google_key:
        result = geocode_google(client, query, google_key)
    if result is None:
        time.sleep(nominatim_delay_sec)
        result = geocode_nominatim(client, query)

    base = {
        "unique_id": row["unique_id"],
        "geocode_query": query,
        "raw_city": clean_text(row.get("address_city")),
        "raw_state_or_region": clean_text(row.get("address_state_or_region")),
        "raw_zip_or_postcode": clean_text(row.get("address_zip_or_postcode")),
        "raw_country_code": clean_text(row.get("address_country_code")),
        "checked_at": checked_at,
    }

    if result is None:
        return {
            **base,
            "geocode_provider": "none",
            "geocode_status": "failed",
            "geocode_formatted_address": None,
            "geocode_lat": None,
            "geocode_lon": None,
            "verified_city": None,
            "verified_state_or_region": None,
            "verified_zip_or_postcode": None,
            "verified_country_code": None,
            "mismatch_flags": None,
        }

    verified = {
        **base,
        **result,
        "geocode_status": "ok"
        if result.get("verified_city") and result.get("verified_state_or_region")
        else "partial",
    }
    verified["mismatch_flags"] = compute_mismatch_flags({**row, **verified})
    return verified


def write_csv(rows: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CHECKPOINT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def load_checkpoint() -> dict[str, dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    if CSV_PATH.exists():
        with CSV_PATH.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if row.get("unique_id"):
                    merged[row["unique_id"]] = row
    if CHECKPOINT_PATH.exists():
        with CHECKPOINT_PATH.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("unique_id"):
                    merged[row["unique_id"]] = row
    return merged


def append_checkpoint(row: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with CHECKPOINT_LOCK:
        with CHECKPOINT_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
            handle.flush()


def clear_checkpoint() -> None:
    if CHECKPOINT_PATH.exists():
        CHECKPOINT_PATH.unlink()


def write_insert_batches(rows: list[dict[str, Any]], batch_size: int = 50) -> list[Path]:
    SQL_BATCH_DIR.mkdir(parents=True, exist_ok=True)
    for old in SQL_BATCH_DIR.glob("batch_*.sql"):
        old.unlink()

    paths: list[Path] = []
    for index in range(0, len(rows), batch_size):
        chunk = rows[index : index + batch_size]
        values_sql = []
        for row in chunk:
            values_sql.append("(" + ", ".join(sql_literal(row.get(col)) for col in CHECKPOINT_FIELDS) + ")")
        sql = (
            "INSERT INTO workspace.gold.facility_address_validation ("
            + ", ".join(CHECKPOINT_FIELDS)
            + ") VALUES\n"
            + ",\n".join(values_sql)
            + ";"
        )
        path = SQL_BATCH_DIR / f"batch_{index // batch_size:04d}.sql"
        path.write_text(sql, encoding="utf-8")
        paths.append(path)
    return paths


def upload_rows(profile: str, rows: list[dict[str, Any]]) -> None:
    ddl_path = ROOT / "scripts" / "sql" / "03-facility-address-validation-table.sql"
    run_databricks_file(profile, ddl_path)
    run_databricks_query(profile, "TRUNCATE TABLE workspace.gold.facility_address_validation")
    for path in write_insert_batches(rows):
        run_databricks_file(profile, path)
        print(f"Uploaded {path.name}")


def write_merge_batches(rows: list[dict[str, Any]], batch_size: int = 50) -> list[Path]:
    SQL_BATCH_DIR.mkdir(parents=True, exist_ok=True)
    for old in SQL_BATCH_DIR.glob("merge_*.sql"):
        old.unlink()

    update_fields = [col for col in CHECKPOINT_FIELDS if col != "unique_id"]
    set_clause = ",\n  ".join(f"{col} = source.{col}" for col in update_fields)
    cols = ", ".join(CHECKPOINT_FIELDS)

    paths: list[Path] = []
    for index in range(0, len(rows), batch_size):
        chunk = rows[index : index + batch_size]
        values_sql = []
        for row in chunk:
            values_sql.append("(" + ", ".join(sql_literal(row.get(col)) for col in CHECKPOINT_FIELDS) + ")")
        sql = (
            "MERGE INTO workspace.gold.facility_address_validation AS target\n"
            "USING (\n"
            "  SELECT * FROM VALUES\n"
            + ",\n".join(values_sql)
            + f"\n  AS source({cols})\n"
            ") AS source\n"
            "ON target.unique_id = source.unique_id\n"
            "WHEN MATCHED THEN UPDATE SET\n"
            f"  {set_clause}\n"
            ";"
        )
        path = SQL_BATCH_DIR / f"merge_{index // batch_size:04d}.sql"
        path.write_text(sql, encoding="utf-8")
        paths.append(path)
    return paths


def upload_rows_merge(profile: str, rows: list[dict[str, Any]]) -> None:
    for path in write_merge_batches(rows):
        run_databricks_file(profile, path)
        print(f"Merged {path.name}")


def geocode_pending(
    pending: list[dict[str, Any]],
    checked_at: str,
    *,
    workers: int,
    google_key: str | None,
    nominatim_delay_sec: float,
) -> list[dict[str, Any]]:
    if not pending:
        return []

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    results: list[dict[str, Any]] = []
    with httpx.Client(headers=headers, timeout=20.0) as client:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    geocode_facility,
                    client,
                    row,
                    checked_at,
                    google_key=google_key,
                    nominatim_delay_sec=nominatim_delay_sec,
                ): row["unique_id"]
                for row in pending
            }
            done = 0
            for future in as_completed(futures):
                unique_id = futures[future]
                try:
                    row = future.result()
                except Exception as exc:  # noqa: BLE001
                    print(f"  ERROR {unique_id}: {exc}", file=sys.stderr, flush=True)
                    row = {
                        "unique_id": unique_id,
                        "geocode_query": None,
                        "geocode_provider": "none",
                        "geocode_status": "failed",
                        "geocode_formatted_address": None,
                        "geocode_lat": None,
                        "geocode_lon": None,
                        "raw_city": None,
                        "raw_state_or_region": None,
                        "raw_zip_or_postcode": None,
                        "raw_country_code": None,
                        "verified_city": None,
                        "verified_state_or_region": None,
                        "verified_zip_or_postcode": None,
                        "verified_country_code": None,
                        "mismatch_flags": None,
                        "checked_at": checked_at,
                    }
                results.append(row)
                done += 1
                if done % 10 == 0 or done == len(pending):
                    print(f"  {done}/{len(pending)} complete", flush=True)
    return sorted(results, key=lambda item: item["unique_id"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Geocode and normalize facility addresses")
    parser.add_argument("--profile", default="dbc-69c2f85e-61ee")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--upload-only", action="store_true")
    parser.add_argument("--skip-upload", action="store_true")
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--fresh", action="store_true")
    parser.add_argument(
        "--nominatim-delay",
        type=float,
        default=1.1,
        help="Seconds to wait before each Nominatim request (rate limit)",
    )
    parser.add_argument(
        "--invalid-cities-only",
        action="store_true",
        help="Re-geocode gold rows where verified_city is a single character (sector/zone suffix bug)",
    )
    parser.add_argument(
        "--unique-ids",
        help="Comma-separated facility unique_ids to re-geocode (unioned with --invalid-cities-only when both set)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List affected unique_ids from gold and exit (use with --invalid-cities-only)",
    )
    args = parser.parse_args()

    load_local_env()

    if args.fresh:
        args.resume = False

    google_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip() or None
    if not google_key:
        print("Warning: GOOGLE_MAPS_API_KEY not set — using Nominatim only (slower, less accurate in India).")

    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    if args.upload_only:
        checkpoint = load_checkpoint()
        if not checkpoint:
            print(f"Missing checkpoint/CSV in {OUTPUT_DIR}", file=sys.stderr)
            return 1
        rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
        write_csv(rows)
        upload_rows(args.profile, rows)
        print(f"Uploaded {len(rows)} rows to workspace.gold.facility_address_validation")
        return 0

    explicit_ids = parse_unique_ids(args.unique_ids)
    repair_mode = args.invalid_cities_only or bool(explicit_ids)
    if repair_mode:
        target_ids = resolve_target_unique_ids(
            args.profile,
            invalid_cities_only=args.invalid_cities_only,
            unique_ids=explicit_ids,
        )
        if args.dry_run:
            if args.invalid_cities_only:
                bad_rows = run_databricks_query(args.profile, INVALID_CITIES_SQL)
                print(
                    f"Found {len(bad_rows)} row(s) in workspace.gold.facility_address_validation "
                    "with invalid verified_city (LENGTH(TRIM(verified_city)) <= 1):"
                )
                for row in bad_rows:
                    print(f"  {row['unique_id']}  verified_city={row.get('verified_city')!r}")
            if explicit_ids:
                print(f"Explicit --unique-ids ({len(explicit_ids)}): {', '.join(explicit_ids)}")
            print(f"Total unique_ids to re-geocode: {len(target_ids)}")
            return 0

        if not target_ids:
            print("No facilities to re-geocode.")
            return 0

        print(f"Re-geocoding {len(target_ids)} affected facility(s)...", flush=True)
        facilities = run_databricks_query(args.profile, facilities_sql_for_ids(target_ids))
        found_ids = {row["unique_id"] for row in facilities}
        missing = sorted(set(target_ids) - found_ids)
        if missing:
            print(
                f"Warning: {len(missing)} unique_id(s) not found in source facilities: "
                + ", ".join(missing[:5])
                + ("..." if len(missing) > 5 else ""),
                file=sys.stderr,
            )

        rows = geocode_pending(
            facilities,
            checked_at,
            workers=args.workers,
            google_key=google_key,
            nominatim_delay_sec=args.nominatim_delay,
        )
        checkpoint = load_checkpoint()
        for row in rows:
            checkpoint[row["unique_id"]] = row
            append_checkpoint(row)
        write_csv(sorted(checkpoint.values(), key=lambda item: item["unique_id"]))
        if not args.skip_upload:
            upload_rows_merge(args.profile, rows)
            print(f"Merged {len(rows)} row(s) into workspace.gold.facility_address_validation")
        return 0

    facilities = run_databricks_query(args.profile, FACILITIES_SQL)
    if args.limit > 0:
        facilities = facilities[: args.limit]

    if not args.resume:
        clear_checkpoint()

    checkpoint = load_checkpoint() if args.resume else {}
    pending = [row for row in facilities if row["unique_id"] not in checkpoint]
    total = len(facilities)
    already_done = len(checkpoint)

    if not pending:
        print(f"All {total} facilities already checkpointed.")
        rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
        write_csv(rows)
        if not args.skip_upload:
            upload_rows(args.profile, rows)
            print("Upload complete.")
        return 0

    print(
        f"Geocoding {len(pending)} facilities ({already_done} already saved, {total} total) "
        f"with {args.workers} workers...",
        flush=True,
    )

    geocoded = geocode_pending(
        pending,
        checked_at,
        workers=args.workers,
        google_key=google_key,
        nominatim_delay_sec=args.nominatim_delay,
    )
    for row in geocoded:
        checkpoint[row["unique_id"]] = row
        append_checkpoint(row)

    rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
    write_csv(rows)
    if not args.skip_upload:
        upload_rows(args.profile, rows)
        print("Upload complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
