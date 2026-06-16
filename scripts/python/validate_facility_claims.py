#!/usr/bin/env python3
"""
Validate whether facility specialties align with procedure/equipment/capability claims.

Rule-based checks run for every facility. Optional OpenAI semantic scoring (--ai openai).

Usage:
  pip install -r scripts/python/requirements.txt
  databricks experimental aitools tools query --profile PROFILE --file scripts/sql/04-facility-claim-validation-table.sql
  python scripts/python/validate_facility_claims.py --profile dbc-69c2f85e-61ee --limit 200
  python scripts/python/validate_facility_claims.py --profile dbc-69c2f85e-61ee
  python scripts/python/validate_facility_claims.py --profile dbc-69c2f85e-61ee --ai openai --ai-limit 100
  python scripts/python/validate_facility_claims.py --profile dbc-69c2f85e-61ee --upload-only

Checkpoint: scripts/output/facility_claim_validation_checkpoint.jsonl
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from claim_validation_lib import (
    build_claims_text,
    collect_specialties,
    evaluate_rule_consistency,
    merge_ai_result,
    parse_json_string_list,
    rules_only_result,
)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "scripts" / "output"
CSV_PATH = OUTPUT_DIR / "facility_claim_validation.csv"
CHECKPOINT_PATH = OUTPUT_DIR / "facility_claim_validation_checkpoint.jsonl"
SQL_BATCH_DIR = OUTPUT_DIR / "claim_validation_batches"
CHECKPOINT_LOCK = threading.Lock()
ENV_FILE = ROOT / "dais-app" / ".env"

FACILITY_IDS_SQL = """
SELECT unique_id
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
WHERE unique_id RLIKE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY unique_id
"""

FACILITIES_BATCH_SQL = """
SELECT
  unique_id,
  name,
  specialties,
  procedure,
  equipment,
  capability
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
WHERE unique_id IN ({ids})
ORDER BY unique_id
"""

GOLD_SPECIALTIES_BATCH_SQL = """
SELECT unique_id, specialty_canonical
FROM workspace.gold.facility_specialties
WHERE specialty_canonical IS NOT NULL
  AND TRIM(specialty_canonical) <> ''
