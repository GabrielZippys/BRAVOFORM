"""
Script para remover tabelas não utilizadas do PostgreSQL
Mantém apenas: forms, form_response, answer
"""

import psycopg2

# Configuração PostgreSQL
PG_HOST = "34.39.165.146"
PG_PORT = 5432
PG_DATABASE = "formbravo-8854e-database"
PG_USER = "ipanema"
PG_PASSWORD = "Br@v0x00"

def cleanup_tables():
    """Remove tabelas e views não utilizadas"""
    conn = psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        database=PG_DATABASE,
        user=PG_USER,
        password=PG_PASSWORD,
        sslmode='prefer'
    )
    cur = conn.cursor()
    
    try:
        print("Removendo tabelas e views não utilizadas...")
        
        # Remover views
        cur.execute("DROP VIEW IF EXISTS vw_responses_summary CASCADE")
        print("✓ View vw_responses_summary removida")
        
        cur.execute("DROP VIEW IF EXISTS vw_responses_with_values CASCADE")
        print("✓ View vw_responses_with_values removida")
        
        # Remover tabelas vazias/não utilizadas
        cur.execute("DROP TABLE IF EXISTS attachment CASCADE")
        print("✓ Tabela attachment removida")
        
        cur.execute("DROP TABLE IF EXISTS workflow_history CASCADE")
        print("✓ Tabela workflow_history removida")
        
        cur.execute("DROP TABLE IF EXISTS table_item CASCADE")
        print("✓ Tabela table_item removida")
        
        conn.commit()
        
        # Listar tabelas restantes
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """)
        
        print("\n📊 Tabelas restantes:")
        for row in cur.fetchall():
            print(f"  ✓ {row[0]}")
        
        print("\n✅ Limpeza concluída com sucesso!")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Erro: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    cleanup_tables()
