# Planejamento do Banco de Dados PostgreSQL — BravoForm
> Documento vivo de arquitetura analítica. Cobre estrutura atual, problemas identificados e plano de migração para um modelo otimizado para Power BI (motor VertiPaq).

---

## PARTE 1 — ESTRUTURA ATUAL

### 1.1 Como os dados fluem hoje

```
Colaborador preenche formulário
        |
        v
  [Firebase Firestore]  ← fonte da verdade (jamais alterar pelo PostgreSQL)
        |
        |── dual-write fire-and-forget (dualSaveService.ts → /api/dataconnect)
        |   ⚠️  Risco: falha silenciosa — veja Problema P6
        |
        v
  [PostgreSQL Cloud SQL] ← banco analítico (leitura via Power BI)
        |
        v
  [Script Python sync-firestore-to-postgresql.py]
        (sincronização periódica completa — mitigação do risco acima)
```

**Regras:**
- Firestore é a fonte da verdade — aplicação jamais lê do PostgreSQL
- PostgreSQL é somente leitura analítica (Power BI, dashboards, relatórios)
- Falha no PostgreSQL não impede o colaborador de enviar formulário

---

### 1.2 Tabelas em Produção

> Tabelas legado (`companies`, `departments`, `forms`, `form_response`, `answer`, `collaborators`, `users`, `products`, `product_catalogs`) foram **removidas** em 30/03/2026 após migração completa. Script: `scripts/sql/002_drop_legacy_tables.sql`

| Tabela | Registros (30/03/2026) | Tipo |
|--------|----------------------|------|
| `dim_companies` | 3 | Dimensão |
| `dim_departments` | 19 | Dimensão |
| `dim_users` | 2 | Dimensão |
| `dim_collaborators` | 38 | Dimensão |
| `dim_forms` | 18 | Dimensão |
| `dim_product_catalogs` | 12 | Dimensão |
| `dim_products` | 462 | Dimensão |
| `dim_workflow_stages` | 4 | Dimensão |
| `fact_form_response` | 2.547 | Fato |
| `fact_answers` | 409 | Fato (somente campos simples, sem Cabeçalho/vazios) |
| `fact_order_items` | 111 | Fato (48 com product_key) |
| `fact_checkbox_answers` | 20 | Fato |
| `fact_table_answers` | 15.704 | Fato (1 linha/campo tabela, JSONB completo) |
| `fact_attachments` | 26 | Fato (assinaturas base64) |
| `fact_workflow_history` | 0 | Fato (workflow inativo) |

#### Views para Power BI
| View | Descrição |
|------|-----------|
| `vw_respostas_planas` | Campos simples, uma linha por campo respondido |
| `vw_pedidos_produtos` | Grade de pedidos com snapshot de preço e produto |
| `vw_sla_workflow` | Análise de SLA por etapa de workflow |

---

### 1.3 Schema Atual Resumido (como está hoje)

Todas as tabelas usam o ID do Firebase como PK (VARCHAR(255)). Exemplo:

```
companies.id = "apetito-foods"           ← string aleatória
form_response.company_id = "apetito-foods" ← JOIN por string
```

Este padrão funciona, mas tem custo de performance no Power BI (VertiPaq comprime mal strings aleatórias).

---

### 1.4 Tipos de Campo e Como São Salvos Hoje

#### Campos simples — funcionam bem

| FieldType | inputType | Coluna preenchida | Valor exemplo |
|-----------|-----------|-------------------|---------------|
| Texto | text | answer_text | "Empresa ABC" |
| Texto | paragraph | answer_text | "Texto longo..." |
| Texto | number | answer_text + answer_number | "42" / 42 |
| Texto | decimal | answer_text + answer_number | "15.50" / 15.50 |
| Texto | email | answer_text | "x@apetito.com" |
| Texto | tel | answer_text | "(11) 99999-9999" |
| Data | — | answer_text + answer_date | "2026-03-30" / 2026-03-30 |
| Múltipla Escolha | radio / dropdown | answer_text | "Aberto" |
| Cabeçalho | — | **não salva** | visual only |

#### Campos problemáticos — salvam JSON blob

| FieldType | O que chega em answer_text | Problema |
|-----------|---------------------------|----------|
| Caixa de Seleção | `'["Opção A","Opção C"]'` | Não filtra por opção no Power BI |
| Tabela | `'{"row_seg":{"col_ab":"Aberto",...},...}'` | Impossível pivot ou filtro por célula |
| Grade de Pedidos | `'[{"productId":"x","quantity":50,...},...]'` | Impossível somar, rankear produtos |
| Assinatura | `'data:image/png;base64,iVBOR...'` | 50–200KB por linha, inútil para análise |
| Anexo | `'https://storage.googleapis.com/...'` | OK (só URL) |

---

### 1.5 Dados de Workflow (existem no Firestore, ausentes no PostgreSQL)

**`/workflows/{id}`** — Definição
```
id, name, description, isActive
stages[] → { id, name, stageType, order, isFinalStage, allowedRoles[], requireComment }
```

