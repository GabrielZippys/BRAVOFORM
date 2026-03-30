/**
 * Executa migração SQL no PostgreSQL via Node.js (pg)
 * Uso: node scripts/run-migration.js scripts/sql/001_create_star_schema.sql
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Uso: node scripts/run-migration.js <arquivo.sql>');
  process.exit(1);
}

const pool = new Pool({
  host: '34.39.165.146',
  port: 5432,
  database: 'formbravo-8854e-database',
  user: 'ipanema',
  password: 'Br@v0x00',
  ssl: false,
  connectionTimeoutMillis: 30000,
  statement_timeout: 120000,
});

async function run() {
  const sql = fs.readFileSync(path.resolve(sqlFile), 'utf-8');
  const client = await pool.connect();
  try {
    console.log(`Executando: ${sqlFile}`);
    await client.query(sql);
    console.log('Migração concluída com sucesso!');
  } catch (err) {
    console.error('Erro na migração:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
