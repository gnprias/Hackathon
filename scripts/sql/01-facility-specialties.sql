-- Phase 1: Normalize facility specialties (one row per unique_id + specialty)
-- Source: Virtue Foundation marketplace catalog (read-only)
-- Target: workspace.gold (writable managed catalog)
--
-- Run as two separate CLI calls (one SQL statement each):
--   databricks experimental aitools tools query --profile dbc-69c2f85e-61ee --file 01-facility-specialties.sql
--   databricks experimental aitools tools query --profile dbc-69c2f85e-61ee --file 01b-facility-specialties-table.sql

CREATE SCHEMA IF NOT EXISTS workspace.gold
COMMENT 'Derived tables for the DAIS 2026 hackathon app';
