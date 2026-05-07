import { Pool, PoolConfig } from 'pg';

/**
 * ⚠️ Configuração calibrada para Vercel serverless + Postgres com max_connections limitado.
 *
 * Cada lambda da Vercel cria seu PRÓPRIO pool (não compartilha entre invocações).
 * Com N requests concorrentes, temos N pools ativos. Se cada pool tiver max=3,
 * estouramos rápido o limite do servidor (geralmente 100 conexões).
 *
 * Solução pragmática enquanto não migramos pra PgBouncer/Neon:
 *   • max = 1 → cada lambda usa 1 conexão por vez (perfeito pra serverless
 *     onde cada invocação tem 1 request principal)
 *   • idleTimeout = 5s → libera conexão rápido pro próximo lambda usar
 *   • keepAlive = false → não mantém conexão "viva" idle, devolve pro servidor
 *   • connectionTimeout = 5s → falha rápido em vez de travar 60s
 *
 * Override por env vars se em prod conseguirmos PgBouncer (aí pode subir pra 5).
 */
const poolConfig: PoolConfig = {
  host: process.env.PG_HOST || '34.39.165.146',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'formbravo-8854e-database',
  user: process.env.PG_USER || 'ipanema',
  password: process.env.PG_PASSWORD || 'Br@v0x00',

  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,

  max: parseInt(process.env.PG_POOL_MAX || '1'),
  min: parseInt(process.env.PG_POOL_MIN || '0'),

  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '5000'),
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '5000'),

  statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT || '30000'),
  query_timeout: parseInt(process.env.PG_QUERY_TIMEOUT || '30000'),

  keepAlive: false,
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
