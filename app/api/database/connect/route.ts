import { NextRequest, NextResponse } from 'next/server';

interface DatabaseConfig {
  dbType: 'mysql' | 'postgresql' | 'sqlserver';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  connectionTimeout?: number;
}

async function testMySQLConnection(config: DatabaseConfig): Promise<boolean> {
  try {
    // Implementação MySQL real
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectTimeout: config.connectionTimeout || 10000
    });

    await connection.ping();
    await connection.end();
    return true;
  } catch (error: any) {
    console.error('MySQL connection error:', error);
    // Lançar erro com detalhes para ser capturado
    throw new Error(error.message || error.code || 'Erro desconhecido ao conectar MySQL');
  }
}

async function getMySQLTables(config: DatabaseConfig): Promise<string[]> {
  try {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectTimeout: config.connectionTimeout || 10000
    });

    const [rows] = await connection.execute('SHOW TABLES');
    await connection.end();
    return (rows as any[]).map(row => Object.values(row)[0] as string);
  } catch (error) {
    console.error('MySQL tables error:', error);
    throw error;
  }
}

async function getMySQLTableSchema(config: DatabaseConfig, tableName: string): Promise<{ columns: string[], sampleData: any[] }> {
  try {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectTimeout: config.connectionTimeout || 10000
    });

    // Obter colunas
    const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
    const columnNames = (columns as any[]).map(col => col.Field);

    // Obter amostra de dados
    const [sampleData] = await connection.execute(`SELECT * FROM ${tableName} LIMIT 3`);
    await connection.end();
    
    return {
      columns: columnNames,
      sampleData: sampleData as any[]
    };
  } catch (error) {
    console.error('MySQL schema error:', error);
    throw error;
  }
}

async function testPostgreSQLConnection(config: DatabaseConfig): Promise<boolean> {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl,
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.connectionTimeout || 10000
    });

    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    return true;
  } catch (error: any) {
    console.error('PostgreSQL connection error:', error);
    // Lançar erro com detalhes para ser capturado
    throw new Error(error.message || error.code || 'Erro desconhecido ao conectar PostgreSQL');
  }
}

async function getPostgreSQLTables(config: DatabaseConfig): Promise<string[]> {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl,
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.connectionTimeout || 10000
    });

    const client = await pool.connect();
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    client.release();
    await pool.end();
    return result.rows.map((row: any) => row.tablename);
  } catch (error) {
    console.error('PostgreSQL tables error:', error);
    throw error;
  }
}

async function getPostgreSQLTableSchema(config: DatabaseConfig, tableName: string): Promise<{ columns: string[], sampleData: any[] }> {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl,
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.connectionTimeout || 10000
    });

    const client = await pool.connect();

    // Obter colunas
    const columnsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [tableName]);
    
    const columnNames = columnsResult.rows.map((row: any) => row.column_name);

    // Obter amostra de dados
    const sampleResult = await client.query(`SELECT * FROM ${tableName} LIMIT 3`);
    client.release();
    await pool.end();
    
    return {
      columns: columnNames,
      sampleData: sampleResult.rows
    };
  } catch (error) {
    console.error('PostgreSQL schema error:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      action: 'test' | 'getTables' | 'getTableSchema';
      config: DatabaseConfig;
      tableName?: string;
    };

    const { action, config, tableName } = body;

    // Validar configuração básica
    if (!config.host || !config.port || !config.database || !config.username || !config.password) {
      return NextResponse.json(
        { error: 'Configuração do banco de dados incompleta' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'test':
        try {
          let testResult = false;
          if (config.dbType === 'mysql') {
            testResult = await testMySQLConnection(config);
          } else if (config.dbType === 'postgresql') {
            testResult = await testPostgreSQLConnection(config);
          } else {
            return NextResponse.json(
              { error: 'Tipo de banco não suportado' },
              { status: 400 }
            );
          }
          return NextResponse.json({ success: testResult });
        } catch (testError: any) {
          return NextResponse.json(
            { error: testError.message || 'Erro ao testar conexão' },
            { status: 500 }
          );
        }

      case 'getTables':
        let tables: string[] = [];
        if (config.dbType === 'mysql') {
          tables = await getMySQLTables(config);
        } else if (config.dbType === 'postgresql') {
          tables = await getPostgreSQLTables(config);
        } else {
          return NextResponse.json(
            { error: 'Tipo de banco não suportado' },
            { status: 400 }
          );
        }
        return NextResponse.json({ tables });

      case 'getTableSchema':
        if (!tableName) {
          return NextResponse.json(
            { error: 'Nome da tabela não fornecido' },
            { status: 400 }
          );
        }
        
        let schema: { columns: string[], sampleData: any[] };
        if (config.dbType === 'mysql') {
          schema = await getMySQLTableSchema(config, tableName);
        } else if (config.dbType === 'postgresql') {
          schema = await getPostgreSQLTableSchema(config, tableName);
        } else {
          return NextResponse.json(
            { error: 'Tipo de banco não suportado' },
            { status: 400 }
          );
        }
        return NextResponse.json(schema);

      default:
        return NextResponse.json(
          { error: 'Ação não reconhecida' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Database API error:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
