# Configuração ODBC para Power BI - BravoForm

## Guia completo para conectar o Power BI ao banco PostgreSQL do BravoForm

---

## 1. Instalar Driver ODBC do PostgreSQL

### Download:
- Acesse: https://www.postgresql.org/ftp/odbc/releases/
- Ou diretamente: https://ftp.postgresql.org/pub/odbc/releases/REL-16-00-0005/psqlodbc_x64.msi
- Baixe o instalador **x64** (64 bits)
- Execute o instalador e siga as instruções padrão

### Verificar instalação:
1. Abra o **Painel de Controle**
2. Vá em **Ferramentas Administrativas** → **Fontes de Dados ODBC (64 bits)**
3. O driver **PostgreSQL Unicode(x64)** deve aparecer na aba **Drivers**

---

## 2. Criar DSN (Data Source Name)

1. Abra: **Fontes de Dados ODBC (64 bits)**
   - Pesquise "ODBC" no menu iniciar do Windows
   - Ou: Painel de Controle → Ferramentas Administrativas → Fontes de Dados ODBC (64-bit)

2. Clique na aba **DSN de Sistema** (System DSN)

3. Clique em **Adicionar...**

4. Selecione **PostgreSQL Unicode(x64)** → Clique **Concluir**

5. Preencha:

| Campo       | Valor                           |
|-------------|----------------------------------|
| Data Source | `BravoFormDB`                   |
| Description | `BravoForm PostgreSQL Database` |
| Database    | `formbravo-8854e-database`      |
| Server      | `34.39.165.146`                 |
| Port        | `5432`                          |
| User Name   | `ipanema`                       |
| Password    | `Br@v0x00`                      |
| SSL Mode    | `prefer`                        |

6. Clique em **Test** para validar a conexão

7. Se o teste passar, clique **Save**

---

## 3. Conectar no Power BI

### Passo a passo:

1. Abra o **Power BI Desktop**

2. Clique em **Obter Dados** (Get Data)

3. Procure por **ODBC** e selecione

4. Em **Nome da fonte de dados (DSN)**, selecione **BravoFormDB**

5. Clique **OK**

6. Se pedir credenciais:
   - Selecione **Database**
   - Usuário: `ipanema`
   - Senha: `Br@v0x00`

7. No Navigator, selecione as tabelas:
   - ✅ `companies` — Empresas cadastradas
   - ✅ `departments` — Departamentos por empresa
   - ✅ `forms` — Formulários (metadados, perguntas)
   - ✅ `form_response` — Respostas dos formulários
   - ✅ `answer` — Campos respondidos (normalizado)

8. Clique **Carregar** (Load)

---

## 4. Criar Relacionamentos no Power BI

Após carregar as tabelas, vá em **Model View** (ícone de diagrama) e crie:

```
companies.id ──(1:N)──► departments.company_id
companies.id ──(1:N)──► forms.company_id
companies.id ──(1:N)──► form_response.company_id
forms.id ──(1:N)──► form_response.form_id
form_response.id ──(1:N)──► answer.response_id
```

### Como criar cada relacionamento:
1. Arraste o campo de uma tabela para o campo correspondente da outra
2. O Power BI detectará automaticamente o tipo (1:N)

---

## 5. Estrutura das Tabelas

### `companies`
| Coluna     | Tipo        | Descrição           |
|------------|-------------|----------------------|
| id         | VARCHAR(255)| ID da empresa        |
| name       | VARCHAR(500)| Nome da empresa      |
| created_at | TIMESTAMP   | Data de criação      |

### `departments`
| Coluna     | Tipo        | Descrição            |
|------------|-------------|----------------------|
| id         | VARCHAR(255)| ID do departamento   |
| name       | VARCHAR(500)| Nome do departamento |
| company_id | VARCHAR(255)| FK → companies.id    |
| created_at | TIMESTAMP   | Data de criação      |

### `forms`
| Coluna          | Tipo        | Descrição               |
|-----------------|-------------|--------------------------|
| id              | VARCHAR(255)| ID do formulário         |
| title           | VARCHAR(500)| Título do formulário     |
| description     | TEXT        | Descrição                |
| company_id      | VARCHAR(255)| FK → companies.id        |
| department_id   | VARCHAR(255)| FK → departments.id      |
| department_name | VARCHAR(255)| Nome do departamento     |
| is_active       | INTEGER     | 1=Ativo, 0=Inativo      |
| created_at      | TIMESTAMP   | Data de criação          |
| updated_at      | TIMESTAMP   | Última atualização       |
| fields_json     | TEXT        | JSON com campos/perguntas|

