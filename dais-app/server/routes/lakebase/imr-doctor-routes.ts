import { z } from 'zod';
import { Application } from 'express';
import type { AdditionalQualification } from '../../../shared/imr-doctor-record';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const TABLE_EXISTS_SQL = `
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'app' AND table_name = 'facility_imr_doctors'
`;

const SETUP_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS app`;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app.facility_imr_doctors (
    id SERIAL PRIMARY KEY,
    unique_id TEXT NOT NULL,
    doctor_id TEXT,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    year_of_registration INTEGER,
    registration_number TEXT NOT NULL,
    smc_id INTEGER NOT NULL,
    smc_name TEXT,
    qualification TEXT,
    qualification_year INTEGER,
    additional_qualifications JSONB NOT NULL DEFAULT '[]'::jsonb,
    blacklisted BOOLEAN NOT NULL DEFAULT false,
    looked_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unique_id, registration_number, smc_id)
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_facility_imr_doctors_unique_id
  ON app.facility_imr_doctors (unique_id)
`;

const SaveDoctorBody = z.object({
  doctorId: z.string().max(64).optional(),
  firstName: z.string().max(128).optional(),
  lastName: z.string().max(128).optional(),
  doctorName: z.string().max(256).optional(),
  yearOfRegistration: z.number().int().min(1800).max(2100).nullable().optional(),
  registrationNumber: z.string().min(1).max(32),
  smcId: z.number().int().positive(),
  smcName: z.string().max(256).optional(),
  qualification: z.string().max(256).nullable().optional(),
  qualificationYear: z.number().int().min(1800).max(2100).nullable().optional(),
  additionalQualifications: z
    .array(
      z.object({
        qualification: z.string().min(1).max(256),
        year: z.number().int().min(1800).max(2100).nullable().optional(),
      }),
    )
    .optional(),
  blacklisted: z.boolean().optional(),
  lookedUpAt: z.string().datetime().optional(),
});

function parseAdditionalQualificationsJson(value: unknown): AdditionalQualification[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (entry == null || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const qualification =
        typeof record.qualification === 'string' ? record.qualification.trim() : '';
      if (!qualification) return null;
      const year =
        typeof record.year === 'number' && Number.isFinite(record.year) ? record.year : null;
      return { qualification, year };
    })
    .filter((entry): entry is AdditionalQualification => entry != null);
}

function mapRow(row: Record<string, unknown>) {
  const id = typeof row.id === 'number' ? row.id : Number.parseInt(String(row.id ?? ''), 10);
  const smcId =
    typeof row.smc_id === 'number' ? row.smc_id : Number.parseInt(String(row.smc_id ?? ''), 10);

  return {
    id,
    uniqueId: typeof row.unique_id === 'string' ? row.unique_id : String(row.unique_id ?? ''),
    doctorId: typeof row.doctor_id === 'string' ? row.doctor_id : null,
    firstName: typeof row.first_name === 'string' ? row.first_name : '',
    lastName: typeof row.last_name === 'string' ? row.last_name : '',
    yearOfRegistration:
      typeof row.year_of_registration === 'number' ? row.year_of_registration : null,
    registrationNumber:
      typeof row.registration_number === 'string' ? row.registration_number : '',
    smcId: Number.isFinite(smcId) ? smcId : 0,
    smcName: typeof row.smc_name === 'string' ? row.smc_name : '',
    qualification: typeof row.qualification === 'string' ? row.qualification : null,
    qualificationYear:
      typeof row.qualification_year === 'number' ? row.qualification_year : null,
    additionalQualifications: parseAdditionalQualificationsJson(row.additional_qualifications),
    blacklisted: row.blacklisted === true,
    lookedUpAt:
      typeof row.looked_up_at === 'string'
        ? row.looked_up_at
        : row.looked_up_at instanceof Date
          ? row.looked_up_at.toISOString()
          : '',
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : row.created_at instanceof Date
          ? row.created_at.toISOString()
          : '',
  };
}

