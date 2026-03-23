# 🧪 Guia Prático de Testes - Fluxo de Compras (Passo a Passo)

## 📌 Como Usar Este Guia

Este guia contém **testes práticos** que você pode executar diretamente na interface do BravoFlow. Cada teste tem:
- ✅ **Pré-requisitos** - O que você precisa antes de começar
- 📝 **Passos** - Ações exatas para executar
- ✔️ **Resultado Esperado** - O que deve acontecer
- ❌ **Se Falhar** - O que fazer se não funcionar

---

## 🚀 PREPARAÇÃO INICIAL

### Passo 0: Configurar Ambiente de Teste

#### 0.1 - Iniciar Aplicação
```bash
# No terminal, na pasta do projeto
npm run dev
```

**✔️ Resultado Esperado:**
- Servidor rodando em `http://localhost:3000`
- Console sem erros

---

#### 0.2 - Fazer Login no BravoFlow
1. Acessar `http://localhost:3000`
2. Fazer login com suas credenciais
3. Ir para o menu **BravoFlow**

**✔️ Resultado Esperado:**
- Dashboard do BravoFlow aberto
- Menu lateral visível com opções

---

#### 0.3 - Verificar Permissões do Usuário

**IMPORTANTE:** Para testar o fluxo completo, você precisa de um usuário com múltiplas permissões ou criar usuários diferentes para cada setor:

- **Gerente** - Para aprovação de pedidos
- **Faturamento** - Para validação de fornecedor e upload XML
- **Operação** - Para formulário de recebimento

**Opção 1 (Recomendada para testes):**
- Usar usuário Admin que tem todas as permissões

**Opção 2 (Mais realista):**
- Criar 3 usuários diferentes, um para cada setor
- Fazer logout/login entre etapas

**✔️ Resultado Esperado:**
- Usuário com permissões adequadas logado

---

## 🔧 TESTE 1: CRIAR WORKFLOW DE COMPRAS

### Objetivo
Criar o workflow de compras através da interface do BravoFlow.

### Passos

**1.1** - No menu lateral, clicar em **"BravoFlow"**

**1.2** - Clicar no botão **"Adicionar Etapas"** ou **"Criar Workflow"**

**✔️ Resultado Esperado:**
- Modal ou página de criação de workflow aberta

---

**1.3** - Preencher informações básicas:
- **Nome:** "Processo de Compras com Validação XML"
- **Descrição:** "Fluxo completo de compras com validação automática de NF-e"

---

**1.4** - Adicionar Etapa 1 - Aprovação Gerencial

Clicar em **"Adicionar Etapa"** e preencher:
- **Nome da Etapa:** "Aprovação Gerencial"
- **Tipo:** Aprovação (ou Documentação)
- **Cor:** Escolher uma cor (ex: azul)
- **Requisitos:**
  - ☑️ Exigir comentário: NÃO
  - ☐ Exigir anexos: NÃO
- **Usuários Permitidos:** 
  - Selecionar usuários com role "gerente" OU
  - Deixar vazio para todos os gerentes

**✔️ Resultado Esperado:**
- Etapa 1 criada e visível na lista

---

**1.5** - Adicionar Etapa 2 - Validação de Fornecedor

Clicar em **"Adicionar Etapa"** novamente:
- **Nome da Etapa:** "Validação de Fornecedor"
- **Tipo:** Validação (ou Aprovação)
- **Cor:** Verde
- **Requisitos:**
  - ☐ Exigir comentário: NÃO
  - ☐ Exigir anexos: NÃO
- **Usuários Permitidos:** 
  - Selecionar usuários do setor "faturamento"

---

**1.6** - Adicionar Etapa 3 - Upload XML NF-e

- **Nome da Etapa:** "Upload XML NF-e"
- **Tipo:** Documentação
- **Cor:** Laranja
- **Requisitos:**
  - ☐ Exigir comentário: NÃO
  - ☑️ Exigir anexos: SIM (para o XML)
- **Usuários Permitidos:** 
  - Setor "faturamento"

---

**1.7** - Adicionar Etapa 4 - Recebimento

- **Nome da Etapa:** "Formulário de Recebimento"
- **Tipo:** Execução (ou Documentação)
- **Cor:** Roxo
- **Requisitos:**
  - ☐ Exigir comentário: NÃO
  - ☐ Exigir anexos: NÃO (fotos são opcionais)
- **Usuários Permitidos:** 
  - Setor "operação" ou "qualidade"

