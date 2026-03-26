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

print('--- Verificando estrutura da tabela products ---')
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'products'
    ORDER BY ordinal_position
""")
columns = cur.fetchall()
for col in columns:
    print(f'{col[0]}: {col[1]}')

print('\n--- Verificando produtos com preco/estoque ---')
cur.execute('SELECT id, name, preco, estoque FROM products WHERE preco IS NOT NULL OR estoque IS NOT NULL LIMIT 5')
rows = cur.fetchall()
for row in rows:
    print(f'ID: {row[0]}, Name: "{row[1]}", Preço: R${row[2]}, Estoque: {row[3]}')

print('\n--- Estatísticas ---')
cur.execute('SELECT COUNT(*) FROM products WHERE preco IS NOT NULL')
with_price = cur.fetchone()[0]
cur.execute('SELECT COUNT(*) FROM products WHERE estoque IS NOT NULL')
with_stock = cur.fetchone()[0]
print(f'Produtos com preço: {with_price}')
print(f'Produtos com estoque: {with_stock}')

cur.close()
conn.close()
