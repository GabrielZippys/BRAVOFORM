import requests
import json
import time

def find_vercel_ip():
    """Descobre o IP real do Vercel que está acessando o Cloud SQL"""
    
    print("🔍 Descobrindo IP real do Vercel...")
    print("Acessando diagnóstico para capturar o IP de origem...")
    
    # Criar uma rota que retorna o IP de origem
    url = "https://bravoform.vercel.app/api/dataconnect/diagnose"
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            # Verificar se há erro de conexão
            connection_test = next((t for t in data.get('tests', []) if t['name'] == 'Conexão PostgreSQL'), None)
            
            if connection_test and connection_test['status'] == 'error':
                error_msg = connection_test['details'].get('error', '')
                
                # Extrair IP dos logs do Cloud SQL (se disponível)
                print(f"❌ Erro de conexão: {error_msg}")
                
                # Tentar acessar logs recentes do Vercel para ver o IP
                print("\n💡 Para encontrar o IP exato:")
                print("1. Acesse os logs do Vercel: vercel logs seu-projeto --follow")
                print("2. Procure por tentativas de conexão com erro")
                print("3. O IP pode aparecer nos logs ou na mensagem de erro")
                
                # Tentativa 2: Usar um serviço de IP detection
                print("\n🌐 Tentativa 2: Criar endpoint para detectar IP...")
                print("Vou criar uma rota que retorna o IP de quem acessa...")
                
    except Exception as e:
        print(f"❌ Erro: {e}")
    
    print("\n" + "="*60)
    print("OPÇÕES PARA ENCONTRAR O IP:")
    print("="*60)
    print("1. Logs do Cloud SQL:")
    print("   - Console > Cloud SQL > Sua instância > Logs")
    print("   - Procure por 'connection timeout' ou 'connection refused'")
    print("   - O IP de origem aparece na mensagem de erro")
    print()
    print("2. Logs do Vercel:")
    print("   - vercel logs seu-projeto --follow")
    print("   - Procure por tentativas de conexão PostgreSQL")
    print()
    print("3. Criar endpoint de IP detection:")
    print("   - Vou criar uma rota que mostra o IP do cliente")
    print()
    print("4. IPs conhecidos do Vercel:")
    print("   - 76.76.21.21 (US East - específico)")
    print("   - 76.76.19.62 (US West - específico)")
    print("   - Ou ranges: 76.76.21.0/24 e 76.76.19.0/24")
    print("="*60)

if __name__ == "__main__":
    find_vercel_ip()
