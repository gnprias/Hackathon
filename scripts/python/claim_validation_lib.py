"""Rule-based specialty vs procedure/capability consistency checks."""

from __future__ import annotations

import json
import re
from typing import Any

MISSING_VALUES = {"", "null", "none", "n/a", "na", "undefined", "[]"}

# Canonical specialty key (substring match) -> needles expected in claims text.
SPECIALTY_CLAIM_NEEDLES: dict[str, list[str]] = {
    "cardiology": ["cardiac", "heart", "cardio", "angioplasty", "echocardiography", "pacemaker"],
    "cardiac": ["cardiac", "heart", "cardio", "angioplasty"],
    "gynecology": ["gynec", "gynaec", "obstetric", "maternity", "prenatal", "labour", "labor", "ivf"],
    "obstetrics": ["obstetric", "maternity", "delivery", "cesarean", "caesarean", "c section", "labour"],
    "orthopedic": ["orthopedic", "orthopaedic", "fracture", "joint replacement", "arthroscopy", "spine"],
    "neurology": ["neuro", "stroke", "epilepsy", "brain"],
    "neurosurgery": ["neuro", "brain", "spine", "craniotomy"],
    "oncology": ["cancer", "oncology", "chemotherapy", "chemo", "radiation", "tumor", "tumour"],
    "radiology": ["radiology", "mri", "ct scan", "computed tomography", "x ray", "xray", "ultrasound"],
    "urology": ["urolog", "kidney", "dialysis", "prostate", "urinary"],
    "nephrology": ["nephro", "kidney", "dialysis", "renal"],
    "dermatology": ["dermat", "skin"],
    "ophthalmology": ["ophthalm", "eye", "cataract", "retina"],
    "ent": ["ent", "ear nose throat", "otolaryngology"],
    "pediatric": ["pediatric", "paediatric", "child", "neonatal", "nicu"],
    "psychiatry": ["psychiatr", "mental health", "depression", "psychology"],
    "dental": ["dental", "dentist", "orthodont"],
    "general surgery": ["surgery", "surgical", "laparoscopic", "appendectomy"],
    "general medicine": ["medicine", "physician", "internal medicine", "fever", "diabetes"],
    "pulmonology": ["pulmon", "respiratory", "asthma", "copd", "ventilator"],
    "gastroenterology": ["gastro", "endoscopy", "colonoscopy", "liver", "hepat"],
    "anesthesiology": ["anesth", "anaesth"],
    "pathology": ["pathology", "histopathology", "biopsy"],
    "plastic": ["plastic surgery", "reconstructive", "cosmetic"],
}

# Claim-family needles -> specialty families that would justify them.
ORPHAN_CLAIM_FAMILIES: list[tuple[str, list[str], list[str]]] = [
    ("mri", ["mri", "magnetic resonance"], ["radiology", "diagnostic"]),
    ("ct scan", ["ct scan", "computed tomography"], ["radiology", "diagnostic"]),
    ("dialysis", ["dialysis"], ["nephrology", "urology", "renal"]),
    ("chemotherapy", ["chemotherapy", "chemo"], ["oncology", "cancer"]),
    ("ivf", ["ivf", "in vitro"], ["gynecology", "obstetrics", "fertility"]),
    ("cardiac surgery", ["cardiac surgery", "bypass", "angioplasty"], ["cardiology", "cardiac", "cardiovascular"]),
    ("joint replacement", ["joint replacement", "knee replacement", "hip replacement"], ["orthopedic", "orthopaedic"]),
]


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in MISSING_VALUES:
        return None
    return text or None


def parse_json_string_list(value: Any) -> list[str]:
    text = clean_text(value)
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [part.strip() for part in re.split(r"[,;|]", text) if part.strip()]
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    if isinstance(parsed, str) and parsed.strip():
        return [parsed.strip()]
    return []


