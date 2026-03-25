# 📊 Guia de Integração Power BI com Firebase Data Connect

## 🎯 Objetivo

Este guia explica como conectar o Power BI ao banco de dados PostgreSQL (Firebase Data Connect) para criar relatórios e dashboards a partir das respostas dos formulários do BravoForm.

---

## ✅ Vantagens da Integração

### **Antes (Firestore - NoSQL/JSON):**
- ❌ Dados em formato JSON aninhado
- ❌ Difícil de criar relacionamentos
- ❌ Queries complexas para agregações
- ❌ Performance limitada para grandes volumes

### **Depois (PostgreSQL - Relacional):**
- ✅ Dados em tabelas relacionais
- ✅ Fácil criar relacionamentos (JOINs)
- ✅ Queries SQL otimizadas
- ✅ Performance excelente para análises
- ✅ Compatibilidade nativa com Power BI

---

## 📋 Estrutura do Banco de Dados

### **Tabelas Principais:**

#### 1. **form_response** - Respostas de formulários
```sql
- id (String) - ID único da resposta
- form_id (String) - ID do formulário
- form_title (String) - Título do formulário
- company_id (String) - ID da empresa
- department_id (String) - ID do departamento
- department_name (String) - Nome do departamento
- collaborator_id (String) - ID do colaborador
- collaborator_username (String) - Nome do colaborador
- status (String) - Status (submitted, approved, rejected, pending)
- current_stage_id (String) - Estágio atual do workflow
- assigned_to (String) - Atribuído para
- created_at (Timestamp) - Data de criação
- submitted_at (Timestamp) - Data de submissão
- deleted_at (Timestamp) - Data de exclusão (se aplicável)
- deleted_by (String) - Quem deletou
```

#### 2. **answer** - Respostas individuais (normalizada)
```sql
- id (UUID) - ID único
- response_id (String) - FK para form_response
- field_id (String) - ID do campo
- field_label (String) - Label do campo
- field_type (String) - Tipo do campo
- answer_text (String) - Resposta em texto
- answer_number (Float) - Resposta numérica
- answer_date (Date) - Resposta de data
- answer_boolean (Boolean) - Resposta sim/não
- created_at (Timestamp) - Data de criação
```

#### 3. **attachment** - Anexos (arquivos, assinaturas)
```sql
- id (UUID) - ID único
- response_id (String) - FK para form_response
- field_id (String) - ID do campo
- file_url (String) - URL do arquivo
- file_name (String) - Nome do arquivo
- file_type (String) - Tipo do arquivo
- file_size (Int) - Tamanho em bytes
- created_at (Timestamp) - Data de criação
```

#### 4. **workflow_history** - Histórico de workflow
```sql
- id (UUID) - ID único
- response_id (String) - FK para form_response
- stage_id (String) - ID do estágio
- stage_name (String) - Nome do estágio
- action (String) - Ação realizada
- performed_by (String) - Quem realizou
- performed_by_username (String) - Nome de quem realizou
- comment (String) - Comentário
- created_at (Timestamp) - Data de criação
```

#### 5. **table_item** - Itens de grade/tabela
```sql
- id (UUID) - ID único
- response_id (String) - FK para form_response
- field_id (String) - ID do campo
- row_index (Int) - Índice da linha
- column_id (String) - ID da coluna
- column_label (String) - Label da coluna
- value (String) - Valor
- created_at (Timestamp) - Data de criação
```

---

## 🔌 Como Conectar o Power BI

### **Passo 1: Obter Credenciais do PostgreSQL**

1. Acesse o **Firebase Console**: https://console.firebase.google.com
2. Selecione o projeto **FORMBRAVO**
3. Vá em **Data Connect** → **Dados**
4. Clique em **"Ver detalhes da conexão"** ou **"Connection details"**
5. Copie as informações:
   - **Host:** `[IP ou hostname do Cloud SQL]`
   - **Port:** `5432` (padrão PostgreSQL)
   - **Database:** `formbravo-8854e-database`
   - **User:** `[usuário do Cloud SQL]`
   - **Password:** `[senha do Cloud SQL]`

### **Passo 2: Conectar no Power BI Desktop**

1. Abra o **Power BI Desktop**
2. Clique em **"Obter Dados"** → **"Mais..."**
3. Procure por **"PostgreSQL database"**
4. Clique em **"Conectar"**

### **Passo 3: Configurar Conexão**

Na janela de conexão PostgreSQL:

```
Servidor: [Host do Cloud SQL]
Banco de dados: formbravo-8854e-database
Modo de Conectividade de Dados: Import (ou DirectQuery para dados em tempo real)
```

Clique em **OK**.

### **Passo 4: Autenticar**

1. Selecione **"Banco de dados"** (Database)
2. Digite:
   - **Nome de usuário:** `[usuário do Cloud SQL]`
   - **Senha:** `[senha do Cloud SQL]`
3. Clique em **"Conectar"**

### **Passo 5: Selecionar Tabelas**

Na janela do Navegador, você verá as tabelas:
- ✅ `form_response`
- ✅ `answer`
- ✅ `attachment`
- ✅ `workflow_history`
- ✅ `table_item`

