# 🔄 Migração: Firestore → Data Connect (PostgreSQL)

## 🎯 **Nova Arquitetura**

### **Antes (Firestore):**
```
Formulário → Firestore (NoSQL) → Power BI (via API REST)
```
❌ JSON complexo  
❌ Difícil de analisar no Power BI  
❌ Performance limitada

### **Depois (Data Connect + PostgreSQL):**
```
Formulário → Data Connect (GraphQL) → PostgreSQL → Power BI (via ODBC)
```
✅ Estrutura relacional  
✅ Fácil de analisar no Power BI  
✅ Performance excelente  
✅ Relacionamentos automáticos

---

## 📋 **Passo 1: Deploy do Schema**

### **Via Firebase Console (Recomendado):**

1. Acesse: https://console.firebase.google.com
2. Projeto: **FORMBRAVO**
3. Menu: **Data Connect**
4. Serviço: **formbravo-8854e-service**
5. Aba: **Schema**
6. Clique em **"Edit Schema"**
7. Cole o conteúdo de `dataconnect/schema.gql`
8. Clique em **"Deploy"**

Aguarde alguns minutos. O Firebase vai:
- ✅ Criar tabelas no PostgreSQL
- ✅ Criar índices
- ✅ Configurar relacionamentos
- ✅ Gerar mutations GraphQL

---

## 📋 **Passo 2: Modificar Código de Salvamento**

### **Antes (Firestore):**

```typescript
// src/app/api/forms/[formId]/responses/route.ts
import { db } from '@/firebase/config';
import { collection, addDoc } from 'firebase/firestore';

export async function POST(request: Request) {
  const data = await request.json();
  
  // Salva no Firestore
  const docRef = await addDoc(collection(db, 'responses'), {
    formId: data.formId,
    answers: data.answers, // JSON complexo
    collaboratorId: data.collaboratorId,
    submittedAt: new Date()
  });
  
  return Response.json({ id: docRef.id });
}
```

### **Depois (Data Connect):**

```typescript
// src/app/api/forms/[formId]/responses/route.ts
import { DataConnectMutations } from '@/services/dataConnectMutations';

export async function POST(request: Request) {
  const data = await request.json();
  
  // 1. Preparar dados da resposta principal
  const response = {
    id: crypto.randomUUID(),
    form_id: data.formId,
    form_title: data.formTitle,
    company_id: data.companyId,
    department_id: data.departmentId,
    department_name: data.departmentName,
    collaborator_id: data.collaboratorId,
    collaborator_username: data.collaboratorUsername,
    status: 'submitted',
    submitted_at: new Date().toISOString()
  };
  
  // 2. Preparar respostas individuais (normalizado)
  const answers = Object.entries(data.answers).map(([fieldId, value]) => ({
    response_id: response.id,
    field_id: fieldId,
    field_label: data.fieldLabels[fieldId] || fieldId,
    field_type: data.fieldTypes[fieldId] || 'text',
    answer_text: typeof value === 'string' ? value : null,
    answer_number: typeof value === 'number' ? value : null,
    answer_boolean: typeof value === 'boolean' ? value : null
  }));
  
  // 3. Salvar tudo no PostgreSQL via Data Connect
  await DataConnectMutations.saveCompleteResponse(
    response,
    answers,
    data.attachments || [],
    data.tableItems || []
  );
  
  return Response.json({ 
    id: response.id,
    message: 'Resposta salva no PostgreSQL com sucesso!'
  });
}
```

---

## 📋 **Passo 3: Atualizar Componentes React**

### **Hook personalizado para salvamento:**

```typescript
// src/hooks/useFormSubmit.ts
import { useState } from 'react';
import { DataConnectMutations } from '@/services/dataConnectMutations';

export function useFormSubmit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitForm = async (formData: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = {
        id: crypto.randomUUID(),
        form_id: formData.formId,
        form_title: formData.formTitle,
        company_id: formData.companyId,
        department_id: formData.departmentId,
        department_name: formData.departmentName,
        collaborator_id: formData.collaboratorId,
        collaborator_username: formData.collaboratorUsername,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      };

      const answers = Object.entries(formData.answers).map(([fieldId, value]) => ({
        response_id: response.id,
        field_id: fieldId,
        field_label: formData.fieldLabels[fieldId],
        field_type: formData.fieldTypes[fieldId],
        answer_text: typeof value === 'string' ? value : null,
        answer_number: typeof value === 'number' ? value : null
      }));

      await DataConnectMutations.saveCompleteResponse(response, answers);
      
      return response.id;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { submitForm, loading, error };
}
```

