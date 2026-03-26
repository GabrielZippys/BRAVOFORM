import { NextRequest, NextResponse } from 'next/server';
import { getPool, testConnection } from '@/lib/db/postgresql';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      const connectionTime = Date.now() - startTime;
      
      const versionResult = await client.query('SELECT version()');
      const timeResult = await client.query('SELECT NOW() as server_time');
      
      const tablesResult = await client.query(`
        SELECT table_name, 
               (SELECT COUNT(*) FROM information_schema.columns 
                WHERE table_name = t.table_name AND table_schema = 'public') as column_count
        FROM information_schema.tables t
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      const counts = await Promise.all(
        tablesResult.rows.map(async (table) => {
          const result = await client.query(`SELECT COUNT(*) FROM ${table.table_name}`);
          return {
            table: table.table_name,
            count: parseInt(result.rows[0].count),
            columns: table.column_count
          };
        })
      );
      
      const totalRecords = counts.reduce((sum, t) => sum + t.count, 0);
      const queryTime = Date.now() - startTime;
      
      return NextResponse.json({
        success: true,
        message: '✅ PostgreSQL connection successful',
        connection: {
          host: process.env.PG_HOST || '34.39.165.146',
          database: process.env.PG_DATABASE || 'formbravo-8854e-database',
          user: process.env.PG_USER || 'ipanema',
          ssl: process.env.PG_SSL === 'true',
          connectionTime: `${connectionTime}ms`,
          queryTime: `${queryTime}ms`
        },
        database: {
          version: versionResult.rows[0].version,
          serverTime: timeResult.rows[0].server_time,
          tables: counts,
          totalTables: counts.length,
          totalRecords: totalRecords
        },
        pool: {
          max: parseInt(process.env.PG_POOL_MAX || '5'),
          min: parseInt(process.env.PG_POOL_MIN || '0'),
          idleTimeout: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
          connectionTimeout: parseInt(process.env.PG_CONNECTION_TIMEOUT || '10000')
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error: any) {
    const errorTime = Date.now() - startTime;
    
    console.error('❌ PostgreSQL connection test failed:', error);
    
    return NextResponse.json(
      { 
        success: false,
        message: '❌ PostgreSQL connection failed',
        error: error.message,
        code: error.code,
        errorTime: `${errorTime}ms`,
        config: {
          host: process.env.PG_HOST || '34.39.165.146',
          port: process.env.PG_PORT || '5432',
          database: process.env.PG_DATABASE || 'formbravo-8854e-database',
          ssl: process.env.PG_SSL === 'true'
        },
        troubleshooting: (() => {
          const messages: Record<string, string> = {
            ETIMEDOUT: 'Check if Cloud SQL allows connections from this IP. Configure authorized networks in Google Cloud Console.',
            ECONNREFUSED: 'Check if PG_HOST and PG_PORT are correct.',
            'password authentication failed': 'Check PG_USER and PG_PASSWORD environment variables.',
            'database does not exist': 'Check PG_DATABASE environment variable.'
          };
          return messages[error.code] || 'Check PostgreSQL configuration and network access.';
        })()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