---

**1.8** - Salvar Workflow

- Clicar em **"Salvar Workflow"** ou **"Criar"**
- **IMPORTANTE:** Anotar ou copiar o **ID do workflow** criado

**✔️ Resultado Esperado:**
- Workflow criado com sucesso
- Aparece na lista de workflows
- 4 etapas visíveis
- Status: Ativo

---

## 📦 TESTE 2: CRIAR PEDIDO DE COMPRA (PARA TESTE)

### Objetivo
Criar um pedido de compra de teste no Firestore que será detectado automaticamente pelo workflow.

**IMPORTANTE:** O pedido de compra **não é criado pela interface do BravoFlow**. Ele é criado por outro sistema (ERP, planilha, etc.) e o BravoFlow **detecta automaticamente** pedidos novos e inicia o workflow.

Para fins de teste, vamos criar um pedido manualmente no Firestore para simular a criação por outro sistema.

### Passos

**2.1** - Abrir [Firebase Console](https://console.firebase.google.com)

**2.2** - Selecionar projeto BRAVOFORM

**2.3** - Ir em **Firestore Database**

**2.4** - Verificar se existe a collection `purchase_orders`
- Se não existir, criar clicando em "Iniciar coleção"

**2.5** - Clicar em **"Adicionar documento"**

**2.6** - Deixar o ID auto-gerado ou usar: `test-order-001`

**2.7** - Adicionar documento com os seguintes campos:

```json
{
  "orderNumber": "PED-2024-001",
  "status": "novo",
  "isExcludedFromDetection": false,
  "totalValue": 15000,
  "createdBy": "SEU_USER_ID",
  "createdByName": "João Silva",
  "companyId": "company-1",
  "departmentId": "dept-compras",
  "createdAt": "TIMESTAMP_ATUAL",
  "supplier": {
    "cnpj": "12.345.678/0001-90",
    "name": "Fornecedor Teste LTDA",
    "address": "Rua Teste, 123",
    "contact": "(11) 98765-4321"
  },
  "items": [
    {
      "description": "Produto A",
      "quantity": 100,
      "unitPrice": 50.00,
      "totalPrice": 5000.00,
      "code": "PROD-A-001",
      "unit": "UN"
    },
    {
      "description": "Produto B",
      "quantity": 50,
      "unitPrice": 200.00,
      "totalPrice": 10000.00,
      "code": "PROD-B-002",
      "unit": "UN"
    }
  ]
}
```

**2.8** - Clicar em **"Salvar"**

**✔️ Resultado Esperado:**
- Documento criado no Firestore
- Todos os campos visíveis
- Status: "novo"
- isExcludedFromDetection: false

**📸 Verificação Visual:**
- No Firestore, você deve ver o documento criado
- Expandir o documento e conferir todos os campos

---

## 🔍 TESTE 3: ATIVAR DETECÇÃO AUTOMÁTICA DE PEDIDOS

### Objetivo
Configurar e ativar o PedidoDetectionService para detectar automaticamente o pedido criado.

### Pré-requisitos
- ✅ TESTE 1 concluído (workflow criado)
- ✅ TESTE 2 concluído (pedido criado no Firestore)

---

### 3.1 - Abrir Console do Navegador

**3.1.1** - No BravoFlow (`http://localhost:3000/bravoflow`), pressionar **F12**

**3.1.2** - Ir para aba **"Console"**

**3.1.3** - Colar e executar o seguinte código:

**⚠️ IMPORTANTE:** Substituir `WORKFLOW_ID` pelo ID do workflow que você criou no TESTE 1

```javascript
// Importar serviço
const { PedidoDetectionService } = await import('/src/services/pedidoDetectionService.ts');

// Configurar detecção
const config = {
  pollInterval: 5000,           // Verificar a cada 5 segundos
  statusFilter: 'novo',          // Apenas pedidos com status 'novo'
  autoCreateInstance: true,      // Criar instância automaticamente
  workflowId: 'SEU_WORKFLOW_ID', // ← SUBSTITUIR pelo ID do TESTE 1
  enabled: true
};

// Iniciar detecção
PedidoDetectionService.startDetection(config);

// Verificar status
console.log('✅ Detecção iniciada:', PedidoDetectionService.getStatus());
```

**✔️ Resultado Esperado no Console:**
```javascript
✅ Detecção iniciada: { isRunning: true }
```

---

### 3.2 - Aguardar Detecção Automática

**3.2.1** - Aguardar **10 segundos**

**3.2.2** - Voltar para a interface do BravoFlow

**3.2.3** - Atualizar a página (F5)

**✔️ Resultado Esperado:**
- Uma nova **instância de workflow** deve aparecer na lista
- Nome: "Processo de Compras com Validação XML"
- Status: Em andamento
- Etapa atual: "Aprovação Gerencial"

---

### 3.3 - Verificar no Firestore (Opcional)

**3.3.1** - Abrir Firebase Console → Firestore

**3.3.2** - Verificar collection `workflow_instances`
- Deve haver um novo documento
- Campo `workflowId` = ID do seu workflow
- Campo `currentStage` = 0 (primeira etapa)
- Campo `status` = "in_progress"

**3.3.3** - Verificar o pedido em `purchase_orders`
- Documento PED-2024-001
- Campo `status` mudou de "novo" → "em_processo"
- Campo `workflowInstanceId` preenchido

**✔️ Resultado Esperado:**
- ✅ Instância criada automaticamente
- ✅ Pedido vinculado ao workflow
- ✅ Status atualizado

**❌ Se Falhar:**
- Verificar se o workflow está ativo
- Verificar se o pedido tem `status: 'novo'`
- Verificar console do navegador para erros
- Verificar Firestore Rules (permissões)

---

## ✅ TESTE 4: APROVAÇÃO GERENCIAL

### Objetivo
Testar o componente PurchaseApprovalStep na interface do workflow.

### Pré-requisitos
- ✅ TESTE 3 concluído (instância criada automaticamente)

---

### 4.1 - Acessar Etapa de Aprovação

**Passos:**

**4.1.1** - Ir para `http://localhost:3000/bravoflow`

**4.1.2** - Localizar a instância criada na lista (deve estar visível)

**4.1.3** - Clicar na instância para abrir

**4.1.4** - A etapa "Aprovação Gerencial" deve ser exibida

**✔️ Resultado Esperado:**
- Componente PurchaseApprovalStep renderizado
- Dados do pedido exibidos:
  - Número: PED-2024-001
  - Fornecedor: Fornecedor Teste LTDA
  - CNPJ: 12.345.678/0001-90
  - Valor Total: R$ 15.000,00
- Tabela com 2 itens (Produto A e Produto B)
- Botões "Aprovar" e "Rejeitar" visíveis

---

### 4.2 - Testar Rejeição COM Comentário

**Passos:**

**4.2.1** - Clicar no botão "Rejeitar Pedido"

**✔️ Resultado Esperado:**
- Formulário de comentário aparece
- Label: "Comentário (obrigatório):"

**4.2.2** - Deixar campo de comentário vazio

**4.2.3** - Clicar em "Confirmar Rejeição"

**✔️ Resultado Esperado:**
- ❌ Alert: "Comentário é obrigatório ao rejeitar um pedido"
- Formulário não é enviado

**4.2.4** - Digitar no campo: "Pedido com valores acima do orçamento"

**4.2.5** - Clicar em "Confirmar Rejeição"

**✔️ Resultado Esperado:**
- ✅ Formulário enviado
- Workflow avança ou finaliza (dependendo da configuração)
- Comentário registrado no histórico

---

### 4.3 - Testar Aprovação SEM Comentário

**Passos:**

**4.3.1** - Resetar o teste (criar novo pedido ou resetar instância)

**4.3.2** - Clicar no botão "Aprovar Pedido"

**✔️ Resultado Esperado:**
- Formulário de comentário aparece
- Label: "Comentário (opcional):"

**4.3.3** - Deixar campo de comentário vazio

**4.3.4** - Clicar em "Confirmar Aprovação"

**✔️ Resultado Esperado:**
- ✅ Formulário enviado com sucesso
- Workflow avança para próxima etapa
- Sem erros

---

### 4.4 - Testar Aprovação COM Comentário

**Passos:**

**4.4.1** - Resetar o teste

**4.4.2** - Clicar em "Aprovar Pedido"

**4.4.3** - Digitar: "Pedido aprovado conforme orçamento"

**4.4.4** - Clicar em "Confirmar Aprovação"

**✔️ Resultado Esperado:**
- ✅ Aprovação registrada
- ✅ Comentário salvo no histórico
- ✅ Workflow avança

---

## 🏢 TESTE 5: VALIDAÇÃO DE FORNECEDOR

### Objetivo
Testar o componente SupplierValidationStep.

### Pré-requisitos
- ✅ TESTE 4 concluído (pedido aprovado)

---

### 5.1 - Acessar Etapa de Validação

**Passos:**

**5.1.1** - Workflow deve estar na etapa "Validação de Fornecedor"

**5.1.2** - Componente SupplierValidationStep renderizado

**✔️ Resultado Esperado:**
- Card com dados do fornecedor:
  - Razão Social: Fornecedor Teste LTDA
  - CNPJ: 12.345.678/0001-90
- Pergunta: "O fornecedor está correto?"
- 2 botões: "Não, fornecedor diferente" | "Sim, fornecedor correto"

---

### 5.2 - Testar Fornecedor CORRETO

**Passos:**

**5.2.1** - Clicar em "Sim, fornecedor correto"

**✔️ Resultado Esperado:**
- Botão fica selecionado (fundo azul)
- Botão "Confirmar Validação" aparece

**5.2.2** - Clicar em "Confirmar Validação"

**✔️ Resultado Esperado:**
- ✅ Validação registrada
- ✅ Workflow avança para "Upload XML NF-e"
- ✅ No Firestore, campo `supplierValidation.fornecedorCorreto: true`

---

### 5.3 - Testar Fornecedor DIFERENTE

**Passos:**

**5.3.1** - Resetar teste (criar nova instância)

**5.3.2** - Na etapa de validação, clicar em "Não, fornecedor diferente"

**✔️ Resultado Esperado:**
- Botão selecionado
- ⚠️ Alerta amarelo aparece: "Informe o fornecedor correto..."
- Formulário aparece com 2 campos:
  - CNPJ do Fornecedor Correto
  - Razão Social do Fornecedor Correto

**5.3.3** - Deixar campos vazios

**5.3.4** - Tentar clicar em "Confirmar Validação"

**✔️ Resultado Esperado:**
- Botão desabilitado (não clica)

**5.3.5** - Preencher CNPJ: `98765432000100`

**✔️ Resultado Esperado:**
- CNPJ formatado automaticamente: `98.765.432/0001-00`

**5.3.6** - Preencher Razão Social: `Fornecedor Correto LTDA`

**5.3.7** - Clicar em "Confirmar Validação"

**✔️ Resultado Esperado:**
- ✅ Validação registrada
- ✅ Dados do novo fornecedor salvos
- ✅ Campo `requiresReorder: true`
- ✅ Notificação enviada para Compras (se implementado)

---

## 📄 TESTE 6: UPLOAD DE XML

### Objetivo
Testar o componente XMLUploadStep com arquivo XML real.

### Pré-requisitos
- ✅ TESTE 5 concluído (fornecedor validado)
- ✅ Arquivo XML de teste criado

---

### 6.1 - Criar Arquivo XML de Teste

**Passos:**

**6.1.1** - Criar arquivo `nfe-teste.xml` com o seguinte conteúdo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe12345678901234567890123456789012345678901234">
      <ide>
        <nNF>12345</nNF>
        <serie>1</serie>
        <dhEmi>2024-03-23T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000190</CNPJ>
        <xNome>Fornecedor Teste LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <xProd>Produto A</xProd>
          <NCM>12345678</NCM>
          <qCom>100</qCom>
          <vUnCom>50.00</vUnCom>
          <vProd>5000.00</vProd>
          <uCom>UN</uCom>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <xProd>Produto B</xProd>
          <NCM>87654321</NCM>
          <qCom>50</qCom>
          <vUnCom>200.00</vUnCom>
          <vProd>10000.00</vProd>
          <uCom>UN</uCom>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>15000.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>
```

**6.1.2** - Salvar arquivo

---

### 6.2 - Testar Upload com Arquivo Inválido

**Passos:**

**6.2.1** - Workflow deve estar na etapa "Upload XML NF-e"

**6.2.2** - Componente XMLUploadStep renderizado

**✔️ Resultado Esperado:**
- Área de upload visível
- Ícone de upload
- Texto: "Selecione o arquivo XML da Nota Fiscal"
- Botão: "Selecionar Arquivo XML"

**6.2.3** - Tentar fazer upload de arquivo .txt ou .pdf

**✔️ Resultado Esperado:**
- ❌ Erro exibido: "Por favor, selecione um arquivo XML válido"
- Upload não processado

---

### 6.3 - Testar Upload com XML Válido

**Passos:**

**6.3.1** - Clicar em "Selecionar Arquivo XML"

**6.3.2** - Selecionar `nfe-teste.xml`

**✔️ Resultado Esperado:**
- ⏳ Mensagem "Processando..." aparece
- Após 1-2 segundos:
  - ✅ Box verde: "XML processado com sucesso!"
  - Preview dos dados aparece

**6.3.3** - Verificar Preview - Informações da Nota:
- Número NF-e: 12345
- Série: 1
- Data de Emissão: 23/03/2024
- Chave de Acesso: (se disponível)

**6.3.4** - Verificar Preview - Emitente:
- Razão Social: Fornecedor Teste LTDA
- CNPJ: 12.345.678/0001-90 (formatado)

**6.3.5** - Verificar Preview - Itens:
- Tabela com 2 linhas
- Item 1: Produto A, 100 UN, R$ 50,00, R$ 5.000,00
- Item 2: Produto B, 50 UN, R$ 200,00, R$ 10.000,00
- Total: R$ 15.000,00

**✔️ Resultado Esperado:**
- Todos os dados exibidos corretamente
- Valores formatados em R$
- CNPJ formatado

**6.3.6** - Clicar em "Cancelar"

**✔️ Resultado Esperado:**
- Preview desaparece
- Volta para tela de upload
- Arquivo limpo

**6.3.7** - Fazer upload novamente

**6.3.8** - Clicar em "Confirmar e Validar"

**✔️ Resultado Esperado:**
- ✅ XML salvo
- ✅ Validação automática executada
- ✅ Workflow avança (se sem divergências) OU
- ✅ Vai para etapa de Resolução de Divergências (se houver)

---

## ⚠️ TESTE 7: RESOLUÇÃO DE DIVERGÊNCIAS

### Objetivo
Testar o componente DivergenceResolutionStep com XML que tem divergências.

### Pré-requisitos
- ✅ XML com divergências criado

---

### 7.1 - Criar XML com Divergências

**Passos:**

**7.1.1** - Criar arquivo `nfe-divergente.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe12345678901234567890123456789012345678901234">
      <ide>
        <nNF>12346</nNF>
        <serie>1</serie>
        <dhEmi>2024-03-23T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000190</CNPJ>
        <xNome>Fornecedor Teste LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <xProd>Produto A</xProd>
          <NCM>12345678</NCM>
          <qCom>95</qCom>
          <vUnCom>52.00</vUnCom>
          <vProd>4940.00</vProd>
          <uCom>UN</uCom>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <xProd>Produto B</xProd>
          <NCM>87654321</NCM>
          <qCom>50</qCom>
          <vUnCom>210.00</vUnCom>
          <vProd>10500.00</vProd>
          <uCom>UN</uCom>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>15440.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>
```

**Divergências neste XML:**
- Produto A: quantidade 95 (pedido: 100) ❌
- Produto A: preço unitário R$ 52,00 (pedido: R$ 50,00) ⚠️
- Produto B: preço unitário R$ 210,00 (pedido: R$ 200,00) ⚠️
- Total: R$ 15.440,00 (pedido: R$ 15.000,00) ❌

---

### 7.2 - Upload XML com Divergências

**Passos:**

**7.2.1** - Fazer upload do `nfe-divergente.xml`

**✔️ Resultado Esperado:**
- XML processado
- Validação automática detecta divergências
- Workflow vai para etapa "Resolução de Divergências"

---

### 7.3 - Verificar Exibição de Divergências

**Passos:**

**7.3.1** - Componente DivergenceResolutionStep renderizado

**✔️ Resultado Esperado:**
- Título: "Divergências Encontradas"
- 2 cards de resumo:
  - Card vermelho: "X Críticas"
  - Card amarelo: "Y Avisos"

**7.3.2** - Verificar tabela comparativa

**✔️ Resultado Esperado:**
- Tabela com colunas:
  - Campo
  - Valor no XML
  - Valor no Pedido
  - Severidade
- Linhas com divergências:
  - Produto A - Quantidade: 95 vs 100 (❌ Crítico)
  - Produto A - Valor Unitário: R$ 52,00 vs R$ 50,00 (⚠️ Aviso)
  - Produto B - Valor Unitário: R$ 210,00 vs R$ 200,00 (⚠️ Aviso)
  - Valor Total: R$ 15.440,00 vs R$ 15.000,00 (❌ Crítico)
- Linhas críticas com fundo vermelho claro
- Linhas de aviso com fundo amarelo claro

---

### 7.4 - Testar Opção A: Seguir com Justificativa

**Passos:**

**7.4.1** - Clicar no card "Seguir mesmo assim"

**✔️ Resultado Esperado:**
- Card fica selecionado (fundo azul)
- Formulário aparece com textarea
- Label: "Justificativa (obrigatório):"

**7.4.2** - Deixar campo vazio

**7.4.3** - Tentar clicar em "Confirmar Resolução"

**✔️ Resultado Esperado:**
- Botão desabilitado

**7.4.4** - Digitar justificativa:
```
Fornecedor ajustou quantidade e preços conforme negociação verbal com gerência. 
Valores aprovados pelo diretor comercial em 22/03/2024.
```

**7.4.5** - Clicar em "Confirmar Resolução"

**✔️ Resultado Esperado:**
- ✅ Resolução registrada
- ✅ Justificativa salva no histórico
- ✅ Workflow continua para próxima etapa

---

### 7.5 - Testar Opção B: Modificar Pedido

**Passos:**

**7.5.1** - Resetar teste (criar nova instância com divergências)

**7.5.2** - Clicar no card "Modificar pedido atual"

**✔️ Resultado Esperado:**
- Card selecionado
- Mensagem informativa aparece:
  "O pedido será atualizado e a validação será refeita automaticamente."

**7.5.3** - Clicar em "Confirmar Resolução"

**✔️ Resultado Esperado:**
- ✅ Pedido marcado para modificação
- ✅ Workflow aguarda atualização do pedido
- (Funcionalidade de atualização automática pode ser implementada)

---

### 7.6 - Testar Opção C: Novo Pedido

**Passos:**

**7.6.1** - Resetar teste

**7.6.2** - Clicar no card "Fazer novo pedido"

**✔️ Resultado Esperado:**
- Card selecionado
- Formulário aparece com campo de texto
- Label: "Número do novo pedido (obrigatório):"
- ⚠️ Aviso: "O novo pedido será automaticamente excluído da detecção automática."

**7.6.3** - Deixar campo vazio

**7.6.4** - Tentar confirmar

**✔️ Resultado Esperado:**
- Botão desabilitado

**7.6.5** - Digitar: `PED-2024-002`

**7.6.6** - Clicar em "Confirmar Resolução"

**✔️ Resultado Esperado:**
- ✅ Resolução registrada
- ✅ Novo número de pedido salvo
- ✅ No Firestore, `excluded_orders` tem novo documento:
  - orderNumber: "PED-2024-002"
  - reason: "refazer_divergencia"
  - parentOrderId: "PED-2024-001"

**7.6.7** - Verificar exclusão automática

**Criar pedido PED-2024-002 no Firestore:**
- orderNumber: "PED-2024-002"
- status: "novo"
- isExcludedFromDetection: true ← **IMPORTANTE**

**Aguardar 10 segundos**

**✔️ Resultado Esperado:**
- ❌ PedidoDetectionService NÃO cria nova instância
- ✅ Pedido permanece com status "novo"
- ✅ Exclusão funcionando corretamente

---

## 📦 TESTE 8: FORMULÁRIO DE RECEBIMENTO

### Objetivo
Testar o componente ReceivingFormStep.

### Pré-requisitos
- ✅ Workflow na etapa de Recebimento
- ✅ XML já validado

---

### 8.1 - Acessar Formulário de Recebimento

**Passos:**

**8.1.1** - Workflow deve estar na etapa "Recebimento"

**8.1.2** - Componente ReceivingFormStep renderizado

**✔️ Resultado Esperado:**
- Título: "Formulário de Recebimento"
- Card com informações da NF-e (auto-preenchidas):
  - NF-e: 12345
  - Fornecedor: Fornecedor Teste LTDA
  - Data de Emissão: 23/03/2024
  - Data de Recebimento: (hoje)
- Tabela de conferência de itens

---

### 8.2 - Verificar Auto-Preenchimento

**Passos:**

**8.2.1** - Verificar tabela de itens

**✔️ Resultado Esperado:**
- 2 linhas (Produto A e Produto B)
- Colunas:
  - # | Descrição | Qtd. NF-e | Qtd. Recebida | Condição | Observações
- Qtd. Recebida auto-preenchida com valor da NF-e
- Condição padrão: "✅ Conforme"

---

### 8.3 - Testar Conferência SEM Discrepâncias

**Passos:**

**8.3.1** - Deixar todas as quantidades iguais à NF-e

**8.3.2** - Deixar todas as condições como "Conforme"

**8.3.3** - Preencher assinatura: "Maria Santos"

**8.3.4** - Clicar em "Concluir Recebimento"

**✔️ Resultado Esperado:**
- ✅ Formulário enviado
- ✅ Campo `discrepancies.hasDiscrepancies: false`
- ✅ Workflow concluído

---

### 8.4 - Testar Conferência COM Discrepâncias

**Passos:**

**8.4.1** - Resetar teste

**8.4.2** - Alterar Produto A:
- Qtd. Recebida: `95` (em vez de 100)
- Linha fica amarela

**✔️ Resultado Esperado:**
- ⚠️ Alerta aparece: "1 item(ns) com discrepância detectada(s)"
- Linha do Produto A com fundo amarelo

**8.4.3** - Alterar Produto B:
- Condição: "⚠️ Avariado"
- Observações: "Embalagem danificada"

**✔️ Resultado Esperado:**
- ⚠️ Alerta atualiza: "2 item(ns) com discrepância detectada(s)"
- Linha do Produto B também amarela

**8.4.4** - Adicionar observações gerais:
```
Recebimento parcial. Produto A com 5 unidades faltantes.
Produto B com avaria na embalagem externa, produto interno OK.
```

**8.4.5** - Preencher assinatura: "Carlos Oliveira"

**8.4.6** - Clicar em "Concluir Recebimento"

**✔️ Resultado Esperado:**
- ✅ Formulário enviado
- ✅ Campo `discrepancies.hasDiscrepancies: true`
- ✅ Campo `discrepancies.totalDiscrepancies: 2`
- ✅ Observações salvas

---

### 8.5 - Testar Upload de Fotos

**Passos:**

**8.5.1** - Resetar teste

**8.5.2** - Clicar em "Adicionar Fotos"

**8.5.3** - Selecionar 2-3 imagens

**✔️ Resultado Esperado:**
- Grid de fotos aparece
- Cada foto com preview
- Botão "×" em cada foto

**8.5.4** - Clicar no "×" de uma foto

**✔️ Resultado Esperado:**
- Foto removida do grid

**8.5.5** - Preencher assinatura e enviar

**✔️ Resultado Esperado:**
- ✅ Fotos salvas (base64 ou URLs)
- ✅ Campo `photos` preenchido

---

### 8.6 - Testar Validação de Assinatura

**Passos:**

**8.6.1** - Resetar teste

**8.6.2** - Preencher todos os campos EXCETO assinatura

**8.6.3** - Tentar clicar em "Concluir Recebimento"

**✔️ Resultado Esperado:**
- Botão desabilitado (não clica)

**8.6.4** - Preencher assinatura

**✔️ Resultado Esperado:**
- Botão habilitado

---

## 🎯 TESTE 9: FLUXO COMPLETO (CAMINHO FELIZ)

### Objetivo
Executar o fluxo completo do início ao fim sem divergências.

### Passos

**9.1** - Criar pedido PED-2024-003 (status: novo)

**9.2** - Aguardar detecção automática (10s)

**✔️ Checkpoint:** Instância criada

**9.3** - Aprovar pedido (gerente)
- Comentário opcional: "Aprovado"

**✔️ Checkpoint:** Etapa 1 concluída

**9.4** - Validar fornecedor (faturamento)
- Selecionar: "Sim, fornecedor correto"

**✔️ Checkpoint:** Etapa 2 concluída

**9.5** - Upload XML (faturamento)
- Usar `nfe-teste.xml` (sem divergências)

**✔️ Checkpoint:** Etapa 3 concluída, validação OK

**9.6** - Preencher recebimento (operação)
- Conferir itens: tudo conforme
- Assinatura: "José Pereira"

**✔️ Checkpoint:** Workflow concluído

**9.7** - Verificar no Firestore:
- `workflow_instances` → status: "completed"
- `stageHistory` com 4 entradas
- Todos os dados salvos

**✔️ SUCESSO:** Fluxo completo funcionando! 🎉

---

## 🔄 TESTE 10: FLUXO COM FORNECEDOR DIFERENTE

### Objetivo
Testar o caminho de refazer pedido por fornecedor incorreto.

### Passos

**10.1** - Criar pedido PED-2024-004

**10.2** - Aprovar pedido

**10.3** - Na validação de fornecedor:
- Selecionar: "Não, fornecedor diferente"
- CNPJ: 11.222.333/0001-44
- Nome: Fornecedor Real LTDA

**✔️ Checkpoint:** Validação salva com `requiresReorder: true`

**10.4** - Verificar notificação para Compras (se implementado)

**10.5** - Compras cria novo pedido PED-2024-005

**10.6** - Verificar `excluded_orders`:
- PED-2024-005 deve estar na lista
- reason: "refazer_fornecedor"
- parentOrderId: PED-2024-004

**10.7** - Criar PED-2024-005 no Firestore com:
- isExcludedFromDetection: true

**10.8** - Aguardar 10s

**✔️ Checkpoint:** PED-2024-005 NÃO cria nova instância

**10.9** - Vincular PED-2024-005 à instância existente manualmente

**10.10** - Continuar fluxo normalmente

**✔️ SUCESSO:** Refazer pedido funcionando! 🎉

---

## ✅ CHECKLIST FINAL

Marque cada item após testar:

### Serviços Backend
- [ ] PedidoDetectionService detecta novos pedidos
- [ ] PedidoDetectionService respeita exclusões
- [ ] XMLParserService valida XML NF-e
- [ ] XMLParserService extrai dados corretamente
- [ ] XMLValidationService compara XML vs Pedido
- [ ] XMLValidationService classifica severidade
- [ ] ExcludedOrdersManager adiciona exclusões
- [ ] ExcludedOrdersManager marca pedidos

### Componentes UI
- [ ] PurchaseApprovalStep exibe dados
- [ ] PurchaseApprovalStep valida comentário em rejeição
- [ ] PurchaseApprovalStep permite aprovação sem comentário
- [ ] SupplierValidationStep formata CNPJ
- [ ] SupplierValidationStep valida campos obrigatórios
- [ ] XMLUploadStep valida tipo de arquivo
- [ ] XMLUploadStep faz parse e preview
- [ ] DivergenceResolutionStep exibe divergências
- [ ] DivergenceResolutionStep valida justificativa obrigatória
- [ ] DivergenceResolutionStep valida número de novo pedido
- [ ] ReceivingFormStep auto-preenche dados
- [ ] ReceivingFormStep detecta discrepâncias
- [ ] ReceivingFormStep valida assinatura obrigatória
- [ ] ReceivingFormStep faz upload de fotos

### Fluxos Completos
- [ ] Fluxo completo sem divergências (Teste 8)
- [ ] Fluxo com fornecedor diferente (Teste 9)
- [ ] Fluxo com divergências + justificativa
- [ ] Fluxo com divergências + modificar pedido
- [ ] Fluxo com divergências + novo pedido

### Regras de Negócio
- [ ] Pedidos excluídos não disparam detecção
- [ ] Validação XML automática funciona
- [ ] Justificativa obrigatória em divergências
- [ ] Comentário obrigatório em rejeição
- [ ] Novo pedido é excluído automaticamente
- [ ] Fornecedor diferente refaz pedido

---

## 🐛 Problemas Comuns e Soluções

### Problema: "PedidoDetectionService não detecta pedidos"
**Soluções:**
1. Verificar se workflow tem `isActive: true`
2. Verificar se pedido tem `status: 'novo'`
3. Verificar se `isExcludedFromDetection: false`
4. Verificar Firestore Rules (permissões)
5. Verificar console para erros

### Problema: "XML não faz parse"
**Soluções:**
1. Validar estrutura do XML (tags obrigatórias)
2. Verificar encoding (UTF-8)
3. Usar XML real de NF-e da SEFAZ
4. Verificar console para erro específico

### Problema: "Componente não renderiza"
**Soluções:**
1. Verificar imports corretos
2. Verificar props obrigatórias
3. Abrir console (F12) e ver erros
4. Verificar se CSS Module está importado

### Problema: "Validação sempre retorna divergente"
**Soluções:**
1. Verificar formatação de CNPJ (sem pontos/barras)
2. Verificar tipos de dados (number vs string)
3. Usar `console.log` para comparar valores
4. Verificar tolerância de valores (1% padrão)

---

## 📞 Suporte

Se encontrar problemas não listados:
1. Verificar console do navegador (F12)
2. Verificar Firestore Rules
3. Verificar logs do Firebase
4. Revisar documentação em `FEATURE_WORKFLOW.md`

---

**Boa sorte com os testes! 🚀**