export async function setupImrDoctorRoutes(appkit: AppKitWithLakebase) {
  try {
    const { rows } = await appkit.lakebase.query(TABLE_EXISTS_SQL);
    if (rows.length > 0) {
      console.log('[lakebase] Table app.facility_imr_doctors already exists, skipping setup');
    } else {
      await appkit.lakebase.query(SETUP_SCHEMA_SQL);
      await appkit.lakebase.query(CREATE_TABLE_SQL);
      await appkit.lakebase.query(CREATE_INDEX_SQL);
      console.log('[lakebase] Created schema and table app.facility_imr_doctors');
    }
  } catch (err) {
    console.warn('[lakebase] IMR doctor table setup failed:', (err as Error).message);
    console.warn('[lakebase] IMR doctor routes will be registered but may return errors');
  }

  appkit.server.extend((app) => {
    app.get('/api/lakebase/facilities/:uniqueId/imr-doctors', async (req, res) => {
      const uniqueId = req.params.uniqueId?.trim();
      if (!uniqueId) {
        res.status(400).json({ error: 'uniqueId is required' });
        return;
      }

      try {
        const result = await appkit.lakebase.query(
          `SELECT id, unique_id, doctor_id, first_name, last_name, year_of_registration,
                  registration_number, smc_id, smc_name, qualification, qualification_year,
                  additional_qualifications, blacklisted, looked_up_at, created_at
           FROM app.facility_imr_doctors
           WHERE unique_id = $1
           ORDER BY looked_up_at DESC, created_at DESC`,
          [uniqueId],
        );
        res.json(result.rows.map(mapRow));
      } catch (err) {
        console.error('[lakebase] Failed to list facility IMR doctors (returning empty list):', err);
        res.json([]);
      }
    });

    app.post('/api/lakebase/facilities/:uniqueId/imr-doctors', async (req, res) => {
      const uniqueId = req.params.uniqueId?.trim();
      if (!uniqueId) {
        res.status(400).json({ error: 'uniqueId is required' });
        return;
      }

      const parsed = SaveDoctorBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid doctor payload' });
        return;
      }

      const firstName =
        parsed.data.firstName?.trim() ||
        (parsed.data.doctorName?.trim().split(/\s+/)[0] ?? '');
      const lastName =
        parsed.data.lastName?.trim() ||
        (parsed.data.doctorName?.trim().split(/\s+/).slice(1).join(' ') ?? '');

      const additionalQualifications = parsed.data.additionalQualifications ?? [];

      try {
        const result = await appkit.lakebase.query(
          `INSERT INTO app.facility_imr_doctors (
             unique_id, doctor_id, first_name, last_name, year_of_registration,
             registration_number, smc_id, smc_name, qualification, qualification_year,
             additional_qualifications, blacklisted, looked_up_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, COALESCE($13::timestamptz, NOW()))
           ON CONFLICT (unique_id, registration_number, smc_id) DO UPDATE
             SET doctor_id = EXCLUDED.doctor_id,
                 first_name = EXCLUDED.first_name,
                 last_name = EXCLUDED.last_name,
                 year_of_registration = EXCLUDED.year_of_registration,
                 smc_name = EXCLUDED.smc_name,
                 qualification = EXCLUDED.qualification,
                 qualification_year = EXCLUDED.qualification_year,
                 additional_qualifications = EXCLUDED.additional_qualifications,
                 blacklisted = EXCLUDED.blacklisted,
                 looked_up_at = EXCLUDED.looked_up_at
           RETURNING id, unique_id, doctor_id, first_name, last_name, year_of_registration,
                     registration_number, smc_id, smc_name, qualification, qualification_year,
                     additional_qualifications, blacklisted, looked_up_at, created_at`,
          [
            uniqueId,
            parsed.data.doctorId?.trim() || null,
            firstName,
            lastName,
            parsed.data.yearOfRegistration ?? null,
            parsed.data.registrationNumber.trim(),
            parsed.data.smcId,
            parsed.data.smcName?.trim() || null,
            parsed.data.qualification?.trim() || null,
            parsed.data.qualificationYear ?? null,
            JSON.stringify(additionalQualifications),
            parsed.data.blacklisted ?? false,
            parsed.data.lookedUpAt ?? null,
          ],
        );

        res.status(200).json(mapRow(result.rows[0]));
      } catch (err) {
        console.error('Failed to save facility IMR doctor:', err);
        res.status(500).json({ error: 'Failed to save facility IMR doctor' });
      }
    });

    app.delete('/api/lakebase/facilities/:uniqueId/imr-doctors/:id', async (req, res) => {
      const uniqueId = req.params.uniqueId?.trim();
      const id = Number.parseInt(req.params.id, 10);
      if (!uniqueId || Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid facility or doctor id' });
        return;
      }

      try {
        const result = await appkit.lakebase.query(
          'DELETE FROM app.facility_imr_doctors WHERE unique_id = $1 AND id = $2 RETURNING id',
          [uniqueId, id],
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Doctor record not found' });
          return;
        }
        res.status(204).send();
      } catch (err) {
        console.error('Failed to delete facility IMR doctor:', err);
        res.status(500).json({ error: 'Failed to delete facility IMR doctor' });
      }
    });
  });
}
