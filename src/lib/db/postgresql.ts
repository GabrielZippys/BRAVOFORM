import { Pool, PoolConfig } from 'pg';

const poolConfig: PoolConfig = {
  host: process.env.PG_HOST || '34.39.165.146',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'formbravo-8854e-database',
  user: process.env.PG_USER || 'ipanema',
  password: process.env.PG_PASSWORD || 'Br@v0x00',
  
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  
  max: parseInt(process.env.PG_POOL_MAX || '3'),
  min: parseInt(process.env.PG_POOL_MIN || '0'),
  
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '10000'),
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '60000'),
  
  statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT || '60000'),
  query_timeout: parseInt(process.env.PG_QUERY_TIMEOUT || '60000'),
  
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function executeQuery<T = any>(
  queryText: string,
  params?: any[]
): Promise<T[]> {
  const pool = getPool();
  let lastError: any;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(queryText, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Query attempt ${attempt}/3 failed:`, error.message);
      
      if (attempt < 3) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

export async function executeTransaction<T = any>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const pool = getPool();
  let lastError: any;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error: any) {
      lastError = error;
      if (client) {
        await client.query('ROLLBACK').catch(() => {});
      }
      console.error(`❌ Transaction attempt ${attempt}/3 failed:`, error.message);
      
      if (attempt < 3) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Retrying transaction in ${delay}ms...`);
        await sleep(delay);
      }
    } finally {
      if (client) {
        client.release();
      }
    }
  }
  
  throw lastError;
}
