# Checklist: Variáveis de Ambiente Vercel

## ⚠️ IMPORTANTE: Configure estas variáveis no Vercel

Acesse: https://vercel.com/seu-projeto/settings/environment-variables

### 🔐 PostgreSQL (OBRIGATÓRIO)

```bash
PG_HOST=34.39.165.146
PG_PORT=5432
PG_DATABASE=formbravo-8854e-database
PG_USER=ipanema
PG_PASSWORD=Br@v0x00
PG_SSL=true
```

### ⏱️ Timeouts Otimizados (CRÍTICO para resolver timeout)

```bash
PG_POOL_MAX=3
PG_CONNECTION_TIMEOUT=60000
PG_STATEMENT_TIMEOUT=60000
PG_QUERY_TIMEOUT=60000
PG_IDLE_TIMEOUT=10000
```

### 🌐 Firebase (se ainda não configurado)

```bash
FIREBASE_PROJECT_ID=formbravo-8854e
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc-ab64b51376@formbravo-8854e.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n"
```

---

## 🔍 Como Verificar

### 1. Testar Diagnóstico
Após configurar, acesse:
```
https://seu-app.vercel.app/api/dataconnect/diagnose
```

### 2. Verificar Logs
```bash
vercel logs seu-projeto --follow
```

### 3. IPs Autorizados no Cloud SQL

No Google Cloud Console → Cloud SQL → Sua instância → Connections → Networking

Adicione estes IPs:
```
76.76.21.0/24   # Vercel US East
76.76.19.0/24   # Vercel US West
```

---

## 🚨 Se o Timeout Persistir

### Opção 1: Aumentar Timeout
```bash
PG_CONNECTION_TIMEOUT=120000  # 2 minutos
PG_STATEMENT_TIMEOUT=120000
PG_QUERY_TIMEOUT=120000
```

### Opção 2: IP Público Temporário (TESTE APENAS)
```
0.0.0.0/0
```
⚠️ **REMOVA APÓS TESTES**

### Opção 3: Cloud SQL Proxy (Recomendado para Produção)
1. Crie um Cloud Run service
2. Instale o Cloud SQL Auth Proxy
3. Conecte via proxy, não diretamente

---

## ✅ Resolução do Erro Atual

O erro `Connection terminated due to connection timeout` indica que:

1. ✅ **Timeouts configurados** no código (60s)
2. ❌ **Variáveis não aplicadas** no Vercel
3. ❌ **IP não autorizado** ou instância sobrecarregada

**Ação Imediata:**
1. Configure as variáveis acima no Vercel
2. Autorize os IPs do Vercel no Cloud SQL
3. Faça deploy
4. Teste `/api/dataconnect/diagnose`

---

*Atualizado em 26/03/2026*