**`/workflow_instances/{id}`** — Execução
```
id, workflowId, workflowName
currentStageId, assignedTo, assignedToName
status: in_progress | completed | cancelled | rejected
startedAt, completedAt
stageHistory[] → { stageId, stageName, enteredAt, completedAt, action, comment, duration }
```

**`/forms/{id}/responses/{id}.workflowHistory[]`** — Inline na resposta
```
id, stageId, previousStageId, changedBy, changedAt, comment, actionType
```

> Esses dados permitem análise de SLA, gargalos, taxa de rejeição — e hoje estão **completamente perdidos** para o Power BI.

---

## PARTE 2 — PROBLEMAS IDENTIFICADOS

| # | Severidade | Problema | Impacto |
|---|------------|----------|---------|
| P1 | 🔴 Crítico | Tabela, Grade, Checkbox salvam como JSON blob | Impossível analisar no Power BI sem transformação complexa |
| P2 | 🔴 Crítico | IDs Firebase (string) usados como FK nos JOINs | Performance ruim no VertiPaq — arquivo .pbix pesado |
| P3 | 🟠 Alto | `field_type` não tem granularidade de subtipo | Não distingue número de texto, e-mail de telefone |
| P4 | 🟠 Alto | `field_label` às vezes retorna o hash do field_id | Campo aparece como "xBhRswtdvO6Xxtz" no Power BI |
| P5 | 🟠 Alto | Assinatura salva base64 (~100KB/linha) | Infla o banco, inútil para análise |
| P6 | 🟠 Alto | Dual-write fire-and-forget pode ter perda silenciosa | Formulário existe no app mas não no Power BI |
| P7 | 🟡 Médio | Workflow completamente ausente no PostgreSQL | SLA, gargalos, aprovações: impossível analisar |
| P8 | 🟡 Médio | `fields_json` não é JSON válido (dump Python `str()`) | Não funciona como JSONB, impossível fazer queries |
| P9 | 🟢 Baixo | Sem surrogate keys nas tabelas dimensão | Relacionamentos lentos conforme volume cresce |

---

## PARTE 3 — MODELO PROPOSTO (Star Schema + Surrogate Keys)

### 3.1 Princípios da Arquitetura

**Princípio 1 — Surrogate Keys (Chaves Substitutas)**

O motor VertiPaq do Power BI comprime inteiros com altíssima eficiência. Strings aleatórias como "hpwFnAXxpfQUbSOqFpbN" não comprimem bem.

Solução: cada tabela terá dois identificadores:
- `*_key` → `SERIAL` inteiro, PK real, usado nos JOINs e FKs do Power BI
- `firebase_id` → `VARCHAR(255)`, mantido com índice UNIQUE, usado pelo script Python para UPSERT

```sql
-- Antes (atual)
companies.id = "apetito-foods"                     ← PK string
form_response.company_id = "apetito-foods"          ← FK string — lento

-- Depois (proposto)
companies.company_key = 1                           ← PK inteiro
companies.firebase_id = "apetito-foods"             ← só para sync
form_response.company_key = 1                       ← FK inteiro — rápido
```

**Princípio 2 — Star Schema (Esquema Estrela)**

Tabelas divididas em dois tipos:
- **Dimensões** (`dim_*`): cadastros, características, filtros — sem duplicatas
- **Fatos** (`fact_*`): transações, eventos, métricas — muitas linhas

**Princípio 3 — Snapshot em dados transacionais**

Preço, nome de produto e qualquer dado que pode mudar no catálogo deve ser copiado no momento da resposta. Se o preço do produto mudar amanhã, os pedidos do passado não podem mudar.

**Princípio 4 — JSONB para dados estruturados complexos**

Em vez de explodir o campo Tabela em 50 linhas `table_cell` (10 linhas × 5 colunas = 50 registros por resposta), salvar como `JSONB` no PostgreSQL e criar Views com `crosstab()` ou extração direta. O banco processa, não o Power BI.

---

### 3.2 Tabelas Dimensão (Star Schema)

---

#### `dim_companies`
```sql
CREATE TABLE dim_companies (
    company_key  SERIAL       PRIMARY KEY,   -- PK inteiro para Power BI
    firebase_id  VARCHAR(255) UNIQUE NOT NULL, -- ID Firestore para sync
    name         VARCHAR(500) NOT NULL,
    created_at   TIMESTAMP
);
```

---

#### `dim_departments`
```sql
CREATE TABLE dim_departments (
    department_key  SERIAL       PRIMARY KEY,
    firebase_id     VARCHAR(255) UNIQUE NOT NULL,
    company_key     INTEGER      REFERENCES dim_companies(company_key),
    name            VARCHAR(500) NOT NULL,
    created_at      TIMESTAMP
);
```

---

