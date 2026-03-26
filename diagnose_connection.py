import psycopg2
import time
import sys

def test_connection():
    print("🔍 Testando conexão PostgreSQL...")
    
    # Configurações
    config = {
        'host': '34.39.165.146',
        'port': '5432',
        'database': 'formbravo-8854e-database',
        'user': 'ipanema',
        'password': 'Br@v0x00',
        'sslmode': 'require',
        'connect_timeout': 60,  # 60 segundos
        'application_name': 'diagnose_connection'
    }
    
    try:
        print(f"Conectando a {config['host']}:{config['port']}/{config['database']}...")
        start_time = time.time()
        
        conn = psycopg2.connect(**config)
        cur = conn.cursor()
        
        # Test query simples
        cur.execute("SELECT 1 as test")
        result = cur.fetchone()
        
        end_time = time.time()
        connection_time = (end_time - start_time) * 1000  # ms
        
        print(f"✅ Conexão bem-sucedida!")
        print(f"⏱️ Tempo de conexão: {connection_time:.0f}ms")
        print(f"📊 Test query result: {result}")
        
        # Verificar versão
        cur.execute("SELECT version()")
        version = cur.fetchone()[0]
        print(f"🔧 PostgreSQL: {version.split(',')[0]}")
        
        # Verificar tabelas
        cur.execute("""
            SELECT table_name, table_rows 
            FROM information_schema.tables t
            LEFT JOIN (
                SELECT table_name, n_tup_ins - n_tup_del as table_rows
                FROM pg_stat_user_tables
            ) s ON t.table_name = s.table_name
            WHERE t.table_schema = 'public'
            ORDER BY table_name
        """)
        tables = cur.fetchall()
        print(f"\n📋 Tabelas encontradas:")
        for table in tables:
            print(f"  • {table[0]}")
        
        cur.close()
        conn.close()
        
        return True
        
    except psycopg2.OperationalError as e:
        print(f"❌ Erro de conexão: {e}")
        if "timeout" in str(e).lower():
            print("⚠️ Timeout detectado - possíveis causas:")
            print("  1. IP não autorizado no Cloud SQL")
            print("  2. Firewall bloqueando conexão")
            print("  3. Cloud SQL instância sobrecarregada")
        return False
        
    except Exception as e:
        print(f"❌ Erro inesperado: {e}")
        return False

def test_with_different_timeouts():
    print("\n🧪 Testando com diferentes timeouts...")
    
    timeouts = [10, 30, 60, 120]  # segundos
    
    for timeout in timeouts:
        print(f"\n⏱️ Testando com connect_timeout={timeout}s...")
        try:
            conn = psycopg2.connect(
                host='34.39.165.146',
                port='5432',
                database='formbravo-8854e-database',
                user='ipanema',
                password='Br@v0x00',
                sslmode='require',
                connect_timeout=timeout
            )
            conn.close()
            print(f"✅ Sucesso com {timeout}s")
            break
        except psycopg2.OperationalError as e:
            if "timeout" in str(e).lower():
                print(f"❌ Timeout com {timeout}s")
            else:
                print(f"❌ Erro: {e}")
                break

if __name__ == "__main__":
    print("=" * 60)
    print("DIAGNÓSTICO DE CONEXÃO POSTGRESQL")
    print("=" * 60)
    
    # Teste básico
    success = test_connection()
    
    if not success:
        # Teste com diferentes timeouts
        test_with_different_timeouts()
        
        print("\n📝 Recomendações:")
        print("1. Verifique se o IP do Vercel está autorizado no Cloud SQL")
        print("2. Considere usar Cloud SQL Proxy para produção")
        print("3. Aumente os timeouts no ambiente Vercel")
        print("\n🔗 IPs Vercel para autorizar:")
        print("  • 76.76.21.0/24 (US East)")
        print("  • 76.76.19.0/24 (US West)")
    
    print("\n" + "=" * 60)
