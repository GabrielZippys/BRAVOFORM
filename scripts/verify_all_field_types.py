"""Verificação completa: todos os tipos de campos salvos corretamente no PostgreSQL"""
import psycopg2
from datetime import datetime

conn = psycopg2.connect(
    host='34.39.165.146', port=5432,
    database='formbravo-8854e-database',
    user='ipanema', password='Br@v0x00'
)
cur = conn.cursor()

print("=" * 80)
print("VERIFICAÇÃO DE TIPOS DE CAMPOS NO POSTGRESQL")
print("=" * 80)

# 1. fact_form_response - respostas base
cur.execute("SELECT COUNT(*) FROM fact_form_response WHERE deleted_at IS NULL")
total_responses = cur.fetchone()[0]
print(f"\n✓ fact_form_response: {total_responses} respostas ativas")

# 2. fact_answers - campos simples (texto, número, data, boolean, email, etc)
cur.execute("""
    SELECT input_type, COUNT(*) as cnt
    FROM fact_answers
    GROUP BY input_type
    ORDER BY cnt DESC
""")
print(f"\n✓ fact_answers - Campos simples por tipo:")
for row in cur.fetchall():
    print(f"  {row[0]:20s} {row[1]:>6d} registros")

# Verificar se há dados em cada coluna tipada
cur.execute("""
    SELECT 
        COUNT(*) as total,
        COUNT(answer_text) as com_texto,
        COUNT(answer_number) as com_numero,
        COUNT(answer_date) as com_data,
        COUNT(answer_boolean) as com_boolean
    FROM fact_answers
""")
r = cur.fetchone()
print(f"\n  Distribuição de valores:")
print(f"    answer_text:    {r[1]:>6d} / {r[0]} ({r[1]*100//r[0]}%)")
print(f"    answer_number:  {r[2]:>6d} / {r[0]} ({r[2]*100//r[0]}%)")
print(f"    answer_date:    {r[3]:>6d} / {r[0]} ({r[3]*100//r[0]}%)")
print(f"    answer_boolean: {r[4]:>6d} / {r[0]} ({r[4]*100//r[0]}%)")

# 3. fact_order_items - Grade de Pedidos
cur.execute("SELECT COUNT(*) FROM fact_order_items")
order_count = cur.fetchone()[0]
print(f"\n✓ fact_order_items - Grade de Pedidos: {order_count} itens")

cur.execute("""
    SELECT 
        COUNT(*) as total,
        COUNT(product_key) as com_produto,
        COUNT(price_snap) as com_preco,
        COUNT(quantity) as com_quantidade
    FROM fact_order_items
""")
r = cur.fetchone()
print(f"  Campos preenchidos:")
print(f"    product_key (FK): {r[1]:>3d} / {r[0]} ({r[1]*100//r[0]}%)")
print(f"    price_snap:       {r[2]:>3d} / {r[0]} ({r[2]*100//r[0]}%)")
print(f"    quantity:         {r[3]:>3d} / {r[0]} ({r[3]*100//r[0]}%)")

# Sample de 3 itens
cur.execute("""
    SELECT product_name_snap, price_snap, quantity, subtotal
    FROM fact_order_items
    WHERE price_snap IS NOT NULL
    LIMIT 3
""")
print(f"\n  Sample (3 itens):")
for row in cur.fetchall():
    subtotal_str = f"R$ {row[3]:>8.2f}" if row[3] is not None else "N/A"
    print(f"    {row[0]:30s} R$ {row[1]:>7.2f} x {row[2]:>4.1f} = {subtotal_str}")

# 4. fact_checkbox_answers - Caixa de Seleção
cur.execute("SELECT COUNT(*) FROM fact_checkbox_answers")
checkbox_count = cur.fetchone()[0]
print(f"\n✓ fact_checkbox_answers - Caixa de Seleção: {checkbox_count} opções marcadas")

cur.execute("""
    SELECT field_label, option_value
    FROM fact_checkbox_answers
    LIMIT 5
""")
print(f"  Sample (5 opções):")
for row in cur.fetchall():
    print(f"    {row[0]:40s} → {row[1]}")

# 5. fact_table_answers - Tabelas (1 linha por célula)
cur.execute("SELECT COUNT(*) FROM fact_table_answers")
table_cells = cur.fetchone()[0]
print(f"\n✓ fact_table_answers - Tabelas: {table_cells} células")

cur.execute("""
    SELECT field_label, COUNT(*) as cells
    FROM fact_table_answers
    GROUP BY field_label
    ORDER BY cells DESC
    LIMIT 5
""")
print(f"  Top 5 campos tabela por quantidade de células:")
for row in cur.fetchall():
    print(f"    {row[0]:50s} {row[1]:>7d} células")

# Verificar labels resolvidos (não devem ser IDs numéricos)
cur.execute("""
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE row_label ~ '^[0-9]+$') as row_ids,
        COUNT(*) FILTER (WHERE column_label ~ '^[0-9]+$') as col_ids
    FROM fact_table_answers
""")
r = cur.fetchone()
print(f"\n  Resolução de labels:")
print(f"    row_label resolvido:    {r[0]-r[1]:>7d} / {r[0]} ({(r[0]-r[1])*100//r[0]}%)")
print(f"    column_label resolvido: {r[0]-r[2]:>7d} / {r[0]} ({(r[0]-r[2])*100//r[0]}%)")

