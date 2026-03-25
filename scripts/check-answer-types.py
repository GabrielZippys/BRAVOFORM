import psycopg2

conn = psycopg2.connect(
    host="34.39.165.146",
    port=5432,
    database="formbravo-8854e-database",
    user="ipanema",
    password="Br@v0x00",
    sslmode='prefer'
)

cur = conn.cursor()

# Estatísticas por tipo
cur.execute("""
    SELECT 
        field_type,
        COUNT(*) as total,
        COUNT(answer_text) as com_texto,
        COUNT(answer_number) as com_numero,
        COUNT(answer_date) as com_data,
        COUNT(answer_boolean) as com_boolean
    FROM answer 
    GROUP BY field_type 
    ORDER BY total DESC
""")

print("\n📊 Estatísticas por tipo de campo:\n")
print(f"{'Tipo':<15} {'Total':<10} {'Texto':<10} {'Número':<10} {'Data':<10} {'Boolean':<10}")
print("-" * 70)

for row in cur.fetchall():
    print(f"{row[0]:<15} {row[1]:<10} {row[2]:<10} {row[3]:<10} {row[4]:<10} {row[5]:<10}")

# Exemplos de registros com números
print("\n\n🔢 Exemplos de registros com answer_number preenchido:")
cur.execute("""
    SELECT field_label, answer_text, answer_number, field_type
    FROM answer 
    WHERE answer_number IS NOT NULL 
    LIMIT 10
""")

for row in cur.fetchall():
    print(f"  • {row[0]}: texto='{row[1]}', número={row[2]}, tipo={row[3]}")

# Exemplos de registros com datas
print("\n\n📅 Exemplos de registros com answer_date preenchido:")
cur.execute("""
    SELECT field_label, answer_text, answer_date, field_type
    FROM answer 
    WHERE answer_date IS NOT NULL 
    LIMIT 10
""")

count = 0
for row in cur.fetchall():
    print(f"  • {row[0]}: texto='{row[1]}', data={row[2]}, tipo={row[3]}")
    count += 1

if count == 0:
    print("  (Nenhum registro com data encontrado)")

cur.close()
conn.close()

print("\n✅ Verificação concluída!")
