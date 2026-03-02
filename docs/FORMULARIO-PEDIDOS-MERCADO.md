 📦 Formulário de Pedidos com Grade de Itens (MERCADO)

 🎯 Objetivo

Implementar um **motor configurável de pedidos transacionais** que permite aos usuários montar pedidos com múltiplos produtos, selecionando itens individualmente e especificando quantidades e variações.

---

 🧩 Visão Geral da Funcionalidade

 O que é?

Um novo tipo de campo de formulário que funciona como um **motor de itens configurável**, permitindo:

- Busca e seleção de produtos de um banco de dados
- Seleção de variações (cor, tamanho, etc.)
- Definição de quantidades
- Adição de múltiplos itens antes do envio
- Visualização em grade dos itens adicionados
- Edição e remoção de itens

 Por que é importante?

Este recurso transforma a plataforma de um simples construtor de formulários em uma **ferramenta operacional completa**, capaz de:

- Processar pedidos de venda e reposição
- Controlar estoque e inventário
- Gerenciar requisições internas
- Processos de compras
- Checklists com itens e quantidades
- Controle de produção

---

 📋 Análise da Estrutura Atual

 Tipos de Campos Existentes

Atualmente, a plataforma suporta os seguintes tipos de campos (conforme `BRAVOFORM\src\types\index.ts:59`):

```typescript
type FieldType = 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 
                 'Múltipla Escolha' | 'Data' | 'Cabeçalho' | 'Tabela';
```

 Campo "Tabela" Atual

O campo `Tabela` existente (`BRAVOFORM\src\types\index.ts:66-72`) possui:

```typescript
columns?: {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
}[];
rows?: { id: string; label: string; }[];
```

**Limitação:** Este campo é estático - as linhas e colunas são pré-definidas pelo criador do formulário. Não permite ao usuário final adicionar/remover linhas dinamicamente.

---

 🆕 Novo Campo: "Grade de Pedidos"

 Tipo de Campo

Adicionar um novo tipo: `'Grade de Pedidos'` ou `'Order Grid'`

 Estrutura de Dados

```typescript
interface OrderGridField extends FormField {
  type: 'Grade de Pedidos';
  
  // Configuração da fonte de dados
  dataSource: {
    type: 'firestore' | 'static';
    collection?: string;        // Nome da coleção Firestore
    filters?: {                 // Filtros opcionais (ex: companyId)
      field: string;
      operator: '==' | '!=' | '>' | '<';
      value: string;
    }[];
    displayField: string;       // Campo a exibir (ex: 'nome', 'descricao')
    valueField: string;         // Campo de valor único (ex: 'id', 'codigo')
  };
  
  // Campos dependentes (variações)
  variations?: {
    id: string;
    label: string;              // Ex: "Cor", "Tamanho"
    dependsOn: string;          // Campo do produto que contém as opções
    required: boolean;
  }[];
  
  // Configuração de quantidade
  quantityConfig: {
    label: string;              // Ex: "Quantidade"
    min: number;                // Mínimo (default: 1)
    max?: number;               // Máximo opcional
    step: number;               // Incremento (default: 1)
    decimals: boolean;          // Permite decimais? (default: false)
  };
  
  // Campos adicionais por item
  additionalFields?: {
    id: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    required: boolean;
    options?: string[];
  }[];
  
  // Configurações de exibição
  displayConfig: {
    showSearch: boolean;        // Mostrar campo de busca
    showImages: boolean;        // Mostrar imagens dos produtos
    imageField?: string;        // Campo da imagem no documento
    columns: {                  // Colunas da grade de resumo
      field: string;
      label: string;
      width?: string;
    }[];
  };
}
```

---

 🎨 Componentes Necessários

 1. **OrderGridBuilder** (Editor no Form Builder)

Componente para configurar o campo no construtor de formulários.

**Localização:** `BRAVOFORM\src\components\OrderGridBuilder.tsx`

**Funcionalidades:**
- Configurar fonte de dados (coleção Firestore)
- Definir campos de exibição e valor
- Configurar variações (cor, tamanho, etc.)
- Configurar campo de quantidade
- Definir campos adicionais
- Preview da configuração

 2. **OrderGridField** (Campo no Formulário de Resposta)

Componente renderizado quando o usuário preenche o formulário.

**Localização:** `BRAVOFORM\src\components\OrderGridField.tsx`

**Funcionalidades:**
- Botão "Adicionar Item" que abre modal/expansível
- Campo de busca/dropdown de produtos
- Seletores de variações (dependentes do produto selecionado)
- Campo de quantidade com stepper (+/-)
- Campos adicionais configurados
- Grade de itens adicionados
- Ações: editar e remover item
- Validação: não permitir envio com grade vazia (se obrigatório)

 3. **OrderItemModal** (Modal/Expansível para Adicionar Item)