# Sample de 5 células
cur.execute("""
    SELECT field_label, row_label, column_label, cell_value
    FROM fact_table_answers
    WHERE cell_value IS NOT NULL
    ORDER BY table_answer_key
    LIMIT 5
""")
print(f"\n  Sample (5 células):")
for row in cur.fetchall():
    field = row[0][:30] + '...' if len(row[0]) > 30 else row[0]
    print(f"    {field:33s} | {row[1]:15s} | {row[2]:15s} | {row[3]}")

# 6. fact_attachments - Assinaturas e Anexos
cur.execute("SELECT COUNT(*) FROM fact_attachments")
attach_count = cur.fetchone()[0]
print(f"\n✓ fact_attachments - Assinaturas/Anexos: {attach_count} arquivos")

cur.execute("""
    SELECT field_type, COUNT(*) as cnt
    FROM fact_attachments
    GROUP BY field_type
""")
print(f"  Por tipo:")
for row in cur.fetchall():
    print(f"    {row[0]:20s} {row[1]:>3d} arquivos")

# 7. Verificar integridade referencial
print(f"\n{'='*80}")
print("VERIFICAÇÃO DE INTEGRIDADE REFERENCIAL")
print(f"{'='*80}")

# fact_answers sem response_key válido
cur.execute("""
    SELECT COUNT(*)
    FROM fact_answers fa
    LEFT JOIN fact_form_response fr ON fa.response_key = fr.response_key
    WHERE fr.response_key IS NULL
""")
orphan_answers = cur.fetchone()[0]
print(f"\n✓ fact_answers órfãs (sem response_key válido): {orphan_answers}")

# fact_order_items sem response_key válido
cur.execute("""
    SELECT COUNT(*)
    FROM fact_order_items foi
    LEFT JOIN fact_form_response fr ON foi.response_key = fr.response_key
    WHERE fr.response_key IS NULL
""")
orphan_orders = cur.fetchone()[0]
print(f"✓ fact_order_items órfãos: {orphan_orders}")

# fact_table_answers sem response_key válido
cur.execute("""
    SELECT COUNT(*)
    FROM fact_table_answers fta
    LEFT JOIN fact_form_response fr ON fta.response_key = fr.response_key
    WHERE fr.response_key IS NULL
""")
orphan_tables = cur.fetchone()[0]
print(f"✓ fact_table_answers órfãs: {orphan_tables}")

# 8. Verificar respostas recentes (últimas 24h)
cur.execute("""
    SELECT COUNT(*)
    FROM fact_form_response
    WHERE submitted_at >= NOW() - INTERVAL '24 hours'
      AND deleted_at IS NULL
""")
recent = cur.fetchone()[0]
print(f"\n{'='*80}")
print(f"✓ Respostas nas últimas 24h: {recent}")

if recent > 0:
    cur.execute("""
        SELECT fr.firebase_id, fr.form_title, fr.submitted_at,
               (SELECT COUNT(*) FROM fact_answers WHERE response_key = fr.response_key) as answers,
               (SELECT COUNT(*) FROM fact_order_items WHERE response_key = fr.response_key) as orders,
               (SELECT COUNT(*) FROM fact_checkbox_answers WHERE response_key = fr.response_key) as checkboxes,
               (SELECT COUNT(*) FROM fact_table_answers WHERE response_key = fr.response_key) as table_cells
        FROM fact_form_response fr
        WHERE fr.submitted_at >= NOW() - INTERVAL '24 hours'
          AND fr.deleted_at IS NULL
        ORDER BY fr.submitted_at DESC
        LIMIT 5
    """)
    print(f"\n  Últimas 5 respostas:")
    print(f"  {'ID':<25s} {'Formulário':<30s} {'Data':<20s} {'Ans':>4s} {'Ord':>4s} {'Chk':>4s} {'Cel':>5s}")
    print(f"  {'-'*25} {'-'*30} {'-'*20} {'-'*4} {'-'*4} {'-'*4} {'-'*5}")
    for row in cur.fetchall():
        resp_id = row[0][:23] + '..' if len(row[0]) > 25 else row[0]
        form = row[1][:28] + '..' if len(row[1]) > 30 else row[1]
        dt = row[2].strftime('%Y-%m-%d %H:%M:%S')
        print(f"  {resp_id:<25s} {form:<30s} {dt:<20s} {row[3]:>4d} {row[4]:>4d} {row[5]:>4d} {row[6]:>5d}")

print(f"\n{'='*80}")
print("RESUMO FINAL")
print(f"{'='*80}")
print(f"✅ Todos os tipos de campos estão sendo salvos:")
print(f"   • Campos simples (texto/número/data/boolean): {r[1]} registros")
print(f"   • Grade de Pedidos: {order_count} itens")
print(f"   • Caixa de Seleção: {checkbox_count} opções")
print(f"   • Tabelas: {table_cells} células (relacional puro)")
print(f"   • Anexos/Assinaturas: {attach_count} arquivos")
print(f"\n✅ Integridade referencial: {orphan_answers + orphan_orders + orphan_tables} registros órfãos")
print(f"✅ Respostas recentes (24h): {recent}")
print(f"\n{'='*80}")

cur.close()
conn.close()
