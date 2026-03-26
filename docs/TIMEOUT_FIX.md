# Fix: Connection Timeout no Vercel

## 🔴 Erro

```
Error: Connection terminated due to connection timeout
Error: Connection terminated unexpectedly
```

## ✅ Solução Implementada

### 1. Timeouts Aumentados

**Antes:**
- `PG_CONNECTION_TIMEOUT`: 10000ms (10s)
- `PG_POOL_MAX`: 5

**Depois:**
- `PG_CONNECTION_TIMEOUT`: 60000ms (60s) ✅
- `PG_POOL_MAX`: 3 ✅
- `PG_IDLE_TIMEOUT`: 10000ms (10s)
- `PG_STATEMENT_TIMEOUT`: 60000ms (60s)
- `PG_QUERY_TIMEOUT`: 60000ms (60s)

### 2. Retry Automático

O sistema agora tenta **3 vezes** com backoff exponencial:
- Tentativa 1: imediato
- Tentativa 2: após 1 segundo
- Tentativa 3: após 2 segundos

### 3. Pool Otimizado

Reduzido de 5 para **3 conexões** máximas para evitar saturação no ambiente serverless.

---

## 📋 Ações Necessárias

### 1. Atualizar Variáveis no Vercel

Acesse: https://vercel.com/seu-projeto/settings/environment-variables

**Atualize estas variáveis:**
```bash
PG_CONNECTION_TIMEOUT=60000
PG_POOL_MAX=3
PG_IDLE_TIMEOUT=10000
PG_STATEMENT_TIMEOUT=60000
PG_QUERY_TIMEOUT=60000
```

### 2. Verificar IPs Autorizados no Cloud SQL

**Google Cloud Console** → **Cloud SQL** → Sua instância → **Connections** → **Networking**

Confirme que estes IPs estão autorizados:
```
76.76.21.0/24   (Vercel US East)
76.76.19.0/24   (Vercel US West)
```

**Ou adicione o IP específico que aparece no erro:**
```
154.12.235.194  (ipanema - seu IP atual)
201.28.197.226  (maquina-frigo)
```

### 3. Deploy

```bash
git add .
git commit -m "fix: increase PostgreSQL timeout and add retry logic"
git push origin main
```

---

## 🧪 Testar

Após deploy, acesse:
```
https://seu-app.vercel.app/api/dataconnect/test
```

**Resposta esperada:**
```json
{
  "success": true,
  "message": "✅ PostgreSQL connection successful",
  "connection": {
    "connectionTime": "500ms"
  }
}
```

---

## 🔍 Monitorar Logs

```bash
vercel logs seu-projeto --follow
```

Procure por:
- ✅ `PostgreSQL client connected`
- ✅ `Query attempt 1/3 succeeded`
- ⚠️ `Retrying in Xms...` (retry em ação)
- ❌ `Connection timeout` (ainda falhando)

---

## 🚨 Se Ainda Falhar

### Opção 1: Habilitar IP Público Temporariamente

No Cloud SQL, adicione temporariamente:
```
0.0.0.0/0
```

⚠️ **ATENÇÃO:** Remova após testes! Isso permite conexões de qualquer IP.

### Opção 2: Usar Cloud SQL Proxy (Recomendado para Produção)

Para produção, considere usar Cloud SQL Auth Proxy via Cloud Run:
https://cloud.google.com/sql/docs/postgres/connect-run

### Opção 3: Aumentar Ainda Mais os Timeouts

Se necessário, aumente para:
```bash
PG_CONNECTION_TIMEOUT=120000  # 2 minutos
PG_STATEMENT_TIMEOUT=120000
```

---

## 📊 Melhorias Implementadas

1. ✅ **Retry automático** com backoff exponencial
2. ✅ **Timeout aumentado** de 10s para 60s
3. ✅ **Pool reduzido** de 5 para 3 conexões
4. ✅ **Logs detalhados** de cada tentativa
5. ✅ **Graceful degradation** - falha após 3 tentativas

---

*Fix implementado em Março 2026*
