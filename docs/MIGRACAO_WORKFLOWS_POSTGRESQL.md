# Migração de Workflows e Formulário de Compras para PostgreSQL

## Resumo
Esta migração elimina completamente a dependência do Firestore para **workflows** e **formulário de compras**, mantendo apenas o PostgreSQL como fonte de dados.

## Mudanças Realizadas

### 1. APIs PostgreSQL Criadas

#### `/api/dataconnect/workflows/route.ts`
- **GET**: Lista workflows ou busca workflow específico por ID
- **POST**: Cria ou atualiza workflow
- **DELETE**: Remove workflow
- **PATCH**: Ativa/desativa workflow

#### `/api/dataconnect/products/route.ts`
- **GET**: Lista produtos por catálogo do PostgreSQL

### 2. Serviço TypeScript

#### `src/services/workflowServicePg.ts`
Novo serviço que substitui `workflowService.ts` com métodos:
- `listWorkflows()`: Lista todos os workflows
- `loadWorkflow(id)`: Carrega workflow específico
- `saveWorkflow()`: Cria novo workflow
- `updateWorkflow()`: Atualiza workflow existente
- `deleteWorkflow()`: Remove workflow
- `toggleWorkflowActive()`: Ativa/desativa workflow
- `moveResponse()`: Move resposta entre etapas
- `getWorkflowHistory()`: Busca histórico de workflow

### 3. Páginas Modificadas

#### `app/dashboard/bravoflow/create/page.tsx`
- ❌ Removido: `collection`, `addDoc` do Firestore
- ✅ Adicionado: `WorkflowServicePg.saveWorkflow()`

#### `app/dashboard/bravoflow/edit/[id]/page.tsx`
- ❌ Removido: `doc`, `getDoc`, `updateDoc` do Firestore
- ✅ Adicionado: `WorkflowServicePg.loadWorkflow()` e `WorkflowServicePg.updateWorkflow()`

#### `app/dashboard/bravoflow/page.tsx`
- ❌ Removido: `collection`, `getDocs`, `deleteDoc`, `addDoc`, `updateDoc` do Firestore
- ✅ Adicionado: Todos os métodos do `WorkflowServicePg`

### 4. Componentes Modificados

#### `src/components/OrderGridFieldResponse.tsx`
- ❌ Removido: `collection`, `query`, `where`, `getDocs` do Firestore
- ✅ Adicionado: Fetch para `/api/dataconnect/products?catalogId=...`

## Estrutura de Dados PostgreSQL

### Tabelas Utilizadas (já existentes)

#### `dim_workflow_stages`
Armazena workflows e suas etapas:
- `firebase_id`: ID do workflow
- `workflow_fb_id`: ID do workflow pai (para stages)
- `workflow_name`: Nome do workflow
- `stage_name`: Nome da etapa
- `stage_order`: Ordem da etapa
- `is_active`: Status ativo/inativo
- `require_comment`: Se requer comentário

#### `fact_workflow_history`
Histórico de movimentações de workflow:
- `response_key`: Chave da resposta
- `stage_key`: Chave da etapa
- `action_type`: Tipo de ação (forward, backward, reassigned)
- `performed_by_key`: Quem executou
- `entered_at`: Data de entrada
- `completed_at`: Data de conclusão

#### `dim_products`
Produtos para formulário de compras:
- `firebase_id`: ID do produto
- `catalog_key`: Chave do catálogo
- `name`: Nome do produto
- `codigo`: Código do produto
- `unidade`: Unidade de medida
- `quantidade_min`: Quantidade mínima
- `quantidade_max`: Quantidade máxima
- `preco_atual`: Preço atual

#### `dim_product_catalogs`
Catálogos de produtos:
- `firebase_id`: ID do catálogo
- `name`: Nome do catálogo
- `company_key`: Chave da empresa

## Impacto

### ✅ O que funciona agora APENAS com PostgreSQL:
1. Criação de workflows
2. Edição de workflows
3. Listagem de workflows
4. Ativação/desativação de workflows
5. Duplicação de workflows
6. Exclusão de workflows
7. Carregamento de produtos em formulários de compras

### ⚠️ O que ainda usa Firestore:
1. Respostas de formulários regulares (não-workflow)
2. Usuários e colaboradores
3. Empresas e departamentos
4. Outros formulários que não sejam de compras

## Próximos Passos (Opcional)

Se desejar migrar completamente para PostgreSQL:
1. Migrar `workflowInstanceService.ts` para usar APIs PostgreSQL
2. Criar tabelas para instâncias de workflow no PostgreSQL
3. Migrar histórico de workflow para PostgreSQL
4. Atualizar componentes de visualização de workflow

## Testes Recomendados

1. ✅ Criar novo workflow
2. ✅ Editar workflow existente
3. ✅ Listar workflows
4. ✅ Ativar/desativar workflow
5. ✅ Duplicar workflow
6. ✅ Excluir workflow
7. ✅ Adicionar produtos em formulário de compras

## Notas Importantes

- **Sem gravação no Firestore**: Workflows e produtos agora são lidos/gravados APENAS no PostgreSQL
- **Compatibilidade**: IDs do Firestore são mantidos como `firebase_id` para compatibilidade
- **Performance**: Queries otimizadas com índices nas tabelas PostgreSQL
- **Rollback**: Se necessário, os serviços antigos ainda existem em `workflowService.ts` e `workflowInstanceService.ts`
