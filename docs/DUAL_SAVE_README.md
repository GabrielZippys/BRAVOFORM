# Dual-Save Automático - BravoForm

## ✅ **Sistema Ativo**

Todos os dados novos são salvos automaticamente em:
1. **Firestore** (primário)
2. **PostgreSQL** (secundário - para Power BI)

---

## 📊 **Tabelas no PostgreSQL**

- `companies` - Empresas
- `departments` - Departamentos  
- `users` - Usuários admin
- `collaborators` - Colaboradores
- `forms` - Formulários
- `form_response` - Respostas (✅ **ATIVO**)
- `answer` - Campos respondidos (✅ **ATIVO**)
- `product_catalogs` - Catálogos
- `products` - Produtos

---

## 💻 **Como Usar**

### **Importar o serviço:**
```typescript
import { dualSave } from '@/services/dualSaveService';
```

### **Exemplos:**

**Salvar resposta de formulário:**
```typescript
dualSave.saveFormResponse({ responseId, formId, formTitle, ... });
```

**Salvar formulário:**
```typescript
dualSave.saveForm({ formId, title, description, ... });
```

**Salvar produto:**
```typescript
dualSave.saveProduct({ productId, catalogId, name, ... });
```

**Salvar catálogo:**
```typescript
dualSave.saveCatalog({ catalogId, name, description, ... });
```

**Salvar usuário:**
```typescript
dualSave.saveUser({ userId, name, email, ... });
```

**Salvar colaborador:**
```typescript
dualSave.saveCollaborator({ collaboratorId, username, ... });
```

**Deletar:**
```typescript
dualSave.deleteFormResponse(responseId);
dualSave.deleteForm(formId);
dualSave.deleteProduct(productId);
// etc...
```

---

## 🔄 **Sincronizar Dados Históricos**

Para migrar dados antigos do Firestore:

```bash
cd scripts
python sync-firestore-to-postgresql.py
```

---

## 📈 **Power BI**

**Conectar via ODBC:**
1. Siga o guia: `docs/CONFIGURACAO_ODBC_POWERBI.md`
2. Use DirectQuery para dados em tempo real
3. Todas as tabelas estarão disponíveis

**String de conexão M (Power BI):**
```m
let
    Source = Odbc.DataSource("driver={PostgreSQL Unicode(x64)};Server=34.39.165.146;Port=5432;Database=formbravo-8854e-database;sslmode=disable")
in
    Source
```

---

## ⚠️ **Importante**

- **Fire-and-forget:** PostgreSQL não bloqueia a UX
- **Firestore é primário:** Se PostgreSQL falhar, app continua funcionando
- **Logs no console:** Erros do PostgreSQL aparecem no console do navegador

---

*Sistema implementado em Março 2026*