#### `dim_users`
Admins e gestores que configuram o sistema.
```sql
CREATE TABLE dim_users (
    user_key     SERIAL       PRIMARY KEY,
    firebase_id  VARCHAR(255) UNIQUE NOT NULL,
    name         VARCHAR(500),
    email        VARCHAR(500),
    role         VARCHAR(100),    -- 'Admin' | 'Manager'
    company_key  INTEGER REFERENCES dim_companies(company_key),
    created_at   TIMESTAMP
);
```

---

#### `dim_collaborators`
Colaboradores que preenchem os formulários.
```sql
CREATE TABLE dim_collaborators (
    collaborator_key  SERIAL       PRIMARY KEY,
    firebase_id       VARCHAR(255) UNIQUE NOT NULL,
    uid               VARCHAR(255),    -- UID Firebase Auth
    username          VARCHAR(500) NOT NULL,
    name              VARCHAR(500),
    email             VARCHAR(500),
    role              VARCHAR(100) DEFAULT 'collaborator',
    active            BOOLEAN      DEFAULT TRUE,
    company_key       INTEGER REFERENCES dim_companies(company_key),
    department_key    INTEGER REFERENCES dim_departments(department_key),
    department_name   VARCHAR(255),
    can_view_history  BOOLEAN DEFAULT FALSE,
    can_edit_history  BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMP
);
```

---

#### `dim_forms`
Metadados dos formulários criados pelos admins.
```sql
CREATE TABLE dim_forms (
    form_key       SERIAL       PRIMARY KEY,
    firebase_id    VARCHAR(255) UNIQUE NOT NULL,
    title          VARCHAR(500) NOT NULL,
    description    TEXT,
    company_key    INTEGER REFERENCES dim_companies(company_key),
    department_key INTEGER REFERENCES dim_departments(department_key),
    department_name VARCHAR(255),
    is_active      BOOLEAN      DEFAULT TRUE,
    fields_json    JSONB,           -- JSON válido (não str() Python)
    created_at     TIMESTAMP,
    updated_at     TIMESTAMP
);
CREATE INDEX idx_dim_forms_fields ON dim_forms USING GIN(fields_json);
```

> `fields_json` como `JSONB` com índice GIN permite queries como:
> `SELECT * FROM dim_forms WHERE fields_json @> '[{"type":"Grade de Pedidos"}]'`

---

#### `dim_product_catalogs`
```sql
CREATE TABLE dim_product_catalogs (
    catalog_key    SERIAL       PRIMARY KEY,
    firebase_id    VARCHAR(255) UNIQUE NOT NULL,
    name           VARCHAR(500) NOT NULL,
    description    TEXT,
    company_key    INTEGER REFERENCES dim_companies(company_key),
    display_field  VARCHAR(255),
    created_at     TIMESTAMP
);
```

---

#### `dim_products`
```sql
CREATE TABLE dim_products (
    product_key     SERIAL       PRIMARY KEY,
    firebase_id     VARCHAR(255) UNIQUE NOT NULL,
    catalog_key     INTEGER      REFERENCES dim_product_catalogs(catalog_key),
    name            VARCHAR(500) NOT NULL,
    codigo          VARCHAR(255),
    ean             VARCHAR(255),
    unidade         VARCHAR(50),
    quantidade_max  INTEGER,
    quantidade_min  INTEGER,
    preco_atual     NUMERIC(12,2),   -- preço ATUAL (pode mudar — não usar para análise histórica)
    estoque         INTEGER,
    company_key     INTEGER REFERENCES dim_companies(company_key),
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);
CREATE INDEX idx_dim_products_catalog ON dim_products(catalog_key);
CREATE INDEX idx_dim_products_codigo ON dim_products(codigo);
```

---

#### `dim_workflow_stages` *(NOVA)*
```sql
CREATE TABLE dim_workflow_stages (
    stage_key       SERIAL       PRIMARY KEY,
    firebase_id     VARCHAR(255) UNIQUE NOT NULL,   -- ID da etapa
    workflow_fb_id  VARCHAR(255) NOT NULL,           -- ID do workflow pai
    workflow_name   VARCHAR(500),
    stage_name      VARCHAR(255) NOT NULL,
    stage_type      VARCHAR(50),     -- 'validation' | 'execution' | 'wait' | 'final'
    stage_order     INTEGER,
    is_initial      BOOLEAN DEFAULT FALSE,
    is_final        BOOLEAN DEFAULT FALSE,
    require_comment BOOLEAN DEFAULT FALSE
);
```

---

### 3.3 Tabelas Fato (Star Schema)

---

