import psycopg2

conn = psycopg2.connect(
    host='34.39.165.146',
    port='5432',
    database='formbravo-8854e-database',
    user='ipanema',
    password='Br@v0x00',
    sslmode='require'
)

cur = conn.cursor()

print('--- Verificando estrutura da tabela collaborators ---')
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'collaborators'
    ORDER BY ordinal_position
""")
columns = cur.fetchall()
for col in columns:
    print(f'{col[0]}: {col[1]}')

print('\n--- Collaborators (primeiros 5) ---')
cur.execute('SELECT id, username, name, email, role, active FROM collaborators LIMIT 5')
rows = cur.fetchall()
for row in rows:
    print(f'ID: {row[0]}, Username: {row[1]}, Name: "{row[2]}", Email: {row[3]}, Role: {row[4]}, Active: {row[5]}')

print('\n--- Verificando total de collaborators ---')
cur.execute('SELECT COUNT(*) FROM collaborators')
total_count = cur.fetchone()[0]
print(f'Total de collaborators: {total_count}')

cur.close()
conn.close()
