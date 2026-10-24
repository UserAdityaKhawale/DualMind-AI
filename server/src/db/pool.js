import pg from 'pg';

const { Pool } = pg;

export function createDatabasePool(config) {
  if (!config.DATABASE_URL) return null;
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
  pool.on('error', (error) => console.error('PostgreSQL pool error', error.code ?? 'UNKNOWN'));
  return pool;
}
