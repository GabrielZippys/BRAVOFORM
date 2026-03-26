import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    tests: []
  };

  // Test 1: Configurações
  results.tests.push({
    name: 'Configurações',
    status: 'info',
    details: {
      PG_HOST: process.env.PG_HOST || 'not_set',
      PG_PORT: process.env.PG_PORT || '5432',
      PG_DATABASE: process.env.PG_DATABASE || 'not_set',
      PG_USER: process.env.PG_USER || 'not_set',
      PG_SSL: process.env.PG_SSL || 'false',
      PG_POOL_MAX: process.env.PG_POOL_MAX || '3',
      PG_CONNECTION_TIMEOUT: process.env.PG_CONNECTION_TIMEOUT || '60000',
      PG_STATEMENT_TIMEOUT: process.env.PG_STATEMENT_TIMEOUT || '60000',
      PG_QUERY_TIMEOUT: process.env.PG_QUERY_TIMEOUT || '60000',
    }
  });

  // Test 2: Conexão básica
  try {
    const pool = getPool();
    const client = await pool.connect();
    const connectionTime = Date.now() - startTime;
    
    results.tests.push({
      name: 'Conexão PostgreSQL',
      status: 'success',
      details: {
        connectionTime: `${connectionTime}ms`,
        message: 'Conectado com sucesso'
      }
    });

    // Test 3: Query simples
    const queryStart = Date.now();
    const result = await client.query('SELECT 1 as test, NOW() as timestamp');
    const queryTime = Date.now() - queryStart;
    
    results.tests.push({
      name: 'Query Test',
      status: 'success',
      details: {
        queryTime: `${queryTime}ms`,
        result: result.rows[0]
      }
    });

    // Test 4: Verificar tabelas
    const tablesStart = Date.now();
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    const tablesTime = Date.now() - tablesStart;
    
    results.tests.push({
      name: 'Listar Tabelas',
      status: 'success',
      details: {
        queryTime: `${tablesTime}ms`,
        tableCount: tablesResult.rows.length,
        tables: tablesResult.rows.map(r => r.table_name)
      }
    });

    // Test 5: Contar produtos
    try {
      const productsStart = Date.now();
      const productsResult = await client.query('SELECT COUNT(*) as count FROM products');
      const productsTime = Date.now() - productsStart;
      
      results.tests.push({
        name: 'Contar Products',
        status: 'success',
        details: {
          queryTime: `${productsTime}ms`,
          productCount: parseInt(productsResult.rows[0].count)
        }
      });
    } catch (e: any) {
      results.tests.push({
        name: 'Contar Products',
        status: 'error',
        details: {
          error: e.message
        }
      });
    }

    client.release();
    
    results.status = 'success';
    results.totalTime = `${Date.now() - startTime}ms`;
    
  } catch (error: any) {
    results.tests.push({
      name: 'Conexão PostgreSQL',
      status: 'error',
      details: {
        error: error.message,
        code: error.code || 'unknown',
        severity: error.severity || 'ERROR'
      }
    });
    
    results.status = 'error';
    results.totalTime = `${Date.now() - startTime}ms`;
    
    // Adicionar sugestões baseadas no erro
    if (error.message.includes('timeout')) {
      results.suggestions = [
        'Verifique se os IPs do Vercel estão autorizados no Cloud SQL',
        'Aumente PG_CONNECTION_TIMEOUT para 120000 (2 minutos)',
        'Verifique se a instância Cloud SQL está ativa',
        'Considere usar Cloud SQL Auth Proxy'
      ];
    }
    
    if (error.message.includes('authentication')) {
      results.suggestions = [
        'Verifique PG_USER e PG_PASSWORD',
        'Confirme que o usuário tem permissão de acesso',
        'Verifique se a database existe'
      ];
    }
  }

  return NextResponse.json(results);
}