#### `fact_form_response`
Cabeçalho de cada resposta. Uma linha por envio.
```sql
CREATE TABLE fact_form_response (
    response_key        SERIAL       PRIMARY KEY,    -- PK inteira para Power BI
    firebase_id         VARCHAR(255) UNIQUE NOT NULL, -- ID Firestore para sync
    form_key            INTEGER      REFERENCES dim_forms(form_key),
    company_key         INTEGER      REFERENCES dim_companies(company_key),
    department_key      INTEGER      REFERENCES dim_departments(department_key),
    collaborator_key    INTEGER      REFERENCES dim_collaborators(collaborator_key),
    -- Caches desnormalizados (evita JOINs para filtros comuns no PBI)
    form_title          VARCHAR(500),
    department_name     VARCHAR(255),
    collaborator_username VARCHAR(255),
    -- Status e workflow
    status              VARCHAR(50),     -- 'submitted'|'approved'|'rejected'|'pending'
    current_stage_fb_id VARCHAR(255),
    -- Datas
    submitted_at        TIMESTAMP    NOT NULL,
    created_at          TIMESTAMP,
    deleted_at          TIMESTAMP        -- NULL = ativa
);
CREATE INDEX idx_ffr_form_submitted ON fact_form_response(form_key, submitted_at DESC);
CREATE INDEX idx_ffr_company_dept   ON fact_form_response(company_key, department_key);
CREATE INDEX idx_ffr_firebase       ON fact_form_response(firebase_id);
```

---

#### `fact_answers`
Campos simples respondidos. Uma linha por campo por resposta.
Não inclui campos tipo Tabela, Grade, Checkbox — esses têm tabelas próprias.
```sql
CREATE TABLE fact_answers (
    answer_key      SERIAL       PRIMARY KEY,
    response_key    INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key        INTEGER,     -- join direto sem passar por fact_form_response
    field_id        VARCHAR(255) NOT NULL,   -- ID do campo no Firestore
    field_label     VARCHAR(500),
    field_type      VARCHAR(50),  -- 'Texto'|'Data'|'Múltipla Escolha'|'Assinatura'|'Anexo'
    input_type      VARCHAR(50),  -- subtipo: 'text'|'number'|'decimal'|'email'|'tel'|'paragraph'|'radio'|'dropdown'|'date'
    answer_text     TEXT,
    answer_number   NUMERIC,
    answer_date     DATE,
    answer_boolean  BOOLEAN,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fa_response   ON fact_answers(response_key);
CREATE INDEX idx_fa_form       ON fact_answers(form_key);
CREATE INDEX idx_fa_field      ON fact_answers(field_id);
CREATE INDEX idx_fa_input_type ON fact_answers(input_type);
```

> **Regra:** campos `input_type IN ('table','order','checkbox')` vão apenas para as tabelas especializadas abaixo, **não** para `fact_answers`. Mantém o modelo plano.

---

#### `fact_order_items` *(NOVA — prioridade #1)*
Uma linha por produto em cada Grade de Pedidos respondida.
```sql
CREATE TABLE fact_order_items (
    order_item_key    SERIAL       PRIMARY KEY,
    response_key      INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key          INTEGER,
    field_id          VARCHAR(255),
    field_label       VARCHAR(500),    -- ex: "Pedido Carnes"
    item_index        INTEGER NOT NULL, -- ordem no pedido (0,1,2...)
    -- Snapshot do produto no momento da resposta (NUNCA relacionar com dim_products para valores históricos)
    product_fb_id     VARCHAR(255),    -- firebase_id para referência (sem FK obrigatória)
    product_key       INTEGER,         -- dim_products.product_key (só para lookup atual)
    product_name_snap VARCHAR(500) NOT NULL,  -- SNAPSHOT: nome como estava no envio
    product_code_snap VARCHAR(100),           -- SNAPSHOT: código como estava no envio
    price_snap        NUMERIC(12,2),          -- SNAPSHOT: preço como estava no envio
    quantity          NUMERIC      NOT NULL,
    unit              VARCHAR(50),
    subtotal          NUMERIC(12,2),          -- quantity × price_snap (calculado no save)
    catalog_key       INTEGER REFERENCES dim_product_catalogs(catalog_key),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_foi_response ON fact_order_items(response_key);
CREATE INDEX idx_foi_product  ON fact_order_items(product_fb_id);
CREATE INDEX idx_foi_form     ON fact_order_items(form_key);
```

> ⚠️ **Regra do Snapshot**: `price_snap` e `product_name_snap` são copiados no momento do envio. Se o preço do produto mudar no catálogo amanhã, pedidos antigos não mudam. `product_key` existe só para lookup de atributos atuais do produto (unidade, código EAN), nunca para valores financeiros históricos.

---

#### `fact_checkbox_answers` *(NOVA)*
Uma linha por opção marcada em campos Caixa de Seleção.
Relaciona direto com `fact_form_response` (sem salto por `fact_answers`).
```sql
CREATE TABLE fact_checkbox_answers (
    checkbox_key    SERIAL       PRIMARY KEY,
    response_key    INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key        INTEGER,
    field_id        VARCHAR(255) NOT NULL,
    field_label     VARCHAR(500),
    option_value    TEXT         NOT NULL,   -- "Noturno (17h-23h)"
    option_index    INTEGER      NOT NULL,   -- posição: 0, 1, 2...
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fca_response ON fact_checkbox_answers(response_key);
CREATE INDEX idx_fca_field    ON fact_checkbox_answers(field_id);
```

**Power BI:** `WHERE option_value = 'Noturno (17h-23h)'` → quantos clientes recebem à noite.

