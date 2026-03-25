# 📊 Guia Simples: Power BI com BravoForm

## 🎯 Conexão Simplificada (SEM configuração ODBC)

Este guia mostra como conectar o Power BI ao BravoForm de forma **simples e direta**, sem precisar configurar drivers, ODBC ou PostgreSQL.

---

## ✅ **Método Simples: API REST**

### **Passo 1: Abrir Power BI Desktop**

1. Abra o **Power BI Desktop**
2. Clique em **"Obter Dados"** (Get Data)
3. Procure por **"Web"**
4. Clique em **"Conectar"**

### **Passo 2: Inserir URL da API**

Na janela que abrir, cole esta URL:

```
https://bravoform.vercel.app/api/powerbi/responses
```

Clique em **"OK"**

### **Passo 3: Autenticar (se necessário)**

Se pedir autenticação:
- Selecione **"Anônimo"**
- Clique em **"Conectar"**

### **Passo 4: Carregar Dados**

O Power BI vai mostrar os dados em formato JSON. Clique em:
- **"Para Tabela"** (To Table)
- **"Expandir"** (Expand) para ver todas as colunas
- **"Carregar"** (Load)

Pronto! Os dados estão no Power BI.

---

## 🔍 **Filtros Opcionais**

Você pode filtrar os dados adicionando parâmetros na URL:

### **Filtrar por Empresa:**
```
https://bravoform.vercel.app/api/powerbi/responses?companyId=ABC123
```

### **Filtrar por Departamento:**
```
https://bravoform.vercel.app/api/powerbi/responses?departmentId=DEP456
```

### **Filtrar por Formulário:**
```
https://bravoform.vercel.app/api/powerbi/responses?formId=FORM789
```

### **Filtrar por Data:**
```
https://bravoform.vercel.app/api/powerbi/responses?startDate=2026-01-01&endDate=2026-12-31
```

### **Combinar Filtros:**
```
https://bravoform.vercel.app/api/powerbi/responses?companyId=ABC123&startDate=2026-01-01
```

---

## 📊 **Estrutura dos Dados**

Os dados retornados incluem:

### **Campos Principais:**
- `id` - ID único da resposta
- `formId` - ID do formulário
- `formTitle` - Título do formulário
- `companyId` - ID da empresa
- `departmentId` - ID do departamento
- `departmentName` - Nome do departamento
- `collaboratorId` - ID do colaborador
- `collaboratorUsername` - Nome do colaborador
- `status` - Status (submitted, approved, rejected, pending)
- `currentStageId` - Estágio atual do workflow
- `assignedTo` - Atribuído para
- `createdAt` - Data de criação (ISO 8601)
- `submittedAt` - Data de submissão (ISO 8601)
- `deletedAt` - Data de exclusão (se aplicável)
- `deletedBy` - Quem deletou
- `deletedByUsername` - Nome de quem deletou

### **Campos de Respostas:**
- `answer_[campo]` - Cada resposta do formulário vira uma coluna

---

## 🔄 **Atualização Automática**

Para atualizar os dados automaticamente:

1. No Power BI Desktop, vá em **"Página Inicial"** → **"Atualizar"**
2. Ou configure atualização agendada no Power BI Service

---

## 📈 **Exemplos de Visualizações**

### **Dashboard Básico:**

1. **Total de Respostas** (KPI)
   - Medida: `COUNT(id)`

2. **Respostas por Status** (Gráfico de Pizza)
   - Eixo: `status`
   - Valores: `COUNT(id)`

3. **Respostas por Departamento** (Gráfico de Barras)
   - Eixo: `departmentName`
   - Valores: `COUNT(id)`

4. **Tendência ao Longo do Tempo** (Gráfico de Linha)
   - Eixo X: `submittedAt` (por mês)
   - Eixo Y: `COUNT(id)`

5. **Top Colaboradores** (Tabela)
   - Colunas: `collaboratorUsername`, `COUNT(id)`
   - Ordenar por: `COUNT(id)` DESC

---

## ⚡ **Vantagens desta Abordagem**

✅ **Simples** - Apenas uma URL, sem configurações
✅ **Rápido** - Conecta em segundos
✅ **Seguro** - API autenticada e controlada
✅ **Atualizado** - Dados sempre atuais do Firestore
✅ **Sem instalação** - Não precisa instalar drivers
✅ **Funciona em qualquer lugar** - Qualquer máquina com Power BI

---

## 🆚 **Comparação: API REST vs ODBC PostgreSQL**

| Característica | API REST (Simples) | ODBC PostgreSQL (Complexo) |
|----------------|-------------------|---------------------------|
| **Configuração** | 1 URL | Driver + DSN + Firewall + IP |
| **Tempo setup** | 2 minutos | 30+ minutos |
| **Conhecimento técnico** | Básico | Avançado |
| **Manutenção** | Zero | Alta |
| **Funciona em qualquer PC** | ✅ Sim | ❌ Precisa configurar cada PC |
| **Dados em tempo real** | ✅ Sim | ✅ Sim |
| **Performance** | Boa | Excelente |

---

## 🎯 **Recomendação**

**Use API REST (este guia)** para:
- ✅ Usuários não técnicos
- ✅ Setup rápido
- ✅ Múltiplos usuários
- ✅ Dados até 100k registros

**Use ODBC PostgreSQL** apenas se:
- ⚠️ Precisa de performance extrema
- ⚠️ Tem mais de 1 milhão de registros
- ⚠️ Tem equipe técnica para manter

---

## 📞 **Suporte**

Se tiver problemas:
1. Verifique se a URL está correta
2. Teste a URL no navegador primeiro
3. Confirme que tem acesso à internet
4. Verifique se o Power BI está atualizado

---

## 🚀 **Começar Agora**

1. Abra Power BI Desktop
2. Get Data → Web
3. Cole: `https://bravoform.vercel.app/api/powerbi/responses`
4. Clique em OK
5. Pronto! 🎉

---

**Última atualização:** 25/03/2026
