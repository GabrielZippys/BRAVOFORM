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
cur.execute('SELECT id, name, catalog_id FROM products LIMIT 5')
rows = cur.fetchall()
print('Products (primeiros 5):')
for row in rows:
    print(f'ID: {row[0]}, Name: "{row[1]}", Catalog: {row[2]}')

print('\n--- Verificando se há produtos com nome vazio ---')
cur.execute("SELECT COUNT(*) FROM products WHERE name IS NULL OR name = ''")
empty_count = cur.fetchone()[0]
print(f'Produtos com nome vazio: {empty_count}')

print('\n--- Verificando total de produtos ---')
cur.execute('SELECT COUNT(*) FROM products')
total_count = cur.fetchone()[0]
print(f'Total de produtos: {total_count}')

cur.close()
conn.close()
