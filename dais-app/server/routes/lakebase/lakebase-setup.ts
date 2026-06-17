interface LakebaseQuery {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export async function ensureLakebaseTable(
  lakebase: LakebaseQuery,
  options: {
    schema: string;
    table: string;
    createSchemaSql: string;
    createTableSql: string;
    createIndexSql?: string;
  },
): Promise<void> {
  const qualified = `${options.schema}.${options.table}`;
  const existsSql = `SELECT to_regclass($1) IS NOT NULL AS exists`;

  try {
    const { rows } = await lakebase.query(existsSql, [qualified]);
    const exists = rows[0]?.exists === true;

    if (!exists) {
      await lakebase.query(options.createSchemaSql);
      await lakebase.query(options.createTableSql);
      if (options.createIndexSql) {
        await lakebase.query(options.createIndexSql);
      }
      console.log(`[lakebase] Created schema and table ${qualified}`);
    } else {
      console.log(`[lakebase] Table ${qualified} already exists, skipping DDL`);
      if (options.createIndexSql) {
        try {
          await lakebase.query(options.createIndexSql);
        } catch (err) {
          console.warn(
            `[lakebase] Index setup for ${qualified} skipped:`,
            (err as Error).message,
          );
        }
      }
    }

    await lakebase.query(`SELECT 1 FROM ${qualified} LIMIT 0`);
    console.log(`[lakebase] Verified read access to ${qualified}`);
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`[lakebase] Setup for ${qualified} failed:`, message);
    if (message.includes('permission denied') || message.includes('must be owner')) {
      console.warn(
        '[lakebase] Tables may have been created by a developer identity before the app was deployed.',
      );
      console.warn(
        '[lakebase] Run scripts/grant-lakebase-app-access.mjs as the Lakebase project owner, then redeploy.',
      );
    }
    console.warn('[lakebase] Routes will be registered but Lakebase queries may fail');
  }
}
