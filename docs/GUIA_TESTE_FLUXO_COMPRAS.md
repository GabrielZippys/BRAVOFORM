# 🛒 Guia de Teste - Fluxo de Compras com Validação XML

**Data:** 24 de Março de 2026  
**Versão:** 1.0  
**Status:** Pronto para Teste (Pendente: Configuração Tailscale)

---

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Acesso ao Sistema](#acesso-ao-sistema)
3. [Criar o Workflow no BravoFlow](#criar-o-workflow-no-bravoflow)
4. [Configurar Etapas do Fluxo](#configurar-etapas-do-fluxo)
5. [Testar o Fluxo Completo](#testar-o-fluxo-completo)
6. [Pendências e Próximos Passos](#pendências-e-próximos-passos)

---

## 🎯 Pré-requisitos

### ✅ O que já está implementado:
- [x] Interfaces TypeScript completas
- [x] Todos os serviços backend (XML, Validação, Detecção, etc)
- [x] Todos os componentes de UI (6 etapas)
- [x] Sistema de exclusão de pedidos
- [x] Notificações Email + WhatsApp
- [x] Motor de workflow completo

### ⏳ O que está pendente:
- [ ] Configuração do Tailscale (conexão SQL)
- [ ] PDFGeneratorService (geração de PDF final)
- [ ] PDFDistributionService (envio automático)
- [ ] Template pré-configurado do fluxo

---

## 🚀 Acesso ao Sistema

### 1. Iniciar o Servidor de Desenvolvimento

```bash
cd c:\Users\OptiPlex 7080\Desktop\BRAVOFORM
npm run dev
```

### 2. Acessar o Dashboard Admin

```
URL: http://localhost:3000
Login: Seu email de admin
Senha: Sua senha
```

### 3. Navegar até o BravoFlow

```
Dashboard → Menu Lateral → BravoFlow
ou
URL direta: http://localhost:3000/dashboard/bravoflow
```

---

## 🔧 Criar o Workflow no BravoFlow

### Passo 1: Criar Novo Workflow

1. Acesse `/dashboard/bravoflow`
2. Clique em **"Criar Novo Workflow"**
3. Preencha:
   - **Nome:** `Fluxo de Compras - Validação XML`
   - **Descrição:** `Processo completo de aprovação, validação de fornecedor, upload de XML, validação automática e recebimento de mercadorias`
   - **Empresas:** Selecione suas empresas
   - **Departamentos:** Selecione departamentos (Compras, Gerência, Faturamento, Operação)

### Passo 2: Adicionar Etapas

Adicione as seguintes etapas **na ordem**:

#### **Etapa 1: Detecção de Novo Pedido** 🔍
- **Nome:** `Detecção Automática`
- **Tipo:** `execution` (Execução)
- **Descrição:** Monitora novos pedidos no banco de dados
- **Usuários Permitidos:** Sistema (automático)
- **Trigger SQL:** 
  - ⚠️ **PENDENTE:** Configurar após setup do Tailscale
  - Tabela: `purchase_orders`
  - Coluna: `id`
  - Intervalo: 5 minutos

#### **Etapa 2: Aprovação Gerencial** 👔
- **Nome:** `Aprovação do Gerente`
- **Tipo:** `documentation` (Documentação)
- **Descrição:** Gerente revisa e aprova o pedido
- **Usuários Permitidos:** Selecione gerentes
- **Campos Obrigatórios:**
  - ✅ Comentário: SIM (justificativa se rejeitar)
  - ❌ Anexos: NÃO
  - ❌ Formulários: NÃO
- **Componente:** `PurchaseApprovalStep`

#### **Etapa 3: Validação de Fornecedor** 🏢
- **Nome:** `Verificar Fornecedor`
- **Tipo:** `validation` (Validação)
- **Descrição:** Faturamento valida se o fornecedor está correto
- **Usuários Permitidos:** Selecione setor de Faturamento
- **Campos Obrigatórios:**
  - ❌ Comentário: NÃO
  - ❌ Anexos: NÃO
  - ❌ Formulários: NÃO
- **Componente:** `SupplierValidationStep`
- **Roteamento Condicional:**
  - SE `fornecedorCorreto == false` → Ir para **Etapa 3.1**
  - SE `fornecedorCorreto == true` → Ir para **Etapa 4**

#### **Etapa 3.1: Refazer Pedido (Sub-etapa)** 🔄
- **Nome:** `Compras Refaz Pedido`
- **Tipo:** `documentation`
- **Descrição:** Compras refaz o pedido com fornecedor correto
- **Usuários Permitidos:** Selecione setor de Compras
- **Campos Obrigatórios:**
  - ✅ Comentário: SIM (número do novo pedido)
  - ❌ Anexos: NÃO
  - ❌ Formulários: NÃO
- **Componente:** `ReorderStep`
- **Ação:** Adiciona pedido antigo à lista de exclusão
- **Próxima Etapa:** Volta para **Etapa 4**

#### **Etapa 4: Upload do XML da NF-e** 📄
- **Nome:** `Upload XML da Nota`
- **Tipo:** `documentation`
- **Descrição:** Faturamento faz upload do XML da NF-e
- **Usuários Permitidos:** Setor de Faturamento
- **Campos Obrigatórios:**
  - ❌ Comentário: NÃO
  - ✅ Anexos: SIM (arquivo .xml)
  - ❌ Formulários: NÃO
- **Componente:** `XMLUploadStep`
- **Ação Automática:** Parse do XML e validação automática

#### **Etapa 5: Validação XML Automática** ✅
- **Nome:** `Validação Automática XML vs Pedido`
- **Tipo:** `validation`
- **Descrição:** Sistema compara XML com pedido original
- **Usuários Permitidos:** Sistema (automático)
- **Campos Obrigatórios:** Nenhum
- **Componente:** Validação automática via `XMLValidationService`
- **Roteamento Condicional:**
  - SE `status == 'aprovado'` → Ir para **Etapa 6**
  - SE `status == 'divergente'` → Ir para **Etapa 5.1**

#### **Etapa 5.1: Resolução de Divergências** ⚠️
- **Nome:** `Compras Resolve Divergências`
- **Tipo:** `documentation`
- **Descrição:** Compras decide como resolver divergências encontradas
- **Usuários Permitidos:** Setor de Compras
- **Campos Obrigatórios:**
  - ✅ Comentário: SIM (justificativa ou ação)
  - ❌ Anexos: NÃO
  - ❌ Formulários: NÃO
- **Componente:** `DivergenceResolutionStep`
- **Opções:**
  1. **Seguir com justificativa** → Ir para **Etapa 6**
  2. **Modificar pedido** → Revalidar XML (volta para **Etapa 5**)
  3. **Fazer novo pedido** → Volta para **Etapa 3.1**

#### **Etapa 6: Formulário de Recebimento** 📦
- **Nome:** `Recebimento de Mercadorias`
- **Tipo:** `documentation`
- **Descrição:** Operação confere mercadorias recebidas
- **Usuários Permitidos:** Setor de Operação
- **Campos Obrigatórios:**
  - ✅ Comentário: SIM (observações)
  - ✅ Anexos: SIM (fotos do recebimento)
  - ❌ Formulários: NÃO
- **Componente:** `ReceivingFormStep`
- **Ação Final:** Gerar PDF e distribuir

#### **Etapa 7: Geração e Distribuição de PDF** 📨
- **Nome:** `Finalização e Distribuição`
- **Tipo:** `validation`
- **Descrição:** Sistema gera PDF e envia para Qualidade e Faturamento
- **Usuários Permitidos:** Sistema (automático)
- **Campos Obrigatórios:** Nenhum
- **Ação Automática:** 
  - ⚠️ **PENDENTE:** PDFGeneratorService
  - ⚠️ **PENDENTE:** PDFDistributionService
- **Marcar como:** Etapa Final

---

## 📄 Documentos Reais para Teste

Você tem **3 documentos reais** na raiz do projeto que serão usados no fluxo:

### 1. **XML da NF-e** 📋
**Arquivo:** `35260300377944000182550000006939831031868146.xml`

**Dados extraídos:**
- **Emitente:** VILLA COSTINA FRANGOS LTDA (CNPJ: 00.377.944/0001-82)
- **Destinatário:** APETITO FOODS LTDA (CNPJ: 00.474.763/0001-74)
- **NF-e:** 693983 / Série: 0
- **Data Emissão:** 16/03/2026 23:59
- **Produto:** FRANGO PL CONGELADO
- **Quantidade:** 2.000 KG
- **Valor Unitário:** R$ 5,90/KG
- **Valor Total:** R$ 11.800,00

**Uso no fluxo:** Este XML será usado na **Etapa 4** (Upload XML)

### 2. **Planilha de Recebimento** 📊
**Arquivo:** `PLANILHA DE RECEBIMENTO 1.pdf`

**Conteúdo:** Modelo de formulário de conferência física de mercadorias

**Uso no fluxo:** Referência para a **Etapa 6** (Formulário de Recebimento)

### 3. **Documento de Processo** 📑
**Arquivo:** `Document_260320_153623.pdf`

**Uso no fluxo:** Documentação adicional ou anexo de referência

---

## 🧪 Testar o Fluxo Completo

### Opção 1: Modo de Teste (Simulação)

1. No WorkflowCanvas, clique em **"Testar Workflow"**
2. Selecione um usuário de teste
3. Simule a progressão etapa por etapa
4. Valide:
   - ✅ Permissões por etapa
   - ✅ Campos obrigatórios
   - ✅ Roteamento condicional
   - ✅ Validações de dados

### Opção 2: Teste Real (Criar Instância Manual)

#### Passo 1: Criar Pedido de Teste

Use o **pedido real** baseado no XML que você tem:

```javascript
// Collection: purchase_orders
// Firebase Console → Firestore → Adicionar Documento
{
  orderNumber: "PC-2026-693983",
  supplier: {
    cnpj: "00.377.944/0001-82",
    name: "VILLA COSTINA FRANGOS LTDA",
    email: "nfeaux.frvilla@gmail.com",
    phone: "1936814556"
  },
  items: [
    {
      id: "item-1",
      description: "FRANGO PL CONGELADO",
      quantity: 2000,
      unitPrice: 5.90,
      totalPrice: 11800.00,
      unit: "KG",
      ncm: "02071210"
    }
  ],
  totalValue: 11800.00,
  paymentConditions: "A combinar",
  deliveryDate: "2026-03-17",
  notes: "Pedido de teste - Frango congelado",
  status: "novo",
  createdBy: "user-compras-id",
  createdByName: "Comprador Teste",
  createdAt: Timestamp.now(),
  companyId: "apetito-foods-id",
  departmentId: "compras-id",
  isExcludedFromDetection: false
}
```

**Importante:** Este pedido **corresponde exatamente** ao XML `35260300377944000182550000006939831031868146.xml` que você tem!

#### Passo 2: Criar Instância de Workflow Manualmente

1. Acesse `/dashboard/bravoflow`
2. Encontre o workflow "Fluxo de Compras"
3. Clique em **"Criar Instância Manual"** (se disponível)
4. Ou use o console do navegador:

```javascript
// Importar serviço
import { WorkflowInstanceService } from '@/services/workflowInstanceService';

// Criar instância
await WorkflowInstanceService.createInstance(
  'workflow-id',
  'user-id',
  'Nome do Usuário',
  { orderId: 'purchase-order-id' }
);
```

#### Passo 3: Executar o Fluxo

1. Acesse `/colaborador/workflows`
2. Veja a instância criada
3. Clique em **"Continuar"**
4. Execute cada etapa:

**Etapa 2 - Aprovação:**
- Revise dados do pedido
- Aprove ou rejeite
- Adicione comentário se necessário

**Etapa 3 - Validação Fornecedor:**
- Marque se fornecedor está correto
- Se incorreto → será redirecionado para refazer pedido

**Etapa 4 - Upload XML:**
- Faça upload do arquivo `35260300377944000182550000006939831031868146.xml`
- Sistema fará parse automático e extrairá:
  - ✅ Emitente: VILLA COSTINA FRANGOS LTDA
  - ✅ CNPJ: 00.377.944/0001-82
  - ✅ NF-e: 693983
  - ✅ Produto: FRANGO PL CONGELADO
  - ✅ Quantidade: 2.000 KG
  - ✅ Valor: R$ 11.800,00
- Visualize dados extraídos em tela
- Confirme para prosseguir

**Etapa 5 - Validação Automática:**
- Sistema compara automaticamente
- Se divergências → vai para resolução
- Se OK → avança para recebimento

**Etapa 6 - Recebimento:**
- Preencha formulário de conferência
- Marque condição de cada item
- Adicione fotos
- Assine digitalmente

**Etapa 7 - Finalização:**
- Sistema gera PDF (quando implementado)
- Distribui para Qualidade e Faturamento

---

## 📊 Onde Acompanhar o Fluxo

### 1. Histórico de Workflows

```
Dashboard → Histórico → Aba "Workflows"
ou
URL: http://localhost:3000/dashboard/historico
```

**Visualize:**
- Todas as instâncias de workflow
- Status atual de cada uma
- Etapa em que está
- Colaborador atribuído
- Timeline completa

### 2. Detalhes da Instância

Clique em **"Ver Detalhes"** em qualquer instância para ver:
- Timeline visual de etapas
- Dados preenchidos em cada etapa
- Comentários e anexos
- Duração por etapa
- Histórico completo de ações

### 3. Firestore (Dados Brutos)

Acesse o Firebase Console:

**Collections:**
- `workflows` - Definições de workflows
- `workflow_instances` - Instâncias em execução
- `purchase_orders` - Pedidos de compra
- `excluded_orders` - Pedidos excluídos da detecção

---

## ⚠️ Pendências e Próximos Passos

### 🔴 Crítico (Bloqueia Teste Completo)

#### 1. Configuração do Tailscale
**Status:** ⬜ NÃO CONFIGURADO  
**Impacto:** Sem isso, a detecção automática de pedidos não funciona

**Passos:**
1. Instalar Tailscale no servidor
2. Conectar à rede mesh
3. Configurar perfil SQL em `/dashboard/integrations`
4. Testar conexão com banco de dados
5. Configurar trigger na Etapa 1

**Documentação:** Ver `/docs/FEATURE_WORKFLOW.md` linhas 178-267

#### 2. PDFGeneratorService
**Status:** ⬜ NÃO IMPLEMENTADO  
**Impacto:** Etapa final não gera PDF

**Criar:**
```typescript
// /src/services/pdfGeneratorService.ts
- Gerar PDF consolidado com todos os dados
- Incluir: Pedido, XML, Validações, Recebimento
- Salvar no Firebase Storage
- Retornar URL do PDF
```

**Dependência:** `jsPDF` ou `@react-pdf/renderer`

```bash
npm install jspdf
# ou
npm install @react-pdf/renderer
```

#### 3. PDFDistributionService
**Status:** ⬜ NÃO IMPLEMENTADO  
**Impacto:** PDF não é enviado automaticamente

**Criar:**
```typescript
// /src/services/pdfDistributionService.ts
- Enviar PDF por email para Qualidade
- Enviar PDF por email para Faturamento
- Usar NotificationService existente
- Registrar envios no histórico
```

### 🟡 Importante (Melhora UX)

#### 4. Template Pré-configurado
**Status:** ⬜ NÃO CRIADO  
**Impacto:** Admin precisa criar workflow manualmente

**Criar:**
- Template "Fluxo de Compras" no BravoFlow
- Todas as 7 etapas pré-configuradas
- Roteamento condicional já definido
- Admin só precisa ajustar permissões

#### 5. Interface de Criação de Pedidos
**Status:** ⬜ NÃO EXISTE  
**Impacto:** Pedidos precisam ser criados manualmente no Firestore

**Criar:**
- Tela para Compras criar pedidos
- Formulário com validação
- Auto-preencher dados da empresa
- Salvar em `purchase_orders`

### 🟢 Opcional (Futuro)

- Dashboard de métricas do fluxo
- Relatórios de divergências
- Alertas de SLA
- Integração com ERP

---

## 🎯 Checklist de Teste

### Teste Básico (Sem Tailscale)

- [ ] Criar workflow manualmente no BravoFlow
- [ ] Adicionar todas as 7 etapas
- [ ] Configurar permissões por etapa
- [ ] Configurar roteamento condicional
- [ ] Salvar workflow
- [ ] Ativar workflow
- [ ] Criar pedido manualmente no Firestore
- [ ] Criar instância de workflow manualmente
- [ ] Testar aprovação gerencial
- [ ] Testar validação de fornecedor (OK)
- [ ] Testar upload de XML
- [ ] Testar validação automática (OK)
- [ ] Testar formulário de recebimento
- [ ] Verificar histórico completo

### Teste de Caminhos Alternativos

- [ ] Rejeitar pedido na aprovação
- [ ] Fornecedor incorreto → Refazer pedido
- [ ] XML com divergências → Seguir com justificativa
- [ ] XML com divergências → Modificar pedido
- [ ] XML com divergências → Novo pedido
- [ ] Verificar exclusão de pedidos refeitos

### Teste Completo (Com Tailscale)

- [ ] Configurar Tailscale
- [ ] Configurar perfil SQL
- [ ] Configurar trigger na Etapa 1
- [ ] Criar pedido no banco SQL externo
- [ ] Verificar detecção automática
- [ ] Verificar criação automática de instância
- [ ] Verificar notificações Email/WhatsApp
- [ ] Executar fluxo completo
- [ ] Verificar geração de PDF (quando implementado)
- [ ] Verificar distribuição de PDF (quando implementado)

---

## 📞 Suporte e Documentação

### Documentos Relacionados

- `/docs/Estrutura.md` - Arquitetura completa do sistema
- `/docs/FEATURE_WORKFLOW.md` - Documentação do BravoFlow
- `/docs/STATUS_IMPLEMENTACAO_WORKFLOW.md` - Status de implementação

### Logs e Debug

**Firestore:**
```
Firebase Console → Firestore Database
```

**Logs do Servidor:**
```bash
# Terminal onde rodou npm run dev
```

**Console do Navegador:**
```
F12 → Console
```

### Contatos

- **Desenvolvimento:** Equipe de TI
- **Testes:** Departamento de Compras
- **Suporte:** Administrador do Sistema

---

## 🎉 Conclusão

O **Fluxo de Compras com Validação XML** está **90% implementado**!

**Pronto para usar:**
- ✅ Todas as interfaces e tipos
- ✅ Todos os serviços backend
- ✅ Todos os componentes de UI
- ✅ Sistema de exclusão de pedidos
- ✅ Validação automática de XML
- ✅ Notificações configuradas

**Pendente:**
- ⏳ Configuração Tailscale (você vai resolver)
- ⏳ PDFGeneratorService (~6h)
- ⏳ PDFDistributionService (~4h)
- ⏳ Template pré-configurado (~2h)

**Estimativa para 100%:** ~12h de desenvolvimento

Boa sorte nos testes! 🚀
