import pytest

from claim_validation_lib import (
    build_claims_text,
    collect_specialties,
    evaluate_rule_consistency,
    rules_only_result,
)


def test_supported_cardiology_specialty():
    row = {
        "specialties": '["cardiology"]',
        "procedure": '["angioplasty", "echocardiography"]',
        "equipment": "[]",
        "capability": "[]",
    }
    specialties = collect_specialties(row)
    claims = build_claims_text(row["procedure"], row["equipment"], row["capability"])
    result = rules_only_result(evaluate_rule_consistency(specialties=specialties, claims_text=claims))

    assert result["rule_status"] == "ok"
    assert result["rule_score"] == 1.0
    assert result["unsupported_specialties"] is None


def test_mismatch_when_specialty_not_in_claims():
    row = {
        "specialties": '["cardiology"]',
        "procedure": '["dental cleaning"]',
        "equipment": "[]",
        "capability": "[]",
    }
    specialties = collect_specialties(row)
    claims = build_claims_text(row["procedure"], row["equipment"], row["capability"])
    result = rules_only_result(evaluate_rule_consistency(specialties=specialties, claims_text=claims))

    assert result["rule_status"] == "mismatch"
    assert result["unsupported_specialties"] == "cardiology"
    assert "unsupported_specialties" in (result["mismatch_flags"] or "")


def test_specialties_only_do_not_self_support():
    row = {
        "specialties": '["cardiology"]',
        "procedure": "[]",
        "equipment": "[]",
        "capability": "[]",
    }
    specialties = collect_specialties(row)
    claims = build_claims_text(row["procedure"], row["equipment"], row["capability"])
    result = rules_only_result(evaluate_rule_consistency(specialties=specialties, claims_text=claims))

    assert result["rule_status"] == "skipped_no_claims"
    assert result["rule_score"] is None


def test_orphan_mri_claim_without_radiology_specialty():
    row = {
        "specialties": '["gynecology and obstetrics"]',
        "procedure": '["mri scan"]',
        "equipment": "[]",
        "capability": "[]",
    }
    specialties = collect_specialties(row)
    claims = build_claims_text(row["procedure"], row["equipment"], row["capability"])
    result = evaluate_rule_consistency(specialties=specialties, claims_text=claims)

    assert result["orphan_claim_terms"] == "mri"
