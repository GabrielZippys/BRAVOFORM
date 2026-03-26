# Quick Start - PostgreSQL no Vercel

## ⚡ Configuração Rápida (5 minutos)

### 1️⃣ Adicionar Variáveis de Ambiente no Vercel

Acesse: https://vercel.com/seu-projeto/settings/environment-variables

Cole estas variáveis:

```bash
PG_HOST=34.39.165.146
PG_PORT=5432
PG_DATABASE=formbravo-8854e-database
PG_USER=ipanema
PG_PASSWORD=Br@v0x00
PG_SSL=true
PG_POOL_MAX=5
PG_POOL_MIN=0
PG_IDLE_TIMEOUT=30000
PG_CONNECTION_TIMEOUT=10000
PG_STATEMENT_TIMEOUT=30000
PG_QUERY_TIMEOUT=30000
```

**Importante:** Selecione **Production**, **Preview** e **Development**.

---

### 2️⃣ Autorizar IPs do Vercel no Cloud SQL

**Google Cloud Console** → **Cloud SQL** → Sua instância → **Connections** → **Networking**

Clique em **Add Network** e adicione:

```
Nome: Vercel US East
IP: 76.76.21.0/24

Nome: Vercel US West  
IP: 76.76.19.0/24
```

**OU** para testes (menos seguro):
```
Nome: Temporary All
IP: 0.0.0.0/0
```

⚠️ **Remova 0.0.0.0/0 após os testes!**

---

### 3️⃣ Deploy no Vercel

```bash
git add .
git commit -m "fix: configure PostgreSQL for Vercel"
git push origin main
```

O Vercel fará deploy automático.

---

### 4️⃣ Testar Conexão

Após o deploy, acesse:

```
https://seu-app.vercel.app/api/dataconnect/test
```

**Resposta esperada (sucesso):**
```json
{
  "success": true,
  "message": "✅ PostgreSQL connection successful",
  "connection": {
    "host": "34.39.165.146",
    "database": "formbravo-8854e-database",
    "connectionTime": "250ms"
  },
  "database": {
    "totalTables": 5,
    "totalRecords": 8351
  }
}
```

**Se der erro ETIMEDOUT:**
- Verifique se os IPs do Vercel estão autorizados no Cloud SQL (Passo 2)
- Aguarde 2-3 minutos após adicionar os IPs

---

## 🧪 Teste Local (Opcional)

### Copiar variáveis para .env.local

Abra o arquivo `env.postgresql.txt` e copie o conteúdo para `.env.local`:

```bash
# No terminal
cat env.postgresql.txt >> .env.local
```

### Executar localmente

```bash
npm run dev
```

Acesse: http://localhost:3000/api/dataconnect/test

---

## ✅ Checklist de Verificação

- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] IPs do Vercel autorizados no Cloud SQL  
- [ ] Deploy realizado com sucesso
- [ ] Teste de conexão retornou `success: true`
- [ ] Logs sem erros de timeout

---

## 🔧 Troubleshooting Rápido

### Erro: ETIMEDOUT
**Solução:** Adicione os IPs do Vercel no Cloud SQL (Passo 2)

### Erro: password authentication failed
**Solução:** Verifique `PG_USER` e `PG_PASSWORD` no Vercel

### Erro: too many connections
**Solução:** Reduza `PG_POOL_MAX` para 3

---

## 📚 Documentação Completa

Para mais detalhes, consulte: `docs/VERCEL_CLOUD_SQL_SETUP.md`

---

*Configuração implementada em Março 2026*