### `form_response`
| Coluna                 | Tipo        | Descrição                  |
|------------------------|-------------|------------------------------|
| id                     | VARCHAR(255)| ID da resposta               |
| form_id                | VARCHAR(255)| FK → forms.id                |
| form_title             | VARCHAR(500)| Título do formulário         |
| company_id             | VARCHAR(255)| FK → companies.id            |
| department_id          | VARCHAR(255)| FK → departments.id          |
| department_name        | VARCHAR(255)| Nome do departamento         |
| collaborator_id        | VARCHAR(255)| ID do colaborador            |
| collaborator_username  | VARCHAR(255)| Nome do colaborador          |
| status                 | VARCHAR(50) | pending/approved/rejected    |
| created_at             | TIMESTAMP   | Data de criação              |
| submitted_at           | TIMESTAMP   | Data de envio                |

### `answer`
| Coluna         | Tipo        | Descrição                      |
|----------------|-------------|----------------------------------|
| id             | VARCHAR(500)| ID único (responseId_fieldId)    |
| response_id    | VARCHAR(255)| FK → form_response.id            |
| field_id       | VARCHAR(255)| ID do campo/pergunta             |
| field_label    | VARCHAR(500)| Label do campo (nome da pergunta)|
| field_type     | VARCHAR(100)| Tipo: text, number, date, etc    |
| answer_text    | TEXT        | Resposta em texto                |
| answer_number  | DECIMAL     | Resposta numérica (se aplicável) |
| answer_boolean | BOOLEAN     | Resposta sim/não (se aplicável)  |

---

## 6. Queries SQL Úteis para Relatórios

### Total de respostas por formulário
```sql
SELECT f.title, COUNT(fr.id) as total_respostas
FROM forms f
JOIN form_response fr ON f.id = fr.form_id
GROUP BY f.title
ORDER BY total_respostas DESC;
```

### Respostas por empresa e departamento
```sql
SELECT c.name as empresa, d.name as departamento, COUNT(fr.id) as total
FROM form_response fr
JOIN companies c ON fr.company_id = c.id
LEFT JOIN departments d ON fr.department_id = d.id
GROUP BY c.name, d.name
ORDER BY total DESC;
```

### Respostas de um campo específico
```sql
SELECT a.field_label, a.answer_text, fr.collaborator_username, fr.submitted_at
FROM answer a
JOIN form_response fr ON a.response_id = fr.id
WHERE a.field_label = 'Nome do Campo'
ORDER BY fr.submitted_at DESC;
```

### Soma de valores numéricos por formulário
```sql
SELECT f.title, a.field_label, SUM(a.answer_number) as total
FROM answer a
JOIN form_response fr ON a.response_id = fr.id
JOIN forms f ON fr.form_id = f.id
WHERE a.answer_number IS NOT NULL
GROUP BY f.title, a.field_label
ORDER BY total DESC;
```

### Atividade diária
```sql
SELECT DATE(fr.submitted_at) as dia, COUNT(*) as respostas
FROM form_response fr
WHERE fr.submitted_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(fr.submitted_at)
ORDER BY dia;
```

---

## 7. Credenciais de Acesso

| Item        | Valor                        |
|-------------|-------------------------------|
| Host        | `34.39.165.146`              |
| Porta       | `5432`                       |
| Banco       | `formbravo-8854e-database`   |
| Usuário     | `ipanema`                    |
| Senha       | `Br@v0x00`                   |
| SSL         | `prefer`                     |

---

## 8. Troubleshooting

### Erro: "Driver not found"
- Reinstale o driver PostgreSQL ODBC x64
- Certifique-se de usar a versão 64 bits

### Erro: "Connection refused"
- Verifique se o IP do servidor está liberado no Cloud SQL
- Peça ao administrador para adicionar o IP público do servidor

### Erro: "Password authentication failed"
- Verifique usuário e senha
- Certifique-se que está usando: `ipanema` / `Br@v0x00`

### Tabelas não aparecem
- Verifique se selecionou o schema `public`
- Execute o script de sincronização para popular as tabelas

---

## 9. Sincronização de Dados

Os dados são sincronizados do Firestore para o PostgreSQL de duas formas:

### Automático (novas respostas):
- Toda nova resposta enviada pelo formulário é salva automaticamente no Firestore E no PostgreSQL

### Manual (dados históricos):
Execute o script Python para sincronizar dados antigos:
```bash
cd scripts
python sync-firestore-to-postgresql.py
```

### Dados sincronizados:
- **Empresas** (companies)
- **Departamentos** (departments) 
- **Formulários** (forms) — metadados e perguntas
- **Respostas** (form_response) — cabeçalho
- **Campos respondidos** (answer) — normalizado

---

*Última atualização: Março 2026*
