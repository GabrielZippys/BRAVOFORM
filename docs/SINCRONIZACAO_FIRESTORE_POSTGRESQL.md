# 🔄 Sincronização Firestore → PostgreSQL

## 📋 Visão Geral

Script Python para sincronizar dados do Firestore para PostgreSQL automaticamente, permitindo análise avançada no Power BI com estrutura relacional.

---

## ✅ **Pré-requisitos**

1. **Python 3.8+** instalado
2. **Credenciais Firebase** (`firebase_cred.json`)
3. **PostgreSQL Cloud SQL** configurado e acessível
4. **Tabelas PostgreSQL** criadas (já feito via `setup-db.ps1`)

---

## 🚀 **Instalação**

### **1. Instalar dependências Python:**

```powershell
cd c:\Users\OptiPlex 7080\Desktop\BRAVOFORM\scripts
pip install -r requirements.txt
```

### **2. Configurar credenciais Firebase:**

Coloque o arquivo `firebase_cred.json` na pasta `scripts/` ou raiz do projeto.

### **3. Configurar variáveis de ambiente (opcional):**

Crie arquivo `.env.local` na pasta `scripts/`:

```env
# PostgreSQL
PG_HOST=34.39.165.146
PG_PORT=5432
PG_DATABASE=formbravo-8854e-database
PG_USER=ipanema
PG_PASSWORD=Brav0x00

# Firestore
FIREBASE_PROJECT_ID=formbravo-8854e

# Sincronização
DAYS_TO_SYNC=30
LOG_LEVEL=INFO
```

---

## 🔧 **Uso**

### **Sincronização Manual:**

```powershell
cd c:\Users\OptiPlex 7080\Desktop\BRAVOFORM\scripts
python sync-firestore-to-postgresql.py
```

### **Saída esperada:**

```
2026-03-25 13:00:00 | INFO    | Firestore conectado | project_id=formbravo-8854e
2026-03-25 13:00:01 | INFO    | Sincronizando respostas dos últimos 30 dias
2026-03-25 13:00:05 | INFO    | Form form-001: 150 respostas coletadas
2026-03-25 13:00:08 | INFO    | Form form-002: 85 respostas coletadas
2026-03-25 13:00:10 | INFO    | Total: 235 respostas, 1420 answers
2026-03-25 13:00:11 | INFO    | Deletados: 220 respostas, 1350 answers (modo incremental)
2026-03-25 13:00:15 | INFO    | Inseridas 235 respostas
2026-03-25 13:00:18 | INFO    | Inseridas 1420 answers
2026-03-25 13:00:18 | INFO    | === SINCRONIZAÇÃO CONCLUÍDA | tempo=18.45s ===
```

---

## ⚙️ **Configurações**

### **DAYS_TO_SYNC** (padrão: 30)
- Sincroniza apenas respostas dos últimos N dias
- Reduz carga e tempo de processamento
- Modo incremental: deleta e reinsere apenas dados recentes

### **LOG_LEVEL** (padrão: INFO)
- `DEBUG`: Logs detalhados
- `INFO`: Logs normais
- `WARNING`: Apenas avisos e erros
- `ERROR`: Apenas erros

---

## 📊 **Estrutura de Dados**

### **Tabela: form_response**
Dados principais de cada resposta:
- `id`, `form_id`, `form_title`
- `company_id`, `department_id`, `department_name`
- `collaborator_id`, `collaborator_username`
- `status`, `submitted_at`, `created_at`

### **Tabela: answer**
Respostas individuais normalizadas:
- `response_id` (FK → form_response)
- `field_id`, `field_label`, `field_type`
- `answer_text`, `answer_number`, `answer_date`, `answer_boolean`

### **Relacionamento:**
```
form_response (1) → (*) answer
  form_response.id = answer.response_id
```

---

## 🔄 **Automação**

### **Windows Task Scheduler:**

