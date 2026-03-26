import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const results: any = {
    timestamp: new Date().toISOString(),
    vercelRegion: process.env.VERCEL_REGION || 'unknown',
    deploymentUrl: process.env.VERCEL_URL || 'unknown',
    test: 'Vercel IP Detection via PostgreSQL Connection Attempt'
  };

  // Tenta conectar ao PostgreSQL - isso vai gerar uma tentativa de conexão
  // O Cloud SQL vai registrar o IP do Vercel nesta tentativa
  try {
    const pool = getPool();
    const client = await pool.connect();
    
    results.connectionStatus = 'success';
    results.connectionTime = `${Date.now() - startTime}ms`;
    
    // Se conectar, pega informações do servidor
    const serverInfo = await client.query('SELECT version(), inet_server_addr()');
    results.serverInfo = {
      version: serverInfo.rows[0].version.split(',')[0],
      serverIP: serverInfo.rows[0].inet_server_addr
    };
    
    client.release();
    
  } catch (error: any) {
    results.connectionStatus = 'failed';
    results.error = error.message;
    results.errorCode = error.code || 'unknown';
    
    // Se for timeout, o IP foi registrado no Cloud SQL
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      results.message = 'TIMEOUT ERROR - Check Cloud SQL logs for Vercel IP';
      results.action = '1. Go to Cloud SQL Console > Logs';
      results.action += '2. Look for recent connection timeout errors';
      results.action += '3. The IP address will be in the error message';
    }
  }

  results.totalTime = `${Date.now() - startTime}ms`;
  
  return NextResponse.json(results);
}
