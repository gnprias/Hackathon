#!/usr/bin/env python3
"""
Validate facility official websites and Facebook links, then load results into
workspace.gold.facility_link_validation.

Usage:
  pip install -r scripts/python/requirements.txt
  python scripts/python/validate_facility_links.py --profile dbc-69c2f85e-61ee
  python scripts/python/validate_facility_links.py --profile dbc-69c2f85e-61ee --limit 50
  python scripts/python/validate_facility_links.py --profile dbc-69c2f85e-61ee --upload-only
  python scripts/python/validate_facility_links.py --profile dbc-69c2f85e-61ee --resume   # default
  python scripts/python/validate_facility_links.py --profile dbc-69c2f85e-61ee --fresh    # start over

Progress is saved after every facility to:
  scripts/output/facility_link_validation_checkpoint.jsonl
CSV snapshots are written every 250 facilities and at the end.
Re-run the same command after a crash to continue (--resume is on by default).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "scripts" / "output"
CSV_PATH = OUTPUT_DIR / "facility_link_validation.csv"
CHECKPOINT_PATH = OUTPUT_DIR / "facility_link_validation_checkpoint.jsonl"
SQL_BATCH_DIR = OUTPUT_DIR / "link_validation_batches"
CHECKPOINT_LOCK = threading.Lock()
CHECKPOINT_FIELDS = [
    "unique_id",
    "official_website_raw",
    "websites_all_raw",
    "websites_checked_count",
    "official_website_url",
    "website_working_url",
    "website_status",
    "website_http_code",
    "website_error",
    "facebook_url_raw",
    "facebook_url",
    "facebook_status",
    "facebook_http_code",
    "facebook_error",
    "checked_at",
]
FACILITIES_SQL = """
SELECT
  unique_id,
  officialWebsite AS official_website_raw,
  websites AS websites_raw,
  facebookLink AS facebook_url_raw
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
WHERE unique_id RLIKE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY unique_id
"""

MISSING_VALUES = {"", "null", "none", "n/a", "na", "undefined"}


@dataclass
class CheckResult:
    status: str
    http_code: int | None
    error: str | None
    normalized_url: str | None


def run_databricks_query(profile: str, sql: str) -> list[dict[str, Any]]:
    cmd = [
        "databricks",
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
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "Databricks query failed")
    payload = proc.stdout.strip()
    if not payload:
        return []
    if payload.startswith("Query executed successfully"):
        return []
    return json.loads(payload)


def clean_raw_url(raw: str) -> str:
    value = raw.strip()
    while len(value) >= 2 and (
        (value.startswith('"') and value.endswith('"'))
        or (value.startswith("'") and value.endswith("'"))
    ):
        value = value[1:-1].strip()
    return value


def normalize_url(raw: str | None, *, facebook: bool = False) -> str | None:
    if raw is None:
        return None
    value = clean_raw_url(raw)
    if value.lower() in MISSING_VALUES:
        return None
    if facebook and re.fullmatch(r"\d+", value):
        value = f"https://www.facebook.com/{value}"
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    if not parsed.netloc:
        return None
    return value


def classify_website(response: httpx.Response | None, exc: Exception | None) -> CheckResult:
    if exc is not None:
        if isinstance(exc, httpx.TimeoutException):
            return CheckResult("timeout", None, str(exc), None)
        return CheckResult("error", None, str(exc), None)
    assert response is not None
    code = response.status_code
    if 200 <= code < 400:
        return CheckResult("ok", code, None, str(response.url))
    return CheckResult("fail", code, f"HTTP {code}", str(response.url))


def classify_facebook(response: httpx.Response | None, exc: Exception | None) -> CheckResult:
    if exc is not None:
        if isinstance(exc, httpx.TimeoutException):
            return CheckResult("timeout", None, str(exc), None)
        return CheckResult("error", None, str(exc), None)
    assert response is not None
    code = response.status_code
    if code in (401, 403, 999):
        return CheckResult("blocked", code, f"HTTP {code}", str(response.url))
    if 200 <= code < 400:
        return CheckResult("ok", code, None, str(response.url))
    return CheckResult("fail", code, f"HTTP {code}", str(response.url))


def dedupe_key(raw: str) -> str:
    normalized = normalize_url(raw)
    if normalized:
        try:
            parsed = urlparse(normalized)
        except ValueError:
            return raw.strip().lower()
        host = (parsed.netloc or "").lower()
        if host.startswith("www."):
            host = host[4:]
        path = parsed.path.rstrip("/")
        return f"{host}{path}"
    return raw.strip().lower()


def parse_websites_raw(websites_raw: str | None) -> list[str]:
    if websites_raw is None:
        return []
    value = websites_raw.strip()
    if value.lower() in MISSING_VALUES:
        return []
    if value.startswith("["):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            return [clean_raw_url(str(item)) for item in parsed if clean_raw_url(str(item))]
    if "," in value:
        return [part.strip() for part in value.split(",") if part.strip()]
    return [value]


def collect_website_urls(row: dict[str, Any]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()

    def add(raw: str | None) -> None:
        if raw is None:
            return
        value = clean_raw_url(raw)
        if value.lower() in MISSING_VALUES:
            return
        key = dedupe_key(value)
        if key in seen:
            return
        seen.add(key)
        ordered.append(value)

    add(row.get("official_website_raw"))
    for raw in parse_websites_raw(row.get("websites_raw")):
        add(raw)
    return ordered


def check_websites(client: httpx.Client, urls: list[str]) -> tuple[CheckResult, int, str | None]:
    if not urls:
        return CheckResult("missing", None, None, None), 0, None

    last_result = CheckResult("fail", None, "All website URLs failed", None)
    errors: list[str] = []
    for raw in urls:
        result = check_url(client, raw)
        last_result = result
        if result.status == "ok":
            return result, len(urls), result.normalized_url
        if result.error and result.error not in errors:
            errors.append(result.error)

    summary = "; ".join(errors[:3])
    if len(errors) > 3:
        summary += f"; +{len(errors) - 3} more"
    return (
        CheckResult(last_result.status, last_result.http_code, summary or last_result.error, last_result.normalized_url),
        len(urls),
        None,
    )


def check_url(
    client: httpx.Client,
    raw: str | None,
    *,
    facebook: bool = False,
) -> CheckResult:
    normalized = normalize_url(raw, facebook=facebook)
    if normalized is None:
        return CheckResult("missing", None, None, None)
    try:
        response = client.head(normalized, follow_redirects=True)
        if response.status_code >= 400 or response.status_code in (405, 501):
            response = client.get(normalized, follow_redirects=True)
        if facebook:
            return classify_facebook(response, None)
        return classify_website(response, None)
    except Exception as exc:  # noqa: BLE001
        try:
            response = client.get(normalized, follow_redirects=True)
            if facebook:
                return classify_facebook(response, None)
            return classify_website(response, None)
        except Exception as retry_exc:  # noqa: BLE001
            if facebook:
                return classify_facebook(None, retry_exc)
            return classify_website(None, retry_exc)


def validate_facility(
    client: httpx.Client,
    row: dict[str, Any],
    checked_at: str,
) -> dict[str, Any]:
    website_urls = collect_website_urls(row)
    website, websites_checked_count, working_url = check_websites(client, website_urls)
    facebook = check_url(client, row.get("facebook_url_raw"), facebook=True)
    official_fallback = normalize_url(row.get("official_website_raw"))
    return {
        "unique_id": row["unique_id"],
        "official_website_raw": row.get("official_website_raw"),
        "websites_all_raw": json.dumps(website_urls, ensure_ascii=False) if website_urls else None,
        "websites_checked_count": websites_checked_count,
        "official_website_url": working_url or official_fallback,
        "website_working_url": working_url,
        "website_status": website.status,
        "website_http_code": website.http_code,
        "website_error": website.error,
        "facebook_url_raw": row.get("facebook_url_raw"),
        "facebook_url": facebook.normalized_url or normalize_url(row.get("facebook_url_raw"), facebook=True),
        "facebook_status": facebook.status,
        "facebook_http_code": facebook.http_code,
        "facebook_error": facebook.error,
        "checked_at": checked_at,
    }


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return "NULL"
        escaped = stripped.replace("'", "''")
        return f"'{escaped}'"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(int(value))
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def write_csv(rows: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CHECKPOINT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def load_checkpoint() -> dict[str, dict[str, Any]]:
    """Merge any prior CSV and JSONL checkpoint lines by unique_id."""
    merged: dict[str, dict[str, Any]] = {}
    if CSV_PATH.exists():
        with CSV_PATH.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                unique_id = row.get("unique_id")
                if unique_id:
                    merged[unique_id] = row
    if CHECKPOINT_PATH.exists():
        with CHECKPOINT_PATH.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                unique_id = row.get("unique_id")
                if unique_id:
                    merged[unique_id] = row
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


def snapshot_progress(checkpoint: dict[str, dict[str, Any]]) -> None:
    rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
    write_csv(rows)


def write_insert_batches(rows: list[dict[str, Any]], batch_size: int = 75) -> list[Path]:
    SQL_BATCH_DIR.mkdir(parents=True, exist_ok=True)
    for old in SQL_BATCH_DIR.glob("batch_*.sql"):
        old.unlink()

    paths: list[Path] = []
    columns = [
        "unique_id",
        "official_website_raw",
        "websites_all_raw",
        "websites_checked_count",
        "official_website_url",
        "website_working_url",
        "website_status",
        "website_http_code",
        "website_error",
        "facebook_url_raw",
        "facebook_url",
        "facebook_status",
        "facebook_http_code",
        "facebook_error",
        "checked_at",
    ]
    for index in range(0, len(rows), batch_size):
        chunk = rows[index : index + batch_size]
        values_sql = []
        for row in chunk:
            values_sql.append(
                "(" + ", ".join(sql_literal(row.get(col)) for col in columns) + ")"
            )
        sql = (
            "INSERT INTO workspace.gold.facility_link_validation ("
            + ", ".join(columns)
            + ") VALUES\n"
            + ",\n".join(values_sql)
            + ";"
        )
        path = SQL_BATCH_DIR / f"batch_{index // batch_size:04d}.sql"
        path.write_text(sql, encoding="utf-8")
        paths.append(path)
    return paths


def run_databricks_file(profile: str, path: Path, *, attempts: int = 4) -> None:
    cmd = [
        "databricks",
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
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode == 0:
            return
        last_error = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
        if attempt < attempts:
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f"{path.name} failed after {attempts} attempts: {last_error}")


def upload_rows(profile: str, rows: list[dict[str, Any]], *, recreate_table: bool = False) -> None:
    if recreate_table:
        ddl_path = ROOT / "scripts" / "sql" / "02-facility-link-validation-table.sql"
        run_databricks_file(profile, ddl_path)
    run_databricks_query(profile, "TRUNCATE TABLE workspace.gold.facility_link_validation")
    batch_paths = write_insert_batches(rows)
    for path in batch_paths:
        run_databricks_file(profile, path)
        print(f"Uploaded {path.name}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate facility website and Facebook links")
    parser.add_argument("--profile", default="dbc-69c2f85e-61ee")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--limit", type=int, default=0, help="Validate only the first N facilities")
    parser.add_argument("--upload-only", action="store_true", help="Upload existing CSV without re-validating")
    parser.add_argument("--skip-upload", action="store_true", help="Validate and write CSV only")
    parser.add_argument(
        "--resume",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Skip facilities already in checkpoint/CSV (default: true)",
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Clear checkpoint and re-validate everything",
    )
    args = parser.parse_args()

    if args.fresh:
        args.resume = False

    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    if args.upload_only:
        checkpoint = load_checkpoint()
        if not checkpoint:
            print(f"Missing checkpoint/CSV in {OUTPUT_DIR}", file=sys.stderr)
            return 1
        rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
        write_csv(rows)
        upload_rows(args.profile, rows)
        print(f"Uploaded {len(rows)} rows to workspace.gold.facility_link_validation")
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
        f"Validating {len(pending)} facilities "
        f"({already_done} already saved, {total} total) with {args.workers} workers...",
        flush=True,
    )

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; VirtueFoundationLinkChecker/1.0; "
            "+https://github.com/virtue-foundation/hackathon-app)"
        )
    }
    timeout = httpx.Timeout(args.timeout, connect=min(8.0, args.timeout))
    limits = httpx.Limits(max_connections=args.workers, max_keepalive_connections=args.workers)

    rows: list[dict[str, Any]] = []
    with httpx.Client(headers=headers, timeout=timeout, limits=limits, verify=True) as client:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(validate_facility, client, row, checked_at): row["unique_id"]
                for row in pending
            }
            done_this_run = 0
            for future in as_completed(futures):
                unique_id = futures[future]
                try:
                    row = future.result()
                except Exception as exc:  # noqa: BLE001
                    print(f"  ERROR {unique_id}: {exc}", file=sys.stderr, flush=True)
                    row = {
                        "unique_id": unique_id,
                        "official_website_raw": None,
                        "websites_all_raw": None,
                        "websites_checked_count": 0,
                        "official_website_url": None,
                        "website_working_url": None,
                        "website_status": "error",
                        "website_http_code": None,
                        "website_error": str(exc),
                        "facebook_url_raw": None,
                        "facebook_url": None,
                        "facebook_status": "error",
                        "facebook_http_code": None,
                        "facebook_error": str(exc),
                        "checked_at": checked_at,
                    }
                checkpoint[unique_id] = row
                append_checkpoint(row)
                rows.append(row)
                done_this_run += 1
                overall = already_done + done_this_run
                if done_this_run % 100 == 0 or done_this_run == len(pending):
                    print(
                        f"  checked {overall}/{total} ({done_this_run}/{len(pending)} this run)",
                        flush=True,
                    )
                if done_this_run % 250 == 0 or done_this_run == len(pending):
                    snapshot_progress(checkpoint)
                    print(f"  checkpoint saved ({overall}/{total})", flush=True)

    all_rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
    write_csv(all_rows)
    print(f"Wrote {CSV_PATH} ({len(all_rows)} rows)")

    if not args.skip_upload:
        upload_rows(args.profile, all_rows, recreate_table=True)
        print("Upload complete.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
