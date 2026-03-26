import os
import sys
from pathlib import Path

# Simular ambiente Vercel (sem as variáveis de timeout)
print("🧪 Simulando ambiente Vercel SEM variáveis de timeout...")

# Remover variáveis de timeout para simular o problema
original_env = {}
for key in ['PG_CONNECTION_TIMEOUT', 'PG_STATEMENT_TIMEOUT', 'PG_QUERY_TIMEOUT', 'PG_POOL_MAX']:
    if key in os.environ:
        original_env[key] = os.environ[key]
        del os.environ[key]

# Importar o módulo PostgreSQL
sys.path.append(str(Path(__file__).parent / 'src' / 'lib' / 'db'))

try:
    from postgresql import getPool, executeQuery
    
    print("🔍 Testando conexão com configurações padrão...")
    
    # Testar query
    result = executeQuery('SELECT 1 as test, NOW() as timestamp')
    print(f"✅ Query executada: {result}")
    
    # Testar contar produtos
    products = executeQuery('SELECT COUNT(*) as count FROM products')
    print(f"📊 Total produtos: {products[0]['count']}")
    
except Exception as e:
    print(f"❌ Erro (simulado): {e}")
    print("\n💡 Este erro simula o que acontece no Vercel sem as variáveis de timeout")

finally:
    # Restaurar variáveis originais
    for key, value in original_env.items():
        os.environ[key] = value

print("\n" + "="*60)
print("SOLUÇÃO:")
print("Configure estas variáveis no Vercel:")
print("PG_CONNECTION_TIMEOUT=60000")
print("PG_STATEMENT_TIMEOUT=60000") 
print("PG_QUERY_TIMEOUT=60000")
print("PG_POOL_MAX=3")
print("="*60)
