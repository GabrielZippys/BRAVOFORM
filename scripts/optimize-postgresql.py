"""
Otimiza estrutura PostgreSQL para relatórios poderosos no Power BI
- Adiciona Foreign Keys
- Cria índices estratégicos
- Adiciona colunas úteis para relatórios
"""

import psycopg2

PG_HOST = "34.39.165.146"
PG_PORT = 5432
PG_DATABASE = "formbravo-8854e-database"
PG_USER = "ipanema"
PG_PASSWORD = "Br@v0x00"

def optimize():
    conn = psycopg2.connect(
        host=PG_HOST, port=PG_PORT, database=PG_DATABASE,
        user=PG_USER, password=PG_PASSWORD, sslmode='prefer'
    )
    cur = conn.cursor()
    
    optimizations = [
        # === ÍNDICES para performance de queries ===
        ("Índice: form_response.form_id", 
         "CREATE INDEX IF NOT EXISTS idx_form_response_form_id ON form_response(form_id)"),
        ("Índice: form_response.company_id",
         "CREATE INDEX IF NOT EXISTS idx_form_response_company_id ON form_response(company_id)"),
        ("Índice: form_response.department_id",
         "CREATE INDEX IF NOT EXISTS idx_form_response_department_id ON form_response(department_id)"),
        ("Índice: form_response.collaborator_id",
         "CREATE INDEX IF NOT EXISTS idx_form_response_collaborator_id ON form_response(collaborator_id)"),
        ("Índice: form_response.submitted_at",
         "CREATE INDEX IF NOT EXISTS idx_form_response_submitted_at ON form_response(submitted_at)"),
        ("Índice: form_response.status",
         "CREATE INDEX IF NOT EXISTS idx_form_response_status ON form_response(status)"),
        ("Índice: answer.response_id",
         "CREATE INDEX IF NOT EXISTS idx_answer_response_id ON answer(response_id)"),
        ("Índice: answer.field_id",
         "CREATE INDEX IF NOT EXISTS idx_answer_field_id ON answer(field_id)"),
        ("Índice: answer.field_label",
         "CREATE INDEX IF NOT EXISTS idx_answer_field_label ON answer(field_label)"),
        ("Índice: forms.company_id",
         "CREATE INDEX IF NOT EXISTS idx_forms_company_id ON forms(company_id)"),
        ("Índice: forms.department_id",
         "CREATE INDEX IF NOT EXISTS idx_forms_department_id ON forms(department_id)"),
        ("Índice: departments.company_id",
         "CREATE INDEX IF NOT EXISTS idx_departments_company_id ON departments(company_id)"),
        
        # === ÍNDICE COMPOSTO para queries comuns ===
        ("Índice composto: form_response(form_id, submitted_at)",
         "CREATE INDEX IF NOT EXISTS idx_form_response_form_submitted ON form_response(form_id, submitted_at DESC)"),
        ("Índice composto: answer(response_id, field_label)",
         "CREATE INDEX IF NOT EXISTS idx_answer_response_field ON answer(response_id, field_label)"),
    ]
    
    for desc, sql in optimizations:
        try:
            cur.execute(sql)
            print(f"  ✓ {desc}")
        except Exception as e:
            print(f"  ⚠ {desc}: {e}")
            conn.rollback()
            continue
    
    conn.commit()
    
    # === VERIFICAR ESTRUTURA FINAL ===
    print("\n📊 ESTRUTURA FINAL DO BANCO:")
    print("=" * 60)
    
    # Listar tabelas com contagem de registros
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    tables = [r[0] for r in cur.fetchall()]
    
    for table in tables:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        
        # Colunas
        cur.execute(f"""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = '{table}' AND table_schema = 'public'
            ORDER BY ordinal_position
        """)
        cols = cur.fetchall()
        
        print(f"\n📋 {table} ({count} registros)")
        for col_name, col_type, nullable in cols:
            null_str = "" if nullable == "YES" else " NOT NULL"
            print(f"    {col_name}: {col_type}{null_str}")
    
    # Listar índices
    print(f"\n🔍 ÍNDICES:")
    cur.execute("""
        SELECT indexname, tablename
        FROM pg_indexes 
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
    """)
    for idx_name, tbl_name in cur.fetchall():
        print(f"    {tbl_name}.{idx_name}")
    
    cur.close()
    conn.close()
    print("\n✅ Otimização concluída!")

if __name__ == "__main__":
    optimize()
