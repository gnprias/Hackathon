import { z } from 'zod';
import { Application } from 'express';
import { ensureLakebaseTable } from './lakebase-setup';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const SETUP_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS app`;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app.deactivated_facilities (
    unique_id TEXT PRIMARY KEY,
    reason TEXT,
    deactivated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_by TEXT
  )
`;

const DeactivateBody = z.object({
  uniqueId: z.string().min(1),
  reason: z.string().max(500).optional(),
  deactivatedBy: z.string().max(200).optional(),
});

function mapRow(row: Record<string, unknown>) {
  const uniqueId =
    typeof row.unique_id === 'string'
      ? row.unique_id
      : typeof row.unique_id === 'number'
        ? String(row.unique_id)
        : '';
  return {
    uniqueId,
    reason: typeof row.reason === 'string' ? row.reason : null,
    deactivatedAt:
      typeof row.deactivated_at === 'string'
        ? row.deactivated_at
        : row.deactivated_at instanceof Date
          ? row.deactivated_at.toISOString()
          : '',
    deactivatedBy: typeof row.deactivated_by === 'string' ? row.deactivated_by : null,
  };
}

export async function setupDeactivationRoutes(appkit: AppKitWithLakebase) {
  await ensureLakebaseTable(appkit.lakebase, {
    schema: 'app',
    table: 'deactivated_facilities',
    createSchemaSql: SETUP_SCHEMA_SQL,
    createTableSql: CREATE_TABLE_SQL,
  });

  appkit.server.extend((app) => {
    app.get('/api/lakebase/deactivated-facilities', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT unique_id, reason, deactivated_at, deactivated_by
           FROM app.deactivated_facilities
           ORDER BY deactivated_at DESC`,
        );
        res.json(result.rows.map(mapRow));
      } catch (err) {
        console.error('[lakebase] Failed to list deactivated facilities (returning empty list):', err);
        res.json([]);
      }
    });

    app.get('/api/lakebase/deactivated-facilities/:uniqueId', async (req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT unique_id, reason, deactivated_at, deactivated_by
           FROM app.deactivated_facilities
           WHERE unique_id = $1`,
          [req.params.uniqueId],
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Not deactivated' });
          return;
        }
        res.json(mapRow(result.rows[0]));
      } catch (err) {
        console.error('Failed to fetch deactivation:', err);
        res.status(500).json({ error: 'Failed to fetch deactivation' });
      }
    });

    app.post('/api/lakebase/deactivated-facilities', async (req, res) => {
      const parsed = DeactivateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'uniqueId is required' });
        return;
      }

      try {
        const result = await appkit.lakebase.query(
          `INSERT INTO app.deactivated_facilities (unique_id, reason, deactivated_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (unique_id) DO UPDATE
             SET reason = EXCLUDED.reason,
                 deactivated_by = EXCLUDED.deactivated_by,
                 deactivated_at = NOW()
           RETURNING unique_id, reason, deactivated_at, deactivated_by`,
          [
            parsed.data.uniqueId.trim(),
            parsed.data.reason?.trim() || null,
            parsed.data.deactivatedBy?.trim() || null,
          ],
        );
        res.status(201).json(mapRow(result.rows[0]));
      } catch (err) {
        console.error('Failed to deactivate facility:', err);
        res.status(500).json({ error: 'Failed to deactivate facility' });
      }
    });

    app.delete('/api/lakebase/deactivated-facilities/:uniqueId', async (req, res) => {
      try {
        const result = await appkit.lakebase.query(
          'DELETE FROM app.deactivated_facilities WHERE unique_id = $1 RETURNING unique_id',
          [req.params.uniqueId],
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Not deactivated' });
          return;
        }
        res.status(204).send();
      } catch (err) {
        console.error('Failed to reactivate facility:', err);
        res.status(500).json({ error: 'Failed to reactivate facility' });
      }
    });
  });
}
