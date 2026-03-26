import requests
import json
import time

def check_diagnosis():
    print("🔍 Verificando diagnóstico do Vercel...")
    
    url = "https://bravoform.vercel.app/api/dataconnect/diagnose"
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            print(f"✅ Status: {data.get('status', 'unknown')}")
            print(f"⏱️ Tempo total: {data.get('totalTime', 'unknown')}")
            
            print("\n📋 Testes realizados:")
            for test in data.get('tests', []):
                status_emoji = "✅" if test['status'] == 'success' else "❌"
                print(f"  {status_emoji} {test['name']}: {test['status']}")
                
                if test['status'] == 'error' and 'details' in test:
                    print(f"     Erro: {test['details'].get('error', 'N/A')}")
            
            # Verificar configurações
            config_test = next((t for t in data.get('tests', []) if t['name'] == 'Configurações'), None)
            if config_test:
                print(f"\n⚙️ Configurações atuais:")
                details = config_test['details']
                print(f"  PG_CONNECTION_TIMEOUT: {details.get('PG_CONNECTION_TIMEOUT', 'NÃO CONFIGURADO')}")
                print(f"  PG_STATEMENT_TIMEOUT: {details.get('PG_STATEMENT_TIMEOUT', 'NÃO CONFIGURADO')}")
                print(f"  PG_QUERY_TIMEOUT: {details.get('PG_QUERY_TIMEOUT', 'NÃO CONFIGURADO')}")
                print(f"  PG_POOL_MAX: {details.get('PG_POOL_MAX', 'NÃO CONFIGURADO')}")
            
            # Sugestões se houver erro
            if 'suggestions' in data:
                print(f"\n💡 Sugestões:")
                for suggestion in data['suggestions']:
                    print(f"  • {suggestion}")
            
        elif response.status_code == 429:
            print("⏳ Muitas requisições. Aguarde alguns segundos e tente novamente.")
            print("   Você pode acessar diretamente no navegador:")
            print(f"   {url}")
            
        else:
            print(f"❌ Erro HTTP: {response.status_code}")
            print(f"   Resposta: {response.text}")
            
    except requests.exceptions.Timeout:
        print("⏱️ Timeout na requisição. O servidor pode estar lento ou offline.")
        
    except requests.exceptions.ConnectionError:
        print("🔌 Erro de conexão. Verifique sua internet ou se o URL está correto.")
        
    except Exception as e:
        print(f"❌ Erro inesperado: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("VERIFICAÇÃO DE AMBIENTE VERCEL")
    print("=" * 60)
    
    check_diagnosis()
    
    print("\n" + "=" * 60)
    print("Se houver timeout de conexão:")
    print("1. Verifique se as variáveis PG_* estão configuradas no Vercel")
    print("2. Verifique se os IPs do Vercel estão autorizados no Cloud SQL")
    print("3. Acesse o diagnóstico diretamente no navegador")
    print("=" * 60)