ORDER BY unique_id, specialty_canonical
LIMIT {limit} OFFSET {offset}
"""

DEFAULT_FETCH_BATCH_SIZE = 150

CHECKPOINT_FIELDS = [
    "unique_id",
    "specialty_count",
    "supported_specialty_count",
    "unsupported_specialties",
    "orphan_claim_terms",
    "rule_status",
    "rule_score",
    "consistency_status",
    "consistency_score",
    "consistency_provider",
    "consistency_summary",
    "mismatch_flags",
    "checked_at",
]


def load_local_env() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


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
        if isinstance(value, float) and value != value:
            return "NULL"
        return str(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def chunk_list(items: list[Any], size: int):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def load_facility_ids(profile: str, *, limit: int = 0) -> list[str]:
    rows = run_databricks_query(profile, FACILITY_IDS_SQL)
    ids = [str(row["unique_id"]) for row in rows if row.get("unique_id")]
    if limit > 0:
        ids = ids[:limit]
    return ids


def load_facilities(
    profile: str,
    *,
    limit: int = 0,
    batch_size: int = DEFAULT_FETCH_BATCH_SIZE,
) -> list[dict[str, Any]]:
    ids = load_facility_ids(profile, limit=limit)
    if not ids:
        return []

    facilities: list[dict[str, Any]] = []
    total_batches = (len(ids) + batch_size - 1) // batch_size
    for batch_index, batch_ids in enumerate(chunk_list(ids, batch_size), start=1):
        in_clause = ", ".join(sql_literal(unique_id) for unique_id in batch_ids)
        sql = FACILITIES_BATCH_SQL.format(ids=in_clause)
        batch_rows = run_databricks_query(profile, sql)
        facilities.extend(batch_rows)
        print(
            f"  Fetched facilities batch {batch_index}/{total_batches} "
            f"({len(facilities)}/{len(ids)})",
            flush=True,
        )
    return facilities


def load_gold_specialties(profile: str, *, batch_size: int = 5000) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    offset = 0
    batch_num = 0
    while True:
        sql = GOLD_SPECIALTIES_BATCH_SQL.format(limit=batch_size, offset=offset)
        rows = run_databricks_query(profile, sql)
        if not rows:
            break
        batch_num += 1
        for row in rows:
            unique_id = str(row.get("unique_id") or "").strip()
            canonical = str(row.get("specialty_canonical") or "").strip().lower()
            if not unique_id or not canonical:
                continue
            grouped.setdefault(unique_id, [])
            if canonical not in grouped[unique_id]:
                grouped[unique_id].append(canonical)
        print(
            f"  Loaded gold specialties batch {batch_num} "
            f"({len(rows)} rows, {len(grouped)} facilities)",
            flush=True,
        )
        if len(rows) < batch_size:
            break
        offset += batch_size
    return grouped


def score_with_openai(
    client: httpx.Client,
    *,
    name: str,
    specialties: list[str],
    procedure: list[str],
    equipment: list[str],
    capability: list[str],
) -> tuple[float | None, str | None]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None, "OPENAI_API_KEY not set"

    payload = {
        "name": name,
        "specialties": specialties,
        "procedure": procedure,
        "equipment": equipment,
        "capability": capability,
    }
    response = client.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini",
            "temperature": 0.1,
            "max_tokens": 220,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You assess whether a healthcare facility's listed specialties are supported by "
                        "its procedure, equipment, and capability fields. All fields are facility-reported. "
                        'Return JSON: {"score":0.0-1.0,"summary":"one sentence","mismatches":["..."]}. '
                        "Score 1.0 when specialties clearly align; 0.0 when they clearly conflict."
                    ),
                },
                {"role": "user", "content": json.dumps(payload)},
            ],
        },
        timeout=45.0,
    )
    if response.status_code != 200:
        return None, f"OpenAI HTTP {response.status_code}"

    body = response.json()
    content = body.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        return None, "OpenAI returned empty content"
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None, "OpenAI returned invalid JSON"
    score = parsed.get("score")
    summary = parsed.get("summary")
    mismatches = parsed.get("mismatches") or []
    if isinstance(score, (int, float)):
        score_value = max(0.0, min(1.0, float(score)))
    else:
        score_value = None
    if isinstance(mismatches, list) and mismatches:
        mismatch_text = "; ".join(str(item) for item in mismatches[:3])
        summary = f"{summary} Mismatches: {mismatch_text}." if summary else f"Mismatches: {mismatch_text}."
    return score_value, str(summary) if summary else None


def validate_facility(
    row: dict[str, Any],
    *,
    gold_specialties: list[str] | None,
    checked_at: str,
    ai_mode: str,
    ai_client: httpx.Client | None,
) -> dict[str, Any]:
    specialties = collect_specialties(row, gold_specialties)
    claims_text = build_claims_text(
        row.get("procedure"),
        row.get("equipment"),
        row.get("capability"),
    )
    rule_result = evaluate_rule_consistency(specialties=specialties, claims_text=claims_text)

    if ai_mode == "openai" and ai_client is not None:
        ai_score, ai_summary = score_with_openai(
            ai_client,
            name=str(row.get("name") or ""),
            specialties=specialties,
            procedure=parse_json_string_list(row.get("procedure")),
            equipment=parse_json_string_list(row.get("equipment")),
            capability=parse_json_string_list(row.get("capability")),
        )
        result = merge_ai_result(
            rule_result,
            ai_score=ai_score,
            ai_summary=ai_summary,
            provider="openai",
        )
    else:
        result = rules_only_result(rule_result)

    return {
        "unique_id": row["unique_id"],
        **result,
        "checked_at": checked_at,
    }


def append_checkpoint(row: dict[str, Any]) -> None:
    with CHECKPOINT_LOCK:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        with CHECKPOINT_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


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
                row = json.loads(line)
                if row.get("unique_id"):
                    merged[row["unique_id"]] = row
    return merged


def clear_checkpoint() -> None:
    if CSV_PATH.exists():
        CSV_PATH.unlink()
    if CHECKPOINT_PATH.exists():
        CHECKPOINT_PATH.unlink()


def write_csv(rows: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CHECKPOINT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


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
            "INSERT INTO workspace.gold.facility_claim_validation ("
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
    ddl_path = ROOT / "scripts" / "sql" / "04-facility-claim-validation-table.sql"
    run_databricks_file(profile, ddl_path)
    run_databricks_query(profile, "TRUNCATE TABLE workspace.gold.facility_claim_validation")
    for path in write_insert_batches(rows):
        run_databricks_file(profile, path)
        print(f"Uploaded {path.name}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate facility specialty vs claim consistency")
    parser.add_argument("--profile", default="dbc-69c2f85e-61ee")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--upload-only", action="store_true")
    parser.add_argument("--skip-upload", action="store_true")
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--fresh", action="store_true")
    parser.add_argument("--ai", choices=["none", "openai"], default="none")
    parser.add_argument(
        "--ai-limit",
        type=int,
        default=0,
        help="Only run OpenAI semantic scoring for the first N pending facilities (0 = all pending)",
    )
    parser.add_argument(
        "--fetch-batch-size",
        type=int,
        default=DEFAULT_FETCH_BATCH_SIZE,
        help="Facilities per Databricks fetch batch (avoids inline result size limit)",
    )
    args = parser.parse_args()

    load_local_env()

    if args.fresh:
        args.resume = False

    if args.upload_only:
        checkpoint = load_checkpoint()
        if not checkpoint:
            print(f"Missing checkpoint/CSV in {OUTPUT_DIR}", file=sys.stderr)
            return 1
        rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
        write_csv(rows)
        upload_rows(args.profile, rows)
        print(f"Uploaded {len(rows)} rows to workspace.gold.facility_claim_validation")
        return 0

    print("Loading facilities from Databricks (batched)...", flush=True)
    facilities = load_facilities(
        args.profile,
        limit=args.limit,
        batch_size=max(1, args.fetch_batch_size),
    )

    print("Loading canonical specialties from workspace.gold.facility_specialties...", flush=True)
    gold_specialty_map = load_gold_specialties(args.profile)

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
            print("Upload complete.", flush=True)
        return 0

    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    ai_mode = args.ai
    ai_remaining = args.ai_limit if args.ai_limit > 0 else len(pending)

    print(
        f"Validating {len(pending)} facilities ({already_done} already saved, {total} total) "
        f"with {args.workers} workers; ai={ai_mode}...",
        flush=True,
    )

    done_this_run = 0
    with httpx.Client() as ai_client:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {}
            for row in pending:
                use_ai = ai_mode == "openai" and ai_remaining > 0
                if use_ai:
                    ai_remaining -= 1
                futures[
                    pool.submit(
                        validate_facility,
                        row,
                        gold_specialties=gold_specialty_map.get(row["unique_id"]),
                        checked_at=checked_at,
                        ai_mode=ai_mode if use_ai else "none",
                        ai_client=ai_client if use_ai else None,
                    )
                ] = row["unique_id"]

            for future in as_completed(futures):
                unique_id = futures[future]
                try:
                    result = future.result()
                except Exception as exc:  # noqa: BLE001
                    print(f"  ERROR {unique_id}: {exc}", file=sys.stderr, flush=True)
                    result = {
                        "unique_id": unique_id,
                        "specialty_count": 0,
                        "supported_specialty_count": 0,
                        "unsupported_specialties": None,
                        "orphan_claim_terms": None,
                        "rule_status": "skipped",
                        "rule_score": None,
                        "consistency_status": "skipped",
                        "consistency_score": None,
                        "consistency_provider": "none",
                        "consistency_summary": str(exc),
                        "mismatch_flags": None,
                        "checked_at": checked_at,
                    }

                checkpoint[unique_id] = result
                append_checkpoint(result)
                done_this_run += 1
                if done_this_run % 50 == 0 or done_this_run == len(pending):
                    print(f"  {already_done + done_this_run}/{total} complete", flush=True)

    rows = sorted(checkpoint.values(), key=lambda item: item["unique_id"])
    write_csv(rows)
    if not args.skip_upload:
        upload_rows(args.profile, rows)
        print("Upload complete.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