def normalize_key(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"[&/]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def canonicalize_specialty(raw: str) -> str:
    return normalize_key(raw)


def build_claims_text(*parts: Any) -> str:
    chunks: list[str] = []
    for part in parts:
        if part is None:
            continue
        if isinstance(part, list):
            chunks.extend(str(item) for item in part if str(item).strip())
        else:
            text = clean_text(part)
            if text:
                chunks.append(text)
    return " ".join(chunks).lower()


def needles_for_specialty(specialty_canonical: str) -> list[str]:
    needles: list[str] = []
    for key, mapped in SPECIALTY_CLAIM_NEEDLES.items():
        if key in specialty_canonical:
            needles.extend(mapped)
    if not needles:
        tokens = [token for token in specialty_canonical.split() if len(token) >= 4]
        needles.extend(tokens[:3] or [specialty_canonical])
    deduped: list[str] = []
    for needle in needles:
        needle = needle.strip().lower()
        if needle and needle not in deduped:
            deduped.append(needle)
    return deduped


def specialty_supported(specialty_canonical: str, claims_text: str) -> bool:
    if not specialty_canonical:
        return False
    if specialty_canonical in claims_text:
        return True
    return any(needle in claims_text for needle in needles_for_specialty(specialty_canonical))


def collect_specialties(row: dict[str, Any], gold_specialties: list[str] | None = None) -> list[str]:
    from_json = [canonicalize_specialty(item) for item in parse_json_string_list(row.get("specialties"))]
    from_gold = [canonicalize_specialty(item) for item in (gold_specialties or [])]
    merged: list[str] = []
    for value in [*from_json, *from_gold]:
        if value and value not in merged:
            merged.append(value)
    return merged


def find_orphan_claim_terms(specialties: list[str], claims_text: str) -> list[str]:
    if not claims_text.strip():
        return []
    orphans: list[str] = []
    specialty_blob = " ".join(specialties)
    for label, needles, families in ORPHAN_CLAIM_FAMILIES:
        if not any(needle in claims_text for needle in needles):
            continue
        if any(family in specialty_blob for family in families):
            continue
        orphans.append(label)
    return orphans


def evaluate_rule_consistency(
    *,
    specialties: list[str],
    claims_text: str,
) -> dict[str, Any]:
    specialty_count = len(specialties)
    if specialty_count == 0:
        return {
            "specialty_count": 0,
            "supported_specialty_count": 0,
            "unsupported_specialties": None,
            "orphan_claim_terms": None,
            "rule_status": "skipped",
            "rule_score": None,
            "mismatch_flags": None,
        }

    if not claims_text.strip():
        return {
            "specialty_count": specialty_count,
            "supported_specialty_count": 0,
            "unsupported_specialties": ",".join(specialties),
            "orphan_claim_terms": None,
            "rule_status": "skipped_no_claims",
            "rule_score": None,
            "mismatch_flags": "unsupported_specialties",
        }

    unsupported = [specialty for specialty in specialties if not specialty_supported(specialty, claims_text)]
    supported_count = specialty_count - len(unsupported)
    orphans = find_orphan_claim_terms(specialties, claims_text)
    rule_score = round(supported_count / specialty_count, 4)

    if supported_count == specialty_count and not orphans:
        rule_status = "ok"
    elif supported_count == 0:
        rule_status = "mismatch"
    else:
        rule_status = "weak"

    flags: list[str] = []
    if unsupported:
        flags.append("unsupported_specialties")
    if orphans:
        flags.append("orphan_claims")

    return {
        "specialty_count": specialty_count,
        "supported_specialty_count": supported_count,
        "unsupported_specialties": ",".join(unsupported) if unsupported else None,
        "orphan_claim_terms": ",".join(orphans) if orphans else None,
        "rule_status": rule_status,
        "rule_score": rule_score,
        "mismatch_flags": ",".join(flags) if flags else None,
    }


def merge_ai_result(
    rule_result: dict[str, Any],
    *,
    ai_score: float | None,
    ai_summary: str | None,
    provider: str,
) -> dict[str, Any]:
    merged = dict(rule_result)
    flags = [part for part in (merged.get("mismatch_flags") or "").split(",") if part]

    if ai_score is None:
        merged["consistency_status"] = "pending"
        merged["consistency_score"] = None
        merged["consistency_provider"] = provider
        merged["consistency_summary"] = ai_summary
        return merged

    if ai_score >= 0.75:
        consistency_status = "ok"
    elif ai_score >= 0.45:
        consistency_status = "weak"
    else:
        consistency_status = "mismatch"
        if "semantic_mismatch" not in flags:
            flags.append("semantic_mismatch")

    merged["consistency_status"] = consistency_status
    merged["consistency_score"] = round(ai_score, 4)
    merged["consistency_provider"] = provider
    merged["consistency_summary"] = ai_summary
    merged["mismatch_flags"] = ",".join(flags) if flags else None
    return merged


def rules_only_result(rule_result: dict[str, Any]) -> dict[str, Any]:
    summary = None
    status = rule_result["rule_status"]
    if status == "ok":
        summary = "All listed specialties have supporting procedure or capability keywords."
    elif status == "weak":
        summary = "Some specialties lack supporting procedure or capability keywords."
    elif status == "mismatch":
        summary = "Listed specialties are not supported by procedure or capability text."
    elif status == "skipped_no_claims":
        summary = "Specialties are listed but procedure/capability fields are empty."

    return merge_ai_result(
        rule_result,
        ai_score=rule_result.get("rule_score"),
        ai_summary=summary,
        provider="rules",
    )