Selecione as tabelas que deseja usar e clique em **"Carregar"** ou **"Transformar Dados"**.

---

## 📊 Exemplos de Queries Úteis para Power BI

### **1. Respostas por Departamento (últimos 30 dias)**

```sql
SELECT 
    department_name,
    COUNT(*) as total_respostas,
    COUNT(CASE WHEN status = 'approved' THEN 1 END) as aprovadas,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejeitadas,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendentes
FROM form_response
WHERE submitted_at >= CURRENT_DATE - INTERVAL '30 days'
    AND deleted_at IS NULL
GROUP BY department_name
ORDER BY total_respostas DESC;
```

### **2. Respostas por Formulário**

```sql
SELECT 
    form_title,
    COUNT(*) as total_respostas,
    MIN(submitted_at) as primeira_resposta,
    MAX(submitted_at) as ultima_resposta
FROM form_response
WHERE deleted_at IS NULL
GROUP BY form_title
ORDER BY total_respostas DESC;
```

### **3. Análise de Respostas Textuais**

```sql
SELECT 
    fr.form_title,
    a.field_label,
    a.answer_text,
    fr.submitted_at,
    fr.collaborator_username
FROM answer a
JOIN form_response fr ON a.response_id = fr.id
WHERE a.field_type = 'text'
    AND fr.deleted_at IS NULL
ORDER BY fr.submitted_at DESC;
```

### **4. Tempo Médio por Estágio de Workflow**

```sql
SELECT 
    stage_name,
    COUNT(*) as total_passagens,
    AVG(EXTRACT(EPOCH FROM (
        LEAD(created_at) OVER (PARTITION BY response_id ORDER BY created_at) - created_at
    )) / 3600) as horas_medias
FROM workflow_history
GROUP BY stage_name
ORDER BY horas_medias DESC;
```

### **5. Top Colaboradores por Volume de Respostas**

```sql
SELECT 
    collaborator_username,
    department_name,
    COUNT(*) as total_respostas,
    COUNT(CASE WHEN status = 'approved' THEN 1 END) as aprovadas
FROM form_response
WHERE deleted_at IS NULL
    AND submitted_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY collaborator_username, department_name
ORDER BY total_respostas DESC
LIMIT 10;
```

---

## 🎨 Criando Relacionamentos no Power BI

### **Relacionamentos Recomendados:**

```
form_response (1) → (*) answer
  Chave: form_response.id = answer.response_id

form_response (1) → (*) attachment
  Chave: form_response.id = attachment.response_id

form_response (1) → (*) workflow_history
  Chave: form_response.id = workflow_history.response_id

form_response (1) → (*) table_item
  Chave: form_response.id = table_item.response_id
```

---

## 📈 Dashboards Sugeridos

### **Dashboard 1: Visão Geral**
- Total de respostas (KPI)
- Respostas por status (gráfico de pizza)
- Respostas por departamento (gráfico de barras)
- Tendência de respostas ao longo do tempo (gráfico de linha)

### **Dashboard 2: Análise de Formulários**
- Formulários mais utilizados (gráfico de barras)
- Taxa de aprovação por formulário (gráfico de barras empilhadas)
- Tempo médio de resposta (KPI)

### **Dashboard 3: Performance de Colaboradores**
- Top 10 colaboradores (tabela)
- Respostas por colaborador ao longo do tempo (gráfico de linha)
- Taxa de aprovação por colaborador (gráfico de barras)

### **Dashboard 4: Workflow**
- Respostas por estágio (funil)
- Tempo médio em cada estágio (gráfico de barras)
- Gargalos identificados (tabela)

---

## 🔄 Atualização de Dados

### **Modo Import (Recomendado para maioria dos casos):**
- Dados são carregados no Power BI
- Melhor performance
- Agende atualizações automáticas (ex: a cada hora)

### **Modo DirectQuery (Para dados em tempo real):**
- Consulta direto no PostgreSQL
- Sempre atualizado
- Pode ser mais lento com grandes volumes

---

## 🛠️ Troubleshooting

### **Erro: "Não é possível conectar ao servidor"**
- Verifique se o IP do Cloud SQL está correto
- Confirme que o firewall permite conexões da sua rede
- Teste a conexão usando um cliente PostgreSQL (pgAdmin, DBeaver)

### **Erro: "Autenticação falhou"**
- Verifique usuário e senha
- Confirme que o usuário tem permissões no banco

### **Performance lenta:**
- Use modo Import em vez de DirectQuery
- Crie índices nas colunas mais consultadas
- Limite o período de dados (ex: últimos 90 dias)

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs no Firebase Console → Data Connect → Monitoramento
2. Consulte a documentação do Firebase Data Connect
3. Entre em contato com o suporte técnico

---

## 🎯 Próximos Passos

1. ✅ Conectar Power BI ao PostgreSQL
2. ✅ Criar relacionamentos entre tabelas
3. ✅ Desenvolver dashboards iniciais
4. ✅ Agendar atualizações automáticas
5. ✅ Compartilhar relatórios com a equipe

---

**Última atualização:** 25/03/2026
