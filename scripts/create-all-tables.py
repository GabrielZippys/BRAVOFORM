"""
Cria todas as tabelas necessárias no PostgreSQL para dual-save completo
"""

import psycopg2

PG_HOST = "34.39.165.146"
PG_PORT = 5432
PG_DATABASE = "formbravo-8854e-database"
PG_USER = "ipanema"
PG_PASSWORD = "Br@v0x00"

def create_all_tables():
    conn = psycopg2.connect(
        host=PG_HOST, port=PG_PORT, database=PG_DATABASE,
        user=PG_USER, password=PG_PASSWORD, sslmode='prefer'
    )
    cur = conn.cursor()
    
    try:
        print("Criando tabelas no PostgreSQL...")
        
        # Tabela: users (admins)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(500) NOT NULL,
                email VARCHAR(500) NOT NULL,
                role VARCHAR(50) DEFAULT 'Admin',
                company_id VARCHAR(255),
                department_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        print("✓ Tabela users criada")
        
        # Tabela: collaborators
        cur.execute("""
            CREATE TABLE IF NOT EXISTS collaborators (
                id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(500) NOT NULL,
                email VARCHAR(500),
                company_id VARCHAR(255),
                department_id VARCHAR(255),
                department_name VARCHAR(500),
                is_temporary_password BOOLEAN DEFAULT FALSE,
                can_view_history BOOLEAN DEFAULT FALSE,
                can_edit_history BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        print("✓ Tabela collaborators criada")
        
        # Índices para users e collaborators
        cur.execute("CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_collaborators_company_id ON collaborators(company_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_collaborators_department_id ON collaborators(department_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_collaborators_username ON collaborators(username)")
        
        conn.commit()
        print("\n✅ Todas as tabelas criadas com sucesso!")
        
        # Listar todas as tabelas
        cur.execute("""
            SELECT table_name, 
                   (SELECT COUNT(*) FROM information_schema.columns 
                    WHERE table_name = t.table_name AND table_schema = 'public') as num_columns
            FROM information_schema.tables t
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """)
        
        print("\n📊 Tabelas disponíveis:")
        for table_name, num_cols in cur.fetchall():
            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cur.fetchone()[0]
            print(f"  • {table_name}: {count} registros, {num_cols} colunas")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Erro: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    create_all_tables()