**Localização:** `BRAVOFORM\src\components\OrderItemModal.tsx`

**Funcionalidades:**
- Busca/seleção de produto
- Campos de variação (aparecem após selecionar produto)
- Campo de quantidade
- Botão "Adicionar ao Pedido"
- Botão "Cancelar"

 4. **OrderItemsTable** (Tabela de Itens Adicionados)

**Localização:** `BRAVOFORM\src\components\OrderItemsTable.tsx`

**Funcionalidades:**
- Exibir itens adicionados
- Colunas configuráveis
- Ações por linha (editar, remover)
- Totalizadores (se aplicável)

---

 🔄 Fluxo de Dados

 1. Configuração (Form Builder)

```
Admin cria formulário
  → Adiciona campo "Grade de Pedidos"
  → Configura fonte de dados (ex: coleção "produtos")
  → Define variações (ex: cor, tamanho)
  → Configura quantidade
  → Salva formulário
```

 2. Preenchimento (Form Response)

```
Usuário abre formulário
  → Clica em "Adicionar Item"
  → Busca/seleciona produto
  → Sistema carrega variações do produto
  → Usuário seleciona variações
  → Define quantidade
  → Clica "Adicionar ao Pedido"
  → Item aparece na grade
  → Repete para mais itens
  → Clica "Enviar"
  → Sistema valida e salva
```

 3. Armazenamento

Estrutura de dados salva no Firestore:

