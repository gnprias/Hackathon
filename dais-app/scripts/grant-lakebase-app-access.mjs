/**
 * One-off ops script: grant the deployed app's service principal access to the
 * `app` schema when tables were created by a developer identity first.
 *
 * Usage (from dais-app/):
 *   node scripts/grant-lakebase-app-access.mjs
 */
import pg from 'pg';
import { execSync } from 'node:child_process';

const PROFILE = 'dbc-69c2f85e-61ee';
const ENDPOINT = 'projects/hackathon-app/branches/production/endpoints/primary';
const SP_CLIENT_ID = '486a74ba-1ba7-48fc-96cd-277f61a83170';
const DATABRICKS =
  process.env.DATABRICKS_CLI ??
  'C:\\Users\\gnpri\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\\databricks.exe';

function databricksJson(args) {
  const out = execSync(`"${DATABRICKS}" ${args} --profile ${PROFILE} -o json`, {
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

const endpoint = databricksJson(`postgres get-endpoint ${ENDPOINT}`);
const credential = databricksJson(`postgres generate-database-credential ${ENDPOINT}`);
const host = endpoint.status.hosts.host;
const token = credential.token;

const client = new pg.Client({
  host,
  user: 'gnp26@cornell.edu',
  password: token,
  database: 'databricks_postgres',
  ssl: { rejectUnauthorized: true },
});

const grantSql = `
GRANT USAGE ON SCHEMA app TO "${SP_CLIENT_ID}";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO "${SP_CLIENT_ID}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO "${SP_CLIENT_ID}";
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${SP_CLIENT_ID}";
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO "${SP_CLIENT_ID}";
`;

const ownershipSql = `
ALTER SCHEMA app OWNER TO "${SP_CLIENT_ID}";
ALTER TABLE IF EXISTS app.todos OWNER TO "${SP_CLIENT_ID}";
ALTER TABLE IF EXISTS app.deactivated_facilities OWNER TO "${SP_CLIENT_ID}";
ALTER TABLE IF EXISTS app.facility_imr_doctors OWNER TO "${SP_CLIENT_ID}";
`;

try {
  await client.connect();
  console.log('Connected to Lakebase as project owner');

  const before = await client.query(
    `SELECT unique_id, count(*)::int AS n
     FROM app.facility_imr_doctors
     GROUP BY unique_id
     ORDER BY n DESC
     LIMIT 10`,
  );
  console.log('facility_imr_doctors rows by facility:', before.rows);

  await client.query(grantSql);
  console.log('Granted DML on app schema to app service principal');

  try {
    await client.query(ownershipSql);
    console.log('Transferred app schema/table ownership to app service principal');
  } catch (err) {
    console.warn('Ownership transfer skipped:', err.message);
  }

  const verma = await client.query(
    `SELECT id, unique_id, registration_number, first_name, last_name
     FROM app.facility_imr_doctors
     WHERE unique_id = $1
     ORDER BY looked_up_at DESC`,
    ['6bc229d9-a07f-45f0-a16d-111395b5bfed'],
  );
  console.log('Dr Verma saved doctors:', verma.rows);
} finally {
  await client.end();
}
