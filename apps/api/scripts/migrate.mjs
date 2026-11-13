// Applies db/migrations/*.sql in filename order, once each, in a transaction.
// Hand-written SQL is the source of truth; this runner is deliberately dumb.
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dir = join(root, 'db', 'migrations');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name        text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`);

const applied = new Set(
  (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
);

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
let count = 0;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip   ${file}`);
    continue;
  }
  const sql = await readFile(join(dir, file), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`apply  ${file}`);
    count += 1;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`FAILED ${file}\n${err.message}`);
    process.exitCode = 1;
    break;
  }
}

console.log(`done, ${count} applied`);
await client.end();
