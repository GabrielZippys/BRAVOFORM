# Configuração Cloud SQL para Vercel - BravoForm

## 🚀 Problema Resolvido

**Erro anterior:**
```
Error: connect ETIMEDOUT 34.39.165.146:5432
```

**Causa:** Cloud SQL não permite conexões diretas por IP sem configuração adequada.

**Solução implementada:** Connection pooling otimizado + configuração via variáveis de ambiente.

---

## 📋 Variáveis de Ambiente Necessárias

Configure estas variáveis no **Vercel Dashboard** → Settings → Environment Variables:

### PostgreSQL (Cloud SQL)

```bash
# Conexão PostgreSQL
PG_HOST=34.39.165.146
PG_PORT=5432
PG_DATABASE=formbravo-8854e-database
PG_USER=ipanema
PG_PASSWORD=Br@v0x00

# SSL (recomendado para produção)
PG_SSL=true

# Connection Pool (otimizado para Vercel)
PG_POOL_MAX=3
PG_POOL_MIN=0
PG_IDLE_TIMEOUT=10000
PG_CONNECTION_TIMEOUT=60000
PG_STATEMENT_TIMEOUT=60000
PG_QUERY_TIMEOUT=30000
```

---

## ⚙️ Configuração no Vercel

### Passo 1: Adicionar variáveis de ambiente

1. Acesse: https://vercel.com/seu-projeto/settings/environment-variables
2. Adicione cada variável acima
3. Selecione os ambientes: **Production**, **Preview**, **Development**
4. Clique em **Save**

### Passo 2: Habilitar acesso ao Cloud SQL

**Opção A: Autorizar IPs do Vercel (Recomendado)**

No Google Cloud Console:
1. Acesse **Cloud SQL** → Sua instância
2. Vá em **Connections** → **Networking**
3. Clique em **Add Network**
4. Adicione os IPs do Vercel:
   ```
   76.76.21.0/24
   76.76.19.0/24
   ```
   (Consulte: https://vercel.com/docs/concepts/edge-network/regions)

**Opção B: Habilitar IP público (menos seguro)**

No Google Cloud Console:
1. Acesse **Cloud SQL** → Sua instância
2. Vá em **Connections** → **Networking**
3. Habilite **Public IP**
4. Adicione **0.0.0.0/0** em Authorized Networks (apenas para testes)

**⚠️ IMPORTANTE:** Para produção, use apenas IPs específicos do Vercel.

---

## 🔧 Arquitetura Implementada

### Módulo Centralizado de Conexão

Arquivo: `src/lib/db/postgresql.ts`

**Recursos:**
- ✅ Connection pooling reutilizável
- ✅ Timeouts configuráveis
- ✅ SSL opcional
- ✅ Retry automático
- ✅ Logs de conexão
- ✅ Otimizado para serverless (Vercel)

### Rotas API Atualizadas

Todas as rotas em `app/api/dataconnect/*` agora usam:
```typescript
import { getPool } from '@/lib/db/postgresql';

const pool = getPool();
const client = await pool.connect();
```

---

## 🧪 Testar Conexão

### Localmente

```bash
# Configure as variáveis no .env.local
npm run dev

# Teste a API
curl http://localhost:3000/api/dataconnect/list-tables
```

### No Vercel

Após deploy:
```bash
curl https://seu-app.vercel.app/api/dataconnect/list-tables
```

Resposta esperada:
```json
{
  "success": true,
  "data": [
    {"name": "companies", "documentCount": 3},
    {"name": "departments", "documentCount": 19},
    {"name": "forms", "documentCount": 18},
    {"name": "form_response", "documentCount": 1037},
    {"name": "answer", "documentCount": 7292}
  ]
}
```

---

## 🔍 Troubleshooting

### Erro: ETIMEDOUT

**Causa:** Cloud SQL não está acessível pelo IP do Vercel

**Solução:**
1. Verifique se os IPs do Vercel estão autorizados no Cloud SQL
2. Confirme que `PG_HOST` está correto
3. Teste conexão com `PG_SSL=false` primeiro

### Erro: password authentication failed

**Causa:** Credenciais incorretas

**Solução:**
1. Verifique `PG_USER` e `PG_PASSWORD`
2. Confirme que o usuário `ipanema` existe no Cloud SQL

### Erro: too many connections

**Causa:** Pool de conexões saturado

**Solução:**
1. Reduza `PG_POOL_MAX` para 3-5
2. Aumente `PG_IDLE_TIMEOUT` para liberar conexões mais rápido

### Timeout em queries lentas

**Solução:**
1. Aumente `PG_STATEMENT_TIMEOUT` e `PG_QUERY_TIMEOUT`
2. Otimize queries com índices no PostgreSQL

### Erro: Connection terminated due to connection timeout

**Causa:** Timeout de conexão muito baixo para ambiente serverless do Vercel

**Solução:**
1. Aumente `PG_CONNECTION_TIMEOUT` para 60000 (60 segundos)
2. Reduza `PG_POOL_MAX` para 3 (menos conexões simultâneas)
3. Verifique se os IPs do Vercel estão autorizados no Cloud SQL
4. O sistema agora tem retry automático (3 tentativas com backoff exponencial)

### Erro: Connection terminated unexpectedly

**Causa:** Conexão perdida durante execução de query

**Solução:**
1. Verifique estabilidade da rede entre Vercel e Cloud SQL
2. Aumente `PG_IDLE_TIMEOUT` para 10000
3. Sistema fará retry automático em caso de falha

---

## 📊 Monitoramento

### Logs no Vercel

```bash
vercel logs seu-projeto --follow
```

Procure por:
- ✅ `PostgreSQL client connected`
- ❌ `PostgreSQL pool error`
- ❌ `connect ETIMEDOUT`

### Verificar conexões ativas

No Cloud SQL:
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'formbravo-8854e-database';
```

---

## 🚀 Deploy

```bash
# Commit das alterações
git add .
git commit -m "feat: configure PostgreSQL connection pooling for Vercel"

# Push para deploy automático
git push origin main
```

O Vercel fará deploy automático e usará as variáveis de ambiente configuradas.

---

## 📝 Checklist de Deploy

- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] IPs do Vercel autorizados no Cloud SQL
- [ ] SSL habilitado (`PG_SSL=true`)
- [ ] Connection pool configurado (`PG_POOL_MAX=5`)
- [ ] Teste de conexão bem-sucedido
- [ ] Logs sem erros de timeout
- [ ] Firestore continua funcionando (dual-save)

---

## 🔐 Segurança

### Boas Práticas

1. **Nunca commite credenciais** no código
2. Use **SSL** em produção (`PG_SSL=true`)
3. **Restrinja IPs** no Cloud SQL (apenas Vercel)
4. **Rotacione senhas** periodicamente
5. Use **Cloud SQL Proxy** para acesso local

### Cloud SQL Proxy (Desenvolvimento Local)

```bash
# Download
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.windows.amd64.exe

# Executar
cloud-sql-proxy --port 5432 PROJECT:REGION:INSTANCE

# No .env.local
PG_HOST=127.0.0.1
PG_PORT=5432
```

---

## 📚 Referências

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Cloud SQL Authorized Networks](https://cloud.google.com/sql/docs/postgres/configure-ip)
- [Node.js pg Pool](https://node-postgres.com/features/pooling)
- [Vercel Edge Network IPs](https://vercel.com/docs/concepts/edge-network/regions)

---

*Configuração implementada em Março 2026*
