CREATE OR REPLACE TABLE workspace.gold.facility_claim_validation (
  unique_id STRING NOT NULL COMMENT 'Facility primary key',
  specialty_count INT COMMENT 'Distinct canonical specialties on record',
  supported_specialty_count INT COMMENT 'Specialties with keyword support in procedure/equipment/capability',
  unsupported_specialties STRING COMMENT 'Comma-separated specialty_canonical values without supporting claim text',
  orphan_claim_terms STRING COMMENT 'Procedure/capability terms without a matching specialty family',
  rule_status STRING COMMENT 'ok | weak | mismatch | skipped | skipped_no_claims',
  rule_score DOUBLE COMMENT 'Fraction of specialties with supporting claim keywords (0-1)',
  consistency_status STRING COMMENT 'ok | weak | mismatch | skipped | pending',
  consistency_score DOUBLE COMMENT 'Semantic consistency score from AI when run (0-1)',
  consistency_provider STRING COMMENT 'rules | openai | none',
  consistency_summary STRING COMMENT 'Short human-readable consistency note',
  mismatch_flags STRING COMMENT 'Comma-separated: unsupported_specialties, orphan_claims, semantic_mismatch',
  checked_at TIMESTAMP NOT NULL COMMENT 'When this row was last validated'
)
COMMENT 'Rule-based and optional AI checks that facility specialties align with procedure/capability claims';