---

#### `fact_table_answers` *(NOVA — dados de campos Tabela como JSONB)*
Em vez de explodir cada célula em uma linha separada (geraria 50 linhas por resposta para uma tabela 10×5), salva o JSONB validado e cria Views com `crosstab()` para o Power BI. O banco processa, não o Power BI.
```sql
CREATE TABLE fact_table_answers (
    table_answer_key  SERIAL       PRIMARY KEY,
    response_key      INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key          INTEGER,
    field_id          VARCHAR(255) NOT NULL,
    field_label       VARCHAR(500),            -- "Horários de Recebimento"
    table_data        JSONB        NOT NULL,   -- JSON válido do objeto aninhado
    row_count         INTEGER,                 -- qtd de linhas preenchidas
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fta_response ON fact_table_answers(response_key);
CREATE INDEX idx_fta_data     ON fact_table_answers USING GIN(table_data);
```

> O índice GIN permite queries como:
> ```sql
> SELECT response_key,
>        table_data -> 'row_seg' ->> 'col_abertofechado' AS seg_status,
>        table_data -> 'row_seg' ->> 'col_horainicial'   AS seg_hora_ini
> FROM fact_table_answers
> WHERE field_label = 'Horários de Recebimento';
> ```

---

#### `fact_attachments` *(NOVA)*
URLs de arquivos anexados e assinaturas (nunca base64).
```sql
CREATE TABLE fact_attachments (
    attachment_key  SERIAL       PRIMARY KEY,
    response_key    INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key        INTEGER,
    field_id        VARCHAR(255),
    field_label     VARCHAR(500),
    field_type      VARCHAR(50),    -- 'Assinatura' | 'Anexo'
    file_url        TEXT NOT NULL,  -- URL no Firebase Storage (nunca base64)
    file_name       VARCHAR(500),
    file_type       VARCHAR(100),   -- 'image/png', 'application/pdf'
    file_size_kb    INTEGER,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

#### `fact_workflow_history` *(NOVA)*
Log de movimentações de workflow. Uma linha por ação realizada.
```sql
CREATE TABLE fact_workflow_history (
    history_key         SERIAL       PRIMARY KEY,
    response_key        INTEGER      REFERENCES fact_form_response(response_key),
    form_key            INTEGER,
    stage_key           INTEGER      REFERENCES dim_workflow_stages(stage_key),
    -- Snapshots para não depender de JOINs em análises históricas
    stage_name_snap     VARCHAR(255),
    workflow_name_snap  VARCHAR(255),
    action_type         VARCHAR(50),     -- 'forward'|'backward'|'reassigned'|'validated'|'rejected'
    performed_by_key    INTEGER,         -- dim_collaborators ou dim_users
    performed_by_name   VARCHAR(255),
    comment             TEXT,
    entered_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    duration_minutes    INTEGER,         -- calculado: completed_at - entered_at
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fwh_response ON fact_workflow_history(response_key);
CREATE INDEX idx_fwh_stage    ON fact_workflow_history(stage_key);
```

**Power BI:** `AVG(duration_minutes) GROUP BY stage_name_snap` → onde o processo trava. `COUNT(*) WHERE action_type = 'rejected' GROUP BY stage_name_snap` → taxa de rejeição por etapa.

---

## PARTE 4 — VIEWS PARA POWER BI

### `vw_respostas_planas`
Visão principal — campos simples, uma linha por campo respondido.
```sql
CREATE OR REPLACE VIEW vw_respostas_planas AS
SELECT
    fr.response_key, fr.firebase_id AS response_id,
    f.form_key, f.firebase_id AS form_id, f.title AS form_title,
    c.company_key, c.name AS empresa,
    d.department_key, d.name AS departamento,
    col.collaborator_key, col.username AS colaborador,
    fr.status, fr.submitted_at,
    a.field_label, a.field_type, a.input_type,
    a.answer_text, a.answer_number, a.answer_date, a.answer_boolean,
    COALESCE(a.answer_number::TEXT, a.answer_text) AS valor_unificado
FROM fact_form_response fr
JOIN dim_forms f        ON fr.form_key = f.form_key
JOIN dim_companies c    ON fr.company_key = c.company_key
JOIN dim_departments d  ON fr.department_key = d.department_key
JOIN dim_collaborators col ON fr.collaborator_key = col.collaborator_key
JOIN fact_answers a     ON fr.response_key = a.response_key
WHERE fr.deleted_at IS NULL;
```

---

### `vw_pedidos_produtos`
Para dashboards de Grade de Pedidos — ranking, totais, demanda por produto.
```sql
CREATE OR REPLACE VIEW vw_pedidos_produtos AS
SELECT
    fr.response_key, fr.submitted_at,
    f.title AS formulario,
    c.name AS empresa, d.name AS departamento,
    col.username AS colaborador,
    oi.field_label AS grade_nome,
    oi.product_fb_id, oi.product_name_snap, oi.product_code_snap,
    oi.quantity, oi.unit, oi.price_snap, oi.subtotal,
    p.preco_atual,    -- preço atual do catálogo (só para comparação)
    pc.name AS catalogo
FROM fact_form_response fr
JOIN dim_forms f              ON fr.form_key = f.form_key
JOIN dim_companies c          ON fr.company_key = c.company_key
JOIN dim_departments d        ON fr.department_key = d.department_key
JOIN dim_collaborators col    ON fr.collaborator_key = col.collaborator_key
JOIN fact_order_items oi      ON fr.response_key = oi.response_key
LEFT JOIN dim_products p      ON oi.product_key = p.product_key
LEFT JOIN dim_product_catalogs pc ON oi.catalog_key = pc.catalog_key
WHERE fr.deleted_at IS NULL;
```

**Usos no Power BI:**
- `SUM(subtotal) GROUP BY product_name_snap` → faturamento por produto
- `SUM(quantity) GROUP BY departamento, MONTH(submitted_at)` → demanda mensal por dep.
- `RANKX` por `quantity` → top 10 produtos mais pedidos

---

### `vw_horarios_recebimento`
Exemplo de extração de campo Tabela via JSONB — específico para o formulário de horários.
```sql
CREATE OR REPLACE VIEW vw_horarios_recebimento AS
SELECT
    fr.response_key, fr.submitted_at,
    col.username AS colaborador,
    d.name AS departamento,
    -- Extração direta das células via operadores JSONB
    ta.table_data -> 'row_seg' ->> 'col_abertofechado' AS seg_status,
    ta.table_data -> 'row_seg' ->> 'col_horainicial'   AS seg_hora_ini,
    ta.table_data -> 'row_seg' ->> 'col_horafinal'     AS seg_hora_fim,
    ta.table_data -> 'row_ter' ->> 'col_abertofechado' AS ter_status,
    ta.table_data -> 'row_qua' ->> 'col_abertofechado' AS qua_status,
    ta.table_data -> 'row_qui' ->> 'col_abertofechado' AS qui_status,
    ta.table_data -> 'row_sex' ->> 'col_abertofechado' AS sex_status,
    ta.table_data -> 'row_sab' ->> 'col_abertofechado' AS sab_status
FROM fact_form_response fr
JOIN dim_collaborators col ON fr.collaborator_key = col.collaborator_key
JOIN dim_departments d     ON fr.department_key = d.department_key
JOIN fact_table_answers ta ON fr.response_key = ta.response_key
WHERE ta.field_label = 'Horários de Recebimento'
  AND fr.deleted_at IS NULL;
```
> Esta view é criada **especificamente** para esse formulário. Para cada formulário com Tabela, criar uma view dedicada com os `row_*` e `col_*` corretos.

---

### `vw_sla_workflow`
Análise de tempo e gargalos no workflow.
```sql
CREATE OR REPLACE VIEW vw_sla_workflow AS
SELECT
    fr.firebase_id AS response_id,
    f.title AS formulario,
    d.name AS departamento,
    wh.workflow_name_snap,
    wh.stage_name_snap,
    wh.action_type,
    wh.performed_by_name,
    wh.entered_at, wh.completed_at,
    wh.duration_minutes,
    CASE
        WHEN wh.duration_minutes <= 60   THEN 'Dentro do SLA'
        WHEN wh.duration_minutes <= 1440 THEN 'Atenção'
        ELSE 'SLA Estourado'
    END AS sla_status
FROM fact_workflow_history wh
JOIN fact_form_response fr ON wh.response_key = fr.response_key
JOIN dim_forms f           ON fr.form_key = f.form_key
JOIN dim_departments d     ON fr.department_key = d.department_key;
```

---

## PARTE 5 — ALERTA: DUAL-WRITE E CONSISTÊNCIA

### O Problema
O `dualSaveService.ts` usa `fire-and-forget`: salva no Firestore e dispara um fetch para o PostgreSQL sem aguardar confirmação. Se a rede falhar no milissegundo entre os dois, o formulário existe no app mas **não existe no Power BI**. Não há log de erro visível para o admin.

### Solução Atual (mitigação)
O script Python `sync-firestore-to-postgresql.py` roda periodicamente e faz UPSERT de tudo. Isso corrige divergências, mas com delay.

### Solução Ideal (futura)
Migrar para **Firebase Cloud Functions** com triggers:
```
onDocumentCreated('/forms/{formId}/responses/{responseId}')
  → Cloud Function → INSERT no PostgreSQL (com retry automático)

onDocumentUpdated('/forms/{formId}/responses/{responseId}')
  → Cloud Function → UPSERT no PostgreSQL
```

Vantagens das Cloud Functions sobre o dual-write atual:
- **Retry automático:** a função é re-executada automaticamente em caso de falha de rede ou timeout
- **Independência do cliente:** a replicação ocorre no servidor, não depende do browser do colaborador estar aberto
- **Log de falhas:** Firebase Console exibe todos os erros com stack trace e timestamp para diagnóstico
- **Sem perda silenciosa:** se falhar, o Firebase registra e reprocessa — o admin é alertado

**Enquanto a migração não acontece:** manter o script Python rodando via cron pelo menos 1×/dia como garantia de consistência. O UPSERT com `ON CONFLICT DO UPDATE` garante que divergências sejam corrigidas sem duplicar dados.

---

## PARTE 6 — PLANO DE EXECUÇÃO (Priorizado)

### ✅ Fase 1 — Fundação (CONCLUÍDA em 30/03/2026)
Sem esta fase o modelo novo não funciona. Estabelece a base estrutural do banco.

1. ✅ **Criar tabelas dimensão** com surrogate keys: `dim_companies`, `dim_departments`, `dim_users`, `dim_collaborators`, `dim_forms`, `dim_product_catalogs`, `dim_products`, `dim_workflow_stages`
2. ✅ **Criar tabelas fato**: `fact_form_response`, `fact_answers`, `fact_order_items`, `fact_checkbox_answers`, `fact_table_answers`, `fact_attachments`, `fact_workflow_history`
3. ✅ **Coluna `input_type`** já incluída na criação de `fact_answers`
4. ✅ **`fields_json` como `JSONB`** com índice GIN — script Python já usa `json.dumps()`
5. ✅ **Views criadas**: `vw_respostas_planas`, `vw_pedidos_produtos`, `vw_sla_workflow`

> **Script SQL:** `scripts/sql/001_create_star_schema.sql`
> **Resultado:** 15 tabelas + 3 views criadas no PostgreSQL Cloud SQL.

---

### ✅ Fase 2 — Migração dos dados históricos (CONCLUÍDA em 30/03/2026)
Reprocessar todo o histórico existente no novo modelo.

1. ✅ Script Python `sync-firestore-to-postgresql.py` (v2.0) já grava direto nas tabelas `dim_*` e `fact_*`
2. ✅ Surrogate keys geradas automaticamente (SERIAL) com lookup `firebase_id → *_key`
3. ✅ Desnormalização executada pelo script:
   - JSON de Tabela → `fact_table_answers` (15.609 registros)
   - JSON de Grade → `fact_order_items` (111 registros)
   - JSON de Checkbox → `fact_checkbox_answers` (20 registros)
4. ✅ `SYNC_ALL=true` executado com sucesso (443s)

**Contagem final após migração (30/03/2026):**

| Tabela | Registros |
|--------|-----------|
| `dim_companies` | 3 |
| `dim_departments` | 19 |
| `dim_users` | 2 |
| `dim_collaborators` | 38 |
| `dim_forms` | 18 |
| `dim_product_catalogs` | 12 |
| `dim_products` | 462 |
| `dim_workflow_stages` | 4 |
| `fact_form_response` | 2.547 |
| `fact_answers` | 409 (sem Cabeçalho/vazios) |
| `fact_order_items` | 111 (48 com product_key) |
| `fact_checkbox_answers` | 20 |
| `fact_table_answers` | 15.704 |
| `fact_attachments` | 26 (assinaturas) |
| `fact_workflow_history` | 0 |

> **Resultado:** histórico completo migrado. Tabelas legado removidas.
> **Fixes aplicados:**
> - Collection `product_catalogs` (não `catalogs`) e `products` na raiz
> - `fact_answers` não duplica tabela/order/checkbox, filtra Cabeçalho e vazios (18.767 → 409)
> - Labels resolvidos via `dim_forms.fields_json` quando `fieldMetadata` ausente
> - `answer_date` preenchido para datas `%Y-%m-%dT%H:%M` (26 registros)
> - `fact_attachments` populada com 26 assinaturas (placeholder base64://)
> - `collaborator_key` NULL em 1.551 respostas — colaboradores deletados do Firestore
> - `product_key` NULL em 63 order items — product_fb_id vazio na resposta original

---

### ✅ Fase 3 — Atualizar API save-response (CONCLUÍDA em 30/03/2026)
Garantir que novas respostas já entrem no formato correto, eliminando JSON blobs.

1. ✅ `/api/dataconnect/save-response/route.ts` reescrito:
   - Resolve surrogate keys (`form_key`, `company_key`, `department_key`, `collaborator_key`)
   - Detecta `input_type` via `fieldMetadata` de cada campo
   - Caixa de Seleção → `fact_checkbox_answers` (uma linha por opção)
   - Tabela → `fact_table_answers` (JSONB válido)
   - Grade de Pedidos → `fact_order_items` (snapshot de `price_snap` e `product_name_snap`)
   - Assinatura → salva `[base64-signature]` em `fact_answers`, URL em `fact_attachments` se disponível
   - Anexo → `fact_attachments` + `fact_answers`
2. ✅ Todas as demais API routes atualizadas para usar `dim_*`:
   - `save-company` → `dim_companies`
   - `save-department` → `dim_departments`
   - `save-user` → `dim_users`
   - `save-collaborator` → `dim_collaborators`
   - `save-form` → `dim_forms` (com `fields_json::jsonb`)
   - `save-catalog` → `dim_product_catalogs`
   - `save-product` → `dim_products`
   - `delete-response` → soft-delete real (`deleted_at = NOW()`)
   - `update-status` → UPDATE real no `fact_form_response`
3. ⬜ Garantir que o frontend envia `inputType` correto no `fieldMetadata` para cada campo

> **Resultado:** novas respostas gravadas no modelo otimizado. JSON blobs eliminados para campos Tabela, Grade e Checkbox.

---

### 🟡 Fase 4 — Workflow no PostgreSQL (parcialmente concluída)
Integrar dados de workflow e destravar análises de SLA e aprovações.

1. ✅ `dim_workflow_stages` criada e populada (4 stages do workflow "Teste")
2. ✅ `fact_workflow_history` criada (tabela existe, vazia — nenhuma resposta possui `workflowHistory` no Firestore ainda)
3. ✅ `vw_sla_workflow` criada com classificação automática (Dentro do SLA / Atenção / SLA Estourado)
4. ✅ Script Python sincroniza `dim_workflow_stages` a partir da collection `workflows`
5. ⬜ Quando respostas tiverem `workflowHistory`, o script precisará populá-la em `fact_workflow_history`

> **Status:** infraestrutura pronta. Dados serão populados quando o workflow estiver ativo em produção (atualmente `isActive=false`).

---

### 🟢 Fase 5 — Power BI
Conectar o modelo otimizado no Power BI Desktop e construir os dashboards.

1. Atualizar conexão ODBC para as novas tabelas e views
2. Montar modelo de dados com **todos os relacionamentos por chave inteira** (sem strings)
3. Dashboards prioritários:
   - Pedidos por produto, departamento e período → `vw_pedidos_produtos`
   - Horários de recebimento por loja → `vw_horarios_recebimento`
   - SLA de workflow por etapa → `vw_sla_workflow`
   - Respostas por colaborador, status e formulário → `vw_respostas_planas`

> **Resultado esperado:** dashboards eficientes e precisos aproveitando a nova estrutura. Arquivo `.pbix` significativamente mais leve pela compressão de inteiros no VertiPaq.

---

## PARTE 7 — DIAGRAMA FINAL DO MODELO (Star Schema)

```
                     dim_companies
                          |
              ┌───────────┴───────────┐
        dim_departments         dim_users
              |
        dim_collaborators
              |
         dim_forms ──── dim_product_catalogs
              |                  |
              |            dim_products
              |
       fact_form_response  ◄──── (centro do modelo)
              |
    ┌─────────┼──────────┬────────────┬────────────┐
    │         │          │            │            │
fact_      fact_      fact_       fact_        fact_
answers  order_    checkbox_   table_      workflow_
         items     answers     answers     history
                     │
                dim_workflow_stages
```

**Relacionamentos Power BI (todos por chave inteira):**
```
fact_form_response.form_key         → dim_forms.form_key
fact_form_response.company_key      → dim_companies.company_key
fact_form_response.department_key   → dim_departments.department_key
fact_form_response.collaborator_key → dim_collaborators.collaborator_key
fact_answers.response_key           → fact_form_response.response_key
fact_order_items.response_key       → fact_form_response.response_key
fact_order_items.product_key        → dim_products.product_key  (lookup, não financeiro)
fact_order_items.catalog_key        → dim_product_catalogs.catalog_key
fact_checkbox_answers.response_key  → fact_form_response.response_key
fact_table_answers.response_key     → fact_form_response.response_key
fact_workflow_history.response_key  → fact_form_response.response_key
fact_workflow_history.stage_key     → dim_workflow_stages.stage_key
dim_departments.company_key         → dim_companies.company_key
dim_collaborators.company_key       → dim_companies.company_key
dim_products.catalog_key            → dim_product_catalogs.catalog_key
```

---

## RESUMO EXECUTIVO

| Prioridade | Ação | Por quê |
|-----------|------|---------|
| 🔴 #1 | Criar tabelas `fact_order_items` + `fact_checkbox_answers` | Destrava 80% das análises de pedidos e demografia |
| 🔴 #2 | Adicionar `input_type` em `fact_answers` | Permite filtrar número/texto/email diretamente |
| 🔴 #3 | Corrigir `fields_json` para `JSONB` válido | Permite queries SQL diretas nos campos do formulário |
| 🟠 #4 | Surrogate keys (`SERIAL`) em todas as tabelas | Performance Power BI — arquivo .pbix mais leve |
| 🟠 #5 | `fact_table_answers` com JSONB + views dedicadas | Análise de horários, tabelas, sem explosão de linhas |
| 🟠 #6 | Assinatura → URL em vez de base64 | Remove ~100KB por linha do banco |
| 🟡 #7 | `fact_workflow_history` + views SLA | Análise de aprovações, SLA, gargalos |
| 🟡 #8 | Migrar dual-write para Cloud Functions | Elimina risco de perda silenciosa de dados |