```json
{
  "formId": "form_123",
  "collaboratorId": "user_456",
  "responses": {
    "field_pedido_001": {
      "items": [
        {
          "productId": "prod_789",
          "productName": "Coca-Cola",
          "variations": {
            "tamanho": "2L"
          },
          "quantity": 5,
          "additionalData": {}
        },
        {
          "productId": "prod_790",
          "productName": "Gatorade",
          "variations": {
            "sabor": "Uva",
            "tamanho": "500ml"
          },
          "quantity": 10,
          "additionalData": {}
        }
      ],
      "totalItems": 2,
      "totalQuantity": 15
    }
  },
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

---

 🛠️ Implementação Técnica

 Fase 1: Estrutura de Tipos e Interfaces

**Arquivo:** `BRAVOFORM\src\types\index.ts`

**Ações:**
1. Adicionar tipo `'Grade de Pedidos'` ao `FieldType`
2. Criar interface `OrderGridField`
3. Criar interfaces auxiliares:
   - `DataSourceConfig`
   - `VariationConfig`
   - `QuantityConfig`
   - `OrderItem`
   - `OrderGridValue`

 Fase 2: Componente de Configuração (Builder)

**Arquivo:** `BRAVOFORM\src\components\OrderGridBuilder.tsx`

**Componentes:**
- Seletor de coleção Firestore
- Configurador de filtros
- Configurador de variações
- Configurador de quantidade
- Preview da configuração

**Integração:**
- Adicionar ao `FieldProperties` em `BRAVOFORM\src\components\EnhancedFormBuilder.tsx`
- Adicionar ícone ao `FIELD_TYPES`

 Fase 3: Componente de Resposta (Form Response)

**Arquivo:** `BRAVOFORM\src\components\OrderGridField.tsx`

**Estado:**
```typescript
const [items, setItems] = useState<OrderItem[]>([]);
const [isAddingItem, setIsAddingItem] = useState(false);
const [editingIndex, setEditingIndex] = useState<number | null>(null);
```

**Funções principais:**
- `handleAddItem(item: OrderItem)`
- `handleEditItem(index: number, item: OrderItem)`
- `handleRemoveItem(index: number)`
- `validateItems(): boolean`

**Integração:**
- Adicionar ao `renderField` em `BRAVOFORM\src\components\FormResponse.tsx`

 Fase 4: Modal de Adição de Item

**Arquivo:** `BRAVOFORM\src\components\OrderItemModal.tsx`

**Funcionalidades:**
- Busca de produtos (Firestore query)
- Carregamento dinâmico de variações
- Validação de campos obrigatórios
- Callback para adicionar item

 Fase 5: Tabela de Itens

**Arquivo:** `BRAVOFORM\src\components\OrderItemsTable.tsx`

**Funcionalidades:**
- Renderização responsiva
- Ações inline (editar/remover)
- Totalizadores
- Tema customizável (seguir `FormTheme`)

 Fase 6: Validação e Submissão

**Arquivo:** `BRAVOFORM\src\components\FormResponse.tsx`

**Validações:**
- Campo obrigatório: verificar se `items.length > 0`
- Quantidade mínima/máxima
- Campos obrigatórios de cada item

**Submissão:**
- Serializar itens para JSON
- Salvar no Firestore
- Gerar PDF com itens (histórico)

---

 📊 Exemplo de Uso: Pedido de Mercado

 Configuração do Formulário

**Nome:** Pedido de Reposição - Mercado

**Campos:**

1. **Cliente** (Texto, obrigatório)
2. **Data de Entrega** (Data, obrigatório)
3. **Itens do Pedido** (Grade de Pedidos, obrigatório)
   - Fonte de dados: Coleção `produtos`
   - Filtro: `categoria == 'bebidas'`
   - Campo de exibição: `nome`
   - Campo de valor: `codigo`
   - Variações:
     - Tamanho (campo: `tamanhos`, obrigatório)
   - Quantidade:
     - Label: "Quantidade"
     - Min: 1
     - Decimais: não
   - Colunas da grade:
     - Produto
     - Tamanho
     - Quantidade
     - Ações

 Exemplo de Preenchimento

**Usuário:** Loja ABC

**Ações:**
1. Preenche "Cliente": "Loja ABC"
2. Seleciona "Data de Entrega": "2026-02-28"
3. Clica "Adicionar Item"
4. Busca "Coca-Cola"
5. Seleciona tamanho: "2L"
6. Define quantidade: 10
7. Clica "Adicionar ao Pedido"
8. Repete para outros produtos
9. Revisa a grade de itens
10. Clica "Enviar"

**Resultado salvo:**
```json
{
  "cliente": "Loja ABC",
  "dataEntrega": "2026-02-28",
  "itensPedido": {
    "items": [
      {
        "productId": "063015",
        "productName": "Coca-Cola",
        "variations": { "tamanho": "2L" },
        "quantity": 10
      },
      {
        "productId": "063022",
        "productName": "Gatorade",
        "variations": { "tamanho": "500ml" },
        "quantity": 24
      }
    ],
    "totalItems": 2,
    "totalQuantity": 34
  }
}
```

---

 🎯 Diferenças entre Campo "Tabela" e "Grade de Pedidos"

| Aspecto | Tabela Atual | Grade de Pedidos (Novo) |
|---------|--------------|-------------------------|
| **Linhas** | Pré-definidas pelo admin | Dinâmicas (usuário adiciona) |
| **Fonte de dados** | Estática | Firestore (dinâmica) |
| **Busca** | Não possui | Campo de busca integrado |
| **Variações** | Não suporta | Campos dependentes |
| **Validação** | Por célula | Por item completo |
| **Uso típico** | Matriz de dados fixos | Pedidos, requisições |

---

 📝 Checklist de Implementação

 ✅ Fase 1: Tipos e Interfaces
- [ ] Adicionar `'Grade de Pedidos'` ao `FieldType`
- [ ] Criar interface `OrderGridField`
- [ ] Criar interface `OrderItem`
- [ ] Criar interface `OrderGridValue`
- [ ] Criar interfaces de configuração

 ✅ Fase 2: Builder (Configuração)
- [ ] Criar componente `OrderGridBuilder.tsx`
- [ ] Adicionar ao `FIELD_TYPES` com ícone
- [ ] Integrar ao `FieldProperties`
- [ ] Implementar seletor de coleção Firestore
- [ ] Implementar configurador de variações
- [ ] Implementar configurador de quantidade
- [ ] Adicionar preview

 ✅ Fase 3: Form Response (Preenchimento)
- [ ] Criar componente `OrderGridField.tsx`
- [ ] Implementar botão "Adicionar Item"
- [ ] Integrar ao `renderField` em `FormResponse.tsx`
- [ ] Implementar validação de campo obrigatório

 ✅ Fase 4: Modal de Item
- [ ] Criar componente `OrderItemModal.tsx`
- [ ] Implementar busca de produtos (Firestore)
- [ ] Implementar seletores de variações
- [ ] Implementar campo de quantidade com stepper
- [ ] Implementar validação

 ✅ Fase 5: Tabela de Itens
- [ ] Criar componente `OrderItemsTable.tsx`
- [ ] Implementar renderização de itens
- [ ] Implementar ação "Editar"
- [ ] Implementar ação "Remover"
- [ ] Adicionar totalizadores
- [ ] Aplicar tema do formulário

 ✅ Fase 6: Validação e Submissão
- [ ] Adicionar validação em `FormResponse.tsx`
- [ ] Implementar serialização de dados
- [ ] Testar salvamento no Firestore
- [ ] Implementar geração de PDF com itens

 ✅ Fase 7: Testes e Refinamentos
- [ ] Testar com diferentes configurações
- [ ] Testar responsividade mobile
- [ ] Testar validações
- [ ] Otimizar performance (lazy loading)
- [ ] Documentar código

---

 🔐 Considerações de Segurança

 Firestore Rules

Garantir que as regras do Firestore permitam:
- Leitura da coleção de produtos (autenticado)
- Escrita de respostas apenas pelo próprio usuário
- Validação de estrutura de dados

```javascript
// Exemplo de regra
match /responses/{responseId} {
  allow create: if request.auth != null 
    && request.resource.data.collaboratorId == request.auth.uid;
  
  allow read, update: if request.auth != null 
    && resource.data.collaboratorId == request.auth.uid;
}
```

 Validação de Dados

- Validar IDs de produtos existem
- Validar quantidades dentro dos limites
- Sanitizar inputs de busca
- Prevenir injeção de dados maliciosos

---

 🚀 Melhorias Futuras

 Versão 1.0 (MVP)
- Busca simples de produtos
- Variações básicas (1 nível)
- Quantidade inteira
- Grade simples

 Versão 2.0
- Busca avançada (filtros múltiplos)
- Variações aninhadas (cor → tamanho)
- Quantidade decimal
- Cálculo de totais (preço × quantidade)
- Importação de itens (CSV, Excel)

 Versão 3.0
- Integração com estoque (verificar disponibilidade)
- Sugestões inteligentes (produtos frequentes)
- Histórico de pedidos (copiar pedido anterior)
- Aprovação de pedidos (workflow)
- Exportação para ERP

---

 📚 Referências de Código

 Componentes Relacionados

- `BRAVOFORM\src\components\EnhancedFormBuilder.tsx` - Builder principal
- `BRAVOFORM\src\components\FormResponse.tsx` - Renderização de respostas
- `BRAVOFORM\src\types\index.ts` - Tipos TypeScript

 Padrões de Código

**Nomenclatura:**
- Componentes: PascalCase (`OrderGridField`)
- Funções: camelCase (`handleAddItem`)
- Constantes: UPPER_SNAKE_CASE (`FIELD_TYPES`)

**Estilo:**
- Seguir tema do formulário (`FormTheme`)
- Usar componentes Lucide para ícones
- Manter consistência com campos existentes

**Estado:**
- Usar `useState` para estado local
- Usar `useEffect` para efeitos colaterais
- Evitar prop drilling (considerar Context se necessário)

---

 🎨 Wireframe Detalhado

 Modo de Adição (Expansível)

```
┌────────────────────────────────────────────────────┐
│ Itens do Pedido *                                  │
├────────────────────────────────────────────────────┤
│                                                    │
│  [+] Adicionar Item                                │
│                                                    │
│  ┌───────────────────────────────────────────────┐ │
│  │ 🔍 Buscar produto...
│  │   ▼ Coca-Cola 1L                              │ │
│  │     Coca-Cola 1,5L                            │ │
│  │     Coca-Cola 2L                              │ │
│  └───────────────────────────────────────────────┘ │
│                                                    │
│  Tamanho: [Dropdown: 2L ▼]                         │
│                                                    │
│  Quantidade: [−] [  5  ] [+]                       │
│                                                    │
│  [Adicionar ao Pedido]  [Cancelar]                 │
│                                                    │
├────────────────────────────────────────────────────┤
│ Itens Adicionados:                                 │
│                                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ Produto        │ Tamanho │ Qtd │ Ações      │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Coca-Cola      │ 2L      │  5  │ ✏️ 🗑️     │   │
│  │ Gatorade Uva   │ 500ml   │ 10  │ ✏️ 🗑️     │   │
│  │ Sprite         │ 1L      │  3  │ ✏️ 🗑️     │   │
│  └─────────────────────────────────────────────┘   │
│                                                    │
│  Total de itens: 3 | Total de unidades: 18         │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

 📖 Conclusão

Este documento define a arquitetura completa para implementação do **Motor de Pedidos Configurável** na plataforma BRAVOFORM.

A implementação seguirá uma abordagem incremental, começando com um MVP funcional e evoluindo com melhorias baseadas no feedback dos usuários.

**Próximos Passos:**
1. Revisar e aprovar este documento
2. Criar branch de desenvolvimento
3. Implementar Fase 1 (Tipos e Interfaces)
4. Implementar Fase 2 (Builder)
5. Testar e iterar

---

**Documento criado em:** 24 de fevereiro de 2026  
**Versão:** 1.0  
**Autor:** Equipe BRAVOFORM
