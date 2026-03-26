import { Pool, PoolConfig } from 'pg';

const poolConfig: PoolConfig = {
  host: process.env.PG_HOST || '34.39.165.146',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'formbravo-8854e-database',
  user: process.env.PG_USER || 'ipanema',
  password: process.env.PG_PASSWORD || 'Br@v0x00',
  
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  
  max: parseInt(process.env.PG_POOL_MAX || '5'),
  min: parseInt(process.env.PG_POOL_MIN || '0'),
  
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '10000'),
  
  statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT || '30000'),
  query_timeout: parseInt(process.env.PG_QUERY_TIMEOUT || '30000'),
  
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(poolConfig);
    
    pool.on('error', (err) => {
      console.error('❌ PostgreSQL pool error:', err.message);
    });
    
    pool.on('connect', () => {
      console.log('✅ PostgreSQL client connected');
    });
    
    pool.on('remove', () => {
      console.log('🔌 PostgreSQL client removed from pool');
    });
  }
  
  return pool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connection test successful');
    return true;
  } catch (error: any) {
    console.error('❌ PostgreSQL connection test failed:', error.message);
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔌 PostgreSQL pool closed');
  }
}

export async function executeQuery<T = any>(
  queryText: string,
  params?: any[]
): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(queryText, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function executeTransaction<T = any>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