1. Abra **Task Scheduler** (Agendador de Tarefas)
2. Crie nova tarefa:
   - **Nome:** Sync Firestore to PostgreSQL
   - **Trigger:** Diariamente às 02:00
   - **Action:** Executar programa
     - **Program:** `python`
     - **Arguments:** `sync-firestore-to-postgresql.py`
     - **Start in:** `c:\Users\OptiPlex 7080\Desktop\BRAVOFORM\scripts`

### **Cron (Linux/Mac):**

```bash
# Executar diariamente às 02:00
0 2 * * * cd /path/to/BRAVOFORM/scripts && python sync-firestore-to-postgresql.py
```

---

## 📈 **Uso no Power BI**

Após sincronização, os dados estarão disponíveis no Power BI via ODBC:

1. **Atualizar dados:** Power BI → Atualizar
2. **Dados sempre atuais:** Configure refresh automático
3. **Relacionamentos:** Já criados entre tabelas

### **Exemplo de DAX:**

```dax
Total Respostas = COUNT(form_response[id])

Respostas Aprovadas = 
CALCULATE(
    COUNT(form_response[id]),
    form_response[status] = "approved"
)

Valor Total = 
SUMX(
    FILTER(answer, answer[field_type] = "number"),
    answer[answer_number]
)
```

---

## 🐛 **Troubleshooting**

### **Erro: "Credenciais do Firebase não encontradas"**
- Verifique se `firebase_cred.json` está na pasta `scripts/`
- Ou defina `GOOGLE_APPLICATION_CREDENTIALS` no `.env.local`

### **Erro: "connection refused" PostgreSQL**
- Verifique se IP está autorizado no Cloud SQL
- Confirme credenciais (user/password)
- Teste conexão: `psql -h 34.39.165.146 -U ipanema -d formbravo-8854e-database`

### **Erro: "duplicate key value violates unique constraint"**
- Modo incremental falhou
- Execute com `DAYS_TO_SYNC=0` para reprocessar tudo
- Ou execute `TRUNCATE TABLE answer, form_response` antes

### **Performance lenta**
- Reduza `DAYS_TO_SYNC` (ex: 7 dias)
- Execute em horário de baixo tráfego
- Aumente `page_size` no `execute_batch` (linha 234)

---

## 📝 **Logs**

Logs são salvos em: `scripts/logs/etl_firestore_to_postgresql.log`

- **Rotação automática:** 5MB por arquivo, 3 backups
- **Formato:** `timestamp | level | mensagem`
- **Útil para:** Debug, auditoria, monitoramento

---

## 🔐 **Segurança**

### **Boas práticas:**

1. ✅ **Não commite** `firebase_cred.json` no Git
2. ✅ **Não commite** `.env.local` com senhas
3. ✅ **Use variáveis de ambiente** em produção
4. ✅ **Restrinja IPs** autorizados no Cloud SQL
5. ✅ **Rotacione senhas** periodicamente

### **Arquivo `.gitignore`:**

```
firebase_cred.json
.env.local
scripts/logs/
*.log
__pycache__/
```

---

## 📊 **Comparação: Python vs API REST**

| Característica | Python Script | API REST |
|----------------|---------------|----------|
| **Performance** | ⚡ Excelente | 🐢 Boa |
| **Volume de dados** | ✅ Ilimitado | ⚠️ Até 100k registros |
| **Automação** | ✅ Task Scheduler | ⚠️ Requer trigger externo |
| **Estrutura relacional** | ✅ Completa | ❌ JSON achatado |
| **Manutenção** | ⚠️ Requer Python | ✅ Zero config |
| **Ideal para** | Produção, grandes volumes | Testes, demos |

---

## 🎯 **Recomendação**

**Use Python Script** para:
- ✅ Produção
- ✅ Grandes volumes (>10k respostas)
- ✅ Análises complexas no Power BI
- ✅ Automação diária/semanal

**Use API REST** para:
- ✅ Testes rápidos
- ✅ Demos
- ✅ Volumes pequenos (<1k respostas)

---

**Última atualização:** 25/03/2026
