const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do PostgreSQL
const client = new Client({
  host: '34.39.165.146',
  port: 5432,
  database: 'formbravo-8854e-database',
  user: 'ipanema',
  password: process.env.POSTGRES_PASSWORD, // Defina: $env:POSTGRES_PASSWORD="Brav0x00"
  ssl: false
});

async function setupDatabase() {
  try {
    console.log('🔌 Conectando ao PostgreSQL...');
    await client.connect();
    console.log('✅ Conectado com sucesso!');

    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, 'create-postgresql-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📊 Executando script SQL...');
    await client.query(sql);
    console.log('✅ Tabelas criadas com sucesso!');

    // Verificar tabelas criadas
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('\n📋 Tabelas criadas:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // Contar registros de teste
    const countResult = await client.query('SELECT COUNT(*) FROM form_response');
    console.log(`\n📊 Registros de teste inseridos: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n✅ Concluído!');
  }
}

setupDatabase();