### **Uso no componente:**

```typescript
// src/components/FormRenderer.tsx
import { useFormSubmit } from '@/hooks/useFormSubmit';

export function FormRenderer({ form }: { form: Form }) {
  const { submitForm, loading, error } = useFormSubmit();
  const [answers, setAnswers] = useState({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const responseId = await submitForm({
        formId: form.id,
        formTitle: form.title,
        companyId: form.companyId,
        departmentId: form.departmentId,
        departmentName: form.department,
        collaboratorId: user.id,
        collaboratorUsername: user.username,
        answers,
        fieldLabels: getFieldLabels(form.fields),
        fieldTypes: getFieldTypes(form.fields)
      });

      alert(`Resposta salva com sucesso! ID: ${responseId}`);
    } catch (err) {
      alert('Erro ao salvar resposta: ' + error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Campos do formulário */}
      <button type="submit" disabled={loading}>
        {loading ? 'Salvando...' : 'Enviar'}
      </button>
    </form>
  );
}
```

---

## 📋 **Passo 4: Validar no Power BI**

Depois de salvar algumas respostas:

1. **Abra Power BI Desktop**
2. **Atualizar dados:** Clique em "Refresh"
3. **Verificar tabelas:**
   - `form_response` - Deve ter as novas respostas
   - `answer` - Deve ter as respostas individuais
4. **Criar relacionamentos** (se ainda não criou):
   - `form_response.id` → `answer.response_id`

---

## 📋 **Passo 5: Remover Dependência do Firestore (Opcional)**

Se quiser remover completamente o Firestore:

### **1. Manter apenas autenticação:**
```typescript
// firebase/config.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
// Remover: import { getFirestore } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Remover: export const db = getFirestore(app);
```

### **2. Remover imports do Firestore:**
```bash
# Procurar e substituir em todo o projeto:
# De: import { db } from '@/firebase/config';
# Para: // import { db } from '@/firebase/config'; (comentar)
```

### **3. Atualizar package.json:**
```json
{
  "dependencies": {
    "firebase": "^10.x.x", // Manter para Auth
    "@firebase/data-connect": "^0.x.x" // Adicionar
  }
}
```

---

## 🔍 **Comparação: Firestore vs Data Connect**

| Aspecto | Firestore | Data Connect + PostgreSQL |
|---------|-----------|---------------------------|
| **Estrutura** | JSON aninhado | Tabelas relacionais |
| **Queries** | Limitadas | SQL completo |
| **Power BI** | Difícil (JSON) | Fácil (ODBC) |
| **Performance** | Boa | Excelente |
| **Relacionamentos** | Manual | Automático (FK) |
| **Agregações** | Limitadas | Ilimitadas (SQL) |
| **Custo** | Por leitura/escrita | Por armazenamento |
| **Ideal para** | Apps mobile | Análise de dados |

---

## ✅ **Checklist de Migração**

- [ ] Deploy do schema no Data Connect
- [ ] Criar serviço `DataConnectMutations`
- [ ] Atualizar API routes de salvamento
- [ ] Criar hook `useFormSubmit`
- [ ] Atualizar componentes de formulário
- [ ] Testar salvamento com dados reais
- [ ] Validar dados no Power BI
- [ ] Criar relacionamentos no Power BI
- [ ] Documentar para equipe
- [ ] (Opcional) Remover código Firestore antigo

---

## 🎯 **Resultado Final**

### **Fluxo Completo:**

```
1. Usuário preenche formulário
   ↓
2. Frontend chama DataConnectMutations.saveCompleteResponse()
   ↓
3. Data Connect executa mutations GraphQL
   ↓
4. PostgreSQL armazena dados em tabelas relacionais
   ↓
5. Power BI consome via ODBC
   ↓
6. Relatórios e dashboards atualizados automaticamente
```

### **Benefícios:**

✅ **Dados estruturados** - Fácil de analisar  
✅ **Performance** - Queries SQL otimizadas  
✅ **Escalabilidade** - PostgreSQL suporta milhões de registros  
✅ **Manutenibilidade** - Código mais limpo e organizado  
✅ **Power BI nativo** - Conexão ODBC direta  

---

**Última atualização:** 25/03/2026
