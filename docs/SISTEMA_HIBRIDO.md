# 🔄 Sistema Híbrido: Firestore + PostgreSQL

## 📋 Visão Geral

O BravoForm agora utiliza um **sistema híbrido de armazenamento** que combina o melhor dos dois mundos:

- **Firestore (NoSQL)**: Sistema principal, mantém todas as funcionalidades existentes
- **PostgreSQL (Relacional)**: Sistema secundário, otimizado para análise no Power BI

---

## ✅ Garantias do Sistema

### **1. Firestore Permanece Intacto**
- ✅ Nenhuma funcionalidade existente foi alterada
- ✅ Todas as respostas continuam sendo salvas no Firestore
- ✅ Sistema funciona normalmente mesmo se PostgreSQL falhar
- ✅ Zero impacto em performance ou estabilidade

### **2. Salvamento Dual Automático**
- ✅ Novas respostas são salvas em **AMBOS** os bancos automaticamente
- ✅ Firestore é sempre prioritário (salva primeiro)
- ✅ PostgreSQL é secundário (falha não bloqueia o fluxo)
- ✅ Logs detalhados de cada operação

### **3. Migração Segura de Dados Antigos**
- ✅ Respostas antigas do Firestore podem ser copiadas para PostgreSQL
- ✅ Processo não destrutivo (nada é deletado do Firestore)
- ✅ Migração em lotes para não sobrecarregar
- ✅ Interface visual para monitorar progresso

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    FORMULÁRIO SUBMETIDO                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   useDualStorage Hook                        │
│  (Gerencia salvamento em ambos os bancos)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐
    │   FIRESTORE       │   │   POSTGRESQL      │
    │   (Prioritário)   │   │   (Secundário)    │
    └───────────────────┘   └───────────────────┘
            │                       │
            ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐
    │  Sistema Atual    │   │   Power BI        │
    │  (Dashboard, etc) │   │   (Relatórios)    │
    └───────────────────┘   └───────────────────┘
```

---

## 📊 Estrutura de Dados PostgreSQL

### **Tabelas Criadas:**

1. **form_response** - Dados principais da resposta
2. **answer** - Respostas individuais (normalizada)
3. **attachment** - Anexos e arquivos
4. **workflow_history** - Histórico de workflow
5. **table_item** - Itens de grade/tabela

### **Vantagens da Estrutura Relacional:**

- ✅ Fácil criar JOINs entre tabelas
- ✅ Queries SQL otimizadas
- ✅ Agregações rápidas (COUNT, SUM, AVG)
- ✅ Compatibilidade nativa com Power BI
- ✅ Performance excelente para grandes volumes

---

## 🚀 Como Usar

### **1. Novas Respostas (Automático)**

Não precisa fazer nada! O sistema já está configurado para salvar automaticamente em ambos os bancos.

**Fluxo:**
1. Colaborador preenche formulário
2. Sistema salva no Firestore (prioritário)
3. Sistema salva no PostgreSQL (secundário)
4. Logs confirmam ambas as operações

### **2. Migrar Respostas Antigas**

Acesse: `https://bravoform.vercel.app/migrate-data`

**Passo a Passo:**

1. **Teste primeiro:**
   - Clique em "🧪 Testar (5 respostas)"
   - Verifique os logs
   - Confirme que está funcionando

2. **Migração completa:**
   - Ajuste o tamanho do lote (padrão: 50)
   - Clique em "🚀 Migrar Todas"
   - Acompanhe o progresso
   - Aguarde conclusão

3. **Verificar resultados:**
   - Veja estatísticas de sucesso/falha
   - Revise logs de erros (se houver)
   - Confirme dados no Power BI

---

## 🔧 Configuração Técnica

### **Hook: useDualStorage**

```typescript
import { useDualStorage } from '@/hooks/useDualStorage';

const { saveResponse, updateStatus, markAsDeleted } = useDualStorage();

// Salvar resposta em ambos os bancos
await saveResponse(response, async () => {
  // Função que salva no Firestore
  await addDoc(collection(db, 'responses'), response);
});
```

### **Serviço: ResponseStorageService**

```typescript
import { ResponseStorageService } from '@/services/responseStorageService';

// Salvar no PostgreSQL
await ResponseStorageService.saveToPostgreSQL(response);

// Salvar em lote (migração)
const result = await ResponseStorageService.saveBatch(responses);

// Atualizar status
await ResponseStorageService.updateStatus(id, status);

// Marcar como deletada
await ResponseStorageService.markAsDeleted(id, deletedBy, username);
```

---

## 📈 Monitoramento

### **Logs do Sistema:**

Todos os salvamentos são logados no console:

```
✅ Resposta salva no Firestore: abc123
✅ Resposta salva no PostgreSQL: abc123
```

Se houver erro no PostgreSQL (não crítico):

```
⚠️ Falha ao salvar no PostgreSQL (não crítico): abc123
```

### **Interface de Migração:**

A página `/migrate-data` mostra:
- Progresso em tempo real
- Total de respostas migradas
- Sucessos e falhas
- Logs detalhados de cada operação

---

## ⚠️ Troubleshooting

### **Problema: PostgreSQL não está salvando**

**Possíveis causas:**
1. Schema ainda não foi deployado no Firebase Data Connect
2. Credenciais incorretas
3. Firewall bloqueando conexão

**Solução:**
- Verifique logs no console do navegador
- Acesse Firebase Console → Data Connect → Monitoramento
- Confirme que schema está ativo

### **Problema: Migração muito lenta**

**Solução:**
- Reduza o tamanho do lote (ex: de 50 para 20)
- Execute em horário de baixo tráfego
- Verifique conexão com internet

### **Problema: Algumas respostas falharam na migração**

**Solução:**
- Revise os logs de erro
- Identifique padrão (ex: campos específicos)
- Execute migração novamente (duplicatas são ignoradas)

---

## 🎯 Próximos Passos

### **Fase 1: Configuração (Atual)**
- ✅ Schema PostgreSQL criado
- ✅ Hook de salvamento dual implementado
- ✅ Ferramenta de migração criada
- ⏳ Aguardando deploy do schema no Firebase

### **Fase 2: Migração**
- ⏳ Testar migração com 5 respostas
- ⏳ Migrar todas as respostas antigas
- ⏳ Validar dados no PostgreSQL

### **Fase 3: Power BI**
- ⏳ Conectar Power BI ao PostgreSQL
- ⏳ Criar dashboards iniciais
- ⏳ Treinar equipe

### **Fase 4: Otimização**
- ⏳ Criar índices para performance
- ⏳ Configurar atualizações automáticas
- ⏳ Monitorar uso e ajustar

---

## 📞 Suporte

**Documentação relacionada:**
- [Integração Power BI](./POWER_BI_INTEGRATION.md)
- [Schema PostgreSQL](../dataconnect/schema.gql)

**Ferramentas:**
- Teste Data Connect: `/test-dataconnect`
- Migração de dados: `/migrate-data`

---

**Última atualização:** 25/03/2026
