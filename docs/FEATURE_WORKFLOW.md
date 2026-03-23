 🔄 **FEATURE: BravoFlow - Sistema de Workflow Visual**

 📋 **Visão Geral da Feature** (Linhas 1-20)

**STATUS: ✅ IMPLEMENTADO (75% Completo)**

O **BravoFlow** é um sistema de workflow visual independente implementado no BRAVOFORM. Permite que administradores criem fluxos de trabalho personalizados com interface drag-and-drop usando ReactFlow, definam etapas customizadas, configurem permissões granulares e testem workflows em tempo real.

**Objetivo Principal:** ✅ Sistema de etapas customizáveis com editor visual, validações, temporizadores e modo de teste completo.

---

 🎯 **Conceito Estratégico: Como o Workflow Transforma o Sistema** (Linhas 21-80)

 **🔄 A Mudança Fundamental: De Formulário Estático para Ticket Dinâmico**

**ANTES (Sistema de Formulários):**
```
Formulário Criado → Preenchido → Salvo com Status Fixo → FIM
❌ Sem visibilidade do processo
❌ Status limitados (pending, approved, rejected)
❌ Histórico básico
❌ Sem controle de etapas
```

**AGORA (BravoFlow Implementado):**
```
Workflow Criado → Editor Visual → Etapas Configuradas → Modo de Teste → Deploy
✅ Editor visual com ReactFlow
✅ Etapas customizáveis com drag-and-drop
✅ Permissões granulares por usuário
✅ Campos obrigatórios (comentários, anexos, formulários)
✅ Temporizadores para etapas de espera
✅ Modo de teste completo
✅ Validação e progressão de etapas
```

 **🎯 O Conceito Central: "Tickets" em uma Esteira de Processos**

Cada resposta de formulário se transforma em um **"Ticket"** (ou Cartão) que:
- **Nasce** quando alguém preenche o formulário
- **Viaja** por uma esteira de processos personalizada
- **Acumula** histórico e anexos durante o percurso
- **Morre** (é finalizado) ao completar todas as etapas

**Analogia Prática:** Pense em uma linha de montagem de uma fábrica, mas para processos de negócio!

---

 🛠️ **✅ IMPLEMENTADO: Funcionalidades do Admin** (Linhas 81-200)

 **✅ 1. WorkflowCanvas - Editor Visual de Workflows**

**Componente:** `/src/components/WorkflowCanvas.tsx`

Editor visual completo usando ReactFlow com:

**Funcionalidades Implementadas:**
- ✅ Drag-and-drop de nós (etapas)
- ✅ Conexões visuais entre etapas
- ✅ Painel de configuração lateral
- ✅ Validação de conexões
- ✅ Roteamento condicional
- ✅ Botão "Testar Workflow"
- ✅ Salvar/Carregar workflows

**Tipos de Etapas Suportados:**
```typescript
- 'documentation' - Etapa de documentação
- 'validation' - Etapa de validação (sem campos)
- 'waiting' - Etapa de espera com timer
```

 **✅ 2. StageConfigPanel - Configuração de Etapas**

**Componente:** `/src/components/StageConfigPanel.tsx`

**Configurações Implementadas:**

**Permissões por Usuário:**
```typescript
interface WorkflowStage {
  allowedUsers: string[];  // IDs dos colaboradores permitidos
}
```
- ✅ Seleção múltipla de usuários
- ✅ Validação no modo de teste
- ✅ Apenas usuários permitidos podem avançar

**Campos Obrigatórios:**
- ✅ `requireComment: boolean` - Comentário obrigatório
- ✅ `requireAttachments: boolean` - Anexo obrigatório
- ✅ `formIds: string[]` - Formulários obrigatórios

**Temporizador (Etapas de Espera):**
```typescript
interface Timer {
  value: number;      // Tempo em segundos
  unit: 'seconds' | 'minutes' | 'hours' | 'days';
}
```

 **✅ 3. Sistema de Validação de Campos**

**Implementado em:** `WorkflowTestMode.tsx`

**Validações por Etapa:**
```typescript
interface StageField {
  id: string;
  type: 'comment' | 'attachment' | 'form';
  label: string;
  required: boolean;
  formId?: string;
}
```

**Fluxo de Validação:**
1. ✅ Sistema identifica campos obrigatórios da etapa
2. ✅ Apresenta campos um por vez
3. ✅ Barra de progresso visual
4. ✅ Botões "Voltar" e "Próximo"
5. ✅ Modal de validação ao completar todos os campos
6. ✅ Opções: Validar e Avançar, Rejeitar e Refazer, Destruir

 **⏳ 4. Sistema de Temporizadores**

**Implementado em:** `WorkflowTestMode.tsx`

**Funcionalidades:**
```typescript
// Timer automático para etapas de espera
const [timerSeconds, setTimerSeconds] = useState(0);
const [isTimerActive, setIsTimerActive] = useState(false);
```

**Features Implementadas:**
- ✅ Contagem regressiva visual
- ✅ Barra de progresso do tempo
- ✅ Formatação de tempo (minutos e segundos)
- ✅ Avanço automático ao fim do timer
- ✅ Ícone de relógio animado

**Exemplo de Uso:**
```
Etapa: "Aguardando Aprovação"
Timer: 2 minutos
Resultado: Avança automaticamente após 2 minutos
```

 **✅ 5. Roteamento Condicional**

**Componente:** `/src/components/RoutingConditionModal.tsx`

**Interface de Condições:**
```typescript
interface RoutingCondition {
  id: string;
  field: string;      // Campo a verificar
  operator: string;   // Operador de comparação
  value: string;      // Valor de comparação
  targetStageId: string; // Etapa destino
}
```

**Funcionalidades:**
- ✅ Configuração de múltiplas rotas por conexão
- ✅ Operadores: equals, notEquals, contains, etc
- ✅ Rota padrão (fallback)
- ✅ Interface visual de configuração

**Status:** Implementado mas não testado no modo de teste

---

 👷‍♂️ **✅ IMPLEMENTADO: WorkflowTestMode - Simulação Completa** (Linhas 201-350)

 **✅ 1. Seleção de Usuário e Início do Teste**

**Componente:** `WorkflowTestMode.tsx`

**Fluxo Implementado:**
```typescript
1. Botão "Testar Workflow" no WorkflowCanvas
2. Modal de seleção de usuário
3. Lista de usuários disponíveis (com permissão em alguma etapa)
4. Seleção do usuário
5. Visualização das etapas do workflow
6. Botão "Iniciar Teste"
```

**Features:**
- ✅ Carregamento de colaboradores do Firestore
- ✅ Filtro de usuários com permissão
- ✅ Interface limpa e intuitiva
- ✅ Botão "Trocar usuário" durante o teste

 **✅ 2. Progressão de Etapas**

**Lógica Implementada:**
```typescript
const getUserStages = () => {
  if (!selectedUser) return [];
  
  const currentStage = stages[currentStageIndex];
  if (!currentStage.allowedUsers.includes(selectedUser.id)) {
    return []; // Usuário não tem acesso
  }
  
  return [currentStage]; // Mostra apenas etapa atual
};
```

**Features:**
- ✅ Validação de permissão por etapa
- ✅ Exibição de etapas anteriores como concluídas
- ✅ Avanço sequencial entre etapas
- ✅ Histórico visual de progresso

 **✅ 3. Sistema de Campos Obrigatórios**

**Implementação:**
```typescript
const getStageFields = (): StageField[] => {
  const stage = getCurrentUserStage();
  const fields: StageField[] = [];
  
  if (stage.requireComment) {
    fields.push({ id: 'comment', type: 'comment', ... });
  }
  
  if (stage.requireAttachments) {
    fields.push({ id: 'attachment', type: 'attachment', ... });
  }
  
  if (stage.formIds && stage.formIds.length > 0) {
    stage.formIds.forEach((formId, index) => {
      fields.push({ id: `form-${formId}-${index}`, ... });
    });
  }
  
  return fields;
};
```

**Progressão Campo a Campo:**
- ✅ Exibe um campo por vez
- ✅ Barra de progresso (X de Y campos)
- ✅ Botões "Voltar" e "Próximo"
- ✅ Validação antes de avançar
- ✅ Armazenamento de dados preenchidos

 **✅ 4. Modal de Validação de Etapa**

**Exibido ao completar todos os campos:**
```typescript
const handleCompleteField = () => {
  if (currentFieldIndex < fields.length - 1) {
    setCurrentFieldIndex(currentFieldIndex + 1);
  } else {
    setShowValidationModal(true); // Mostra modal
  }
};
```

**Conteúdo do Modal:**
- ✅ Título: "Validação da Etapa"
- ✅ Exibição de todos os dados preenchidos
- ✅ Botão "Editar" para cada campo
- ✅ Três opções de ação:
  - ✅ Validar e Avançar (verde)
  - ✅ Rejeitar e Refazer (laranja)
  - ✅ Destruir Workflow (vermelho)

**Funcionalidade de Edição:**
- ✅ Volta para o campo específico
- ✅ Mantém dados já preenchidos
- ✅ Permite correção antes de validar

 **✅ 5. Suporte a Etapas Sem Campos**

**Problema Resolvido:**
Etapas de tipo "validation" não têm campos obrigatórios.

**Solução Implementada:**
```typescript
if (fields.length === 0) {
  return (
    <div className={styles.noFieldsMessage}>
      <p>Esta etapa não requer preenchimento de campos.</p>
      <button onClick={handleCompleteStage}>
        Concluir Etapa
      </button>
    </div>
  );
}
```

**Features:**
- ✅ Detecta etapas sem campos
- ✅ Exibe mensagem informativa
- ✅ Botão direto para concluir
- ✅ Esconde navegação de campos
- ✅ UX limpo e intuitivo

---

 💡 **Ideias Avançadas para o Futuro: O Roadmap Evolutivo** (Linhas 351-500)

 **🧠 1. Condicionais Inteligentes (If/Else): O "Cérebro" Lógico**

Sistema de regras automatizadas baseado em condições:

 **Regras de Negócio:**
```
SE campo "valor" > 1000
ENTÃO mover para "Aprovação Diretoria"
SENÃO mover para "Em Execução"

SE campo "urgencia" = "SIM"
ENTÃO pular etapa "Análise"
E definir prioridade "ALTA"

SE campo "tipo_cliente" = "VIP"
ENTÃO notificar gerente imediatamente
E reduzir SLA em 50%

SE campo "equipamento" = "CRÍTICO"
ENTÃO exigir 2 aprovações
E criar backup automático
```

 **Construtor Visual de Regras:**
- **Interface Drag & Drop**: Montar regras visualmente
- **Conectores Lógicos**: E/OU/NEGAÇÃO
- **Biblioteca de Condições**: Campos pré-definidos
- **Teste de Regras**: Simulação antes de ativar
- **Versionamento**: Histórico de mudanças nas regras

 **👥 2. Atribuição de Responsáveis: O "Sistema de Escalonamento"**

Além da etapa, definir **QUEM** é o responsável:

 **Tipos de Atribuição:**
- **🎯 Manual**: Usuário escolhe o responsável
- **🔄 Rodízio Automático**: Distribui igualmente entre equipe
- **🏆 Baseado em Skills**: Usuário com melhor qualificação
- **📍 Baseado em Localização**: Mais próximo geograficamente
- **⚖️ Baseado em Carga**: Usuário com menos tickets ativos

 **Gestão de Responsáveis:**
```
📝 Nova Solicitação → [Auto] Primeiro disponível
🔍 Em Análise → [Manual] Escolher analista
⏳ Aguardando Peça → [Auto] Departamento compras
🔧 Em Execução → [Skills] Técnico especializado
✅ Finalizada → [Auto] Sistema encerra
```

 **Recursos Avançados:**
- **Handoff**: Transferência responsável entre etapas
- **Substituição**: Temporariamente reatribuir tickets
- **Escalonamento**: Subir para nível superior
- **Colaboração**: Múltiplos responsáveis por ticket

 **📊 3. Métricas de Gargalos: A "Radiografia" do Processo**

Dashboard avançado para identificar problemas de produtividade:

 **Métricas de Performance:**
- **🐌 Etapas Mais Lentas**: Tempo médio por etapa
- **👥 Produtividade por Usuário**: Tickets resolvidos por pessoa
- **📈 Taxa de Conclusão**: Percentual finalizado vs criado
- **⏰ SLA Compliance**: Percentual dentro do prazo
- **🔄 Retrabalho**: Tickets que voltaram etapas

 **Visualizações Avançadas:**
```
📊 Gráfico de Funil (Funnel Chart):
   Nova [100] → Análise [85] → Execução [60] → Finalizado [45]

📈 Gráfico de Barras (Bottleneck):
   Aguardando Peça: ████████████████████ 72h (média)
   Em Execução:    ████████ 24h (média)
   Em Análise:     ████ 8h (média)

📊 Gráfico de Pizza (Distribuição):
   João: 35% │ Maria: 30% │ Carlos: 25% │ Outros: 10%
```

 **Alertas Inteligentes:**
- **🚨 Gargalo Detectado**: Etapa com tempo acima do normal
- **📉 Produtividade Baixa**: Usuário abaixo da média
- **⏰ SLA em Risco**: Tickets próximos do vencimento
- **🔄 Acúmulo**: Etapa com muitos tickets parados

 **🤖 4. Inteligência Artificial: O "Assistente" Predictivo**

Recursos de IA para otimizar processos:

 **Previsões e Recomendações:**
- **🔮 Previsão de SLA**: Estimativa de conclusão baseada no histórico
- **🎯 Sugestão de Responsável**: Melhor usuário para cada ticket
- **📊 Previsão de Volume**: Quantidade de tickets esperada
- **⚠️ Detecção de Anomalias**: Tickets fora do padrão normal

 **Automação Inteligente:**
- **🤖 Classificação Automática**: Categoria e prioridade baseadas no conteúdo
- **📝 Respostas Sugeridas**: Templates baseados no histórico
- **🔍 Detecção de Duplicatas**: Identificar tickets similares
- **📈 Otimização de Processos**: Sugestões de melhoria no fluxo

---

 🎯 **Validação de Casos de Uso Reais** (Linhas 501-600)

 **🏭 Caso 1: Manutenção Industrial - Ordem de Serviço**

 **Fluxo Completo:**
```
📝 Solicitação → 🔍 Triagem → 📋 Orçamento → 💰 Aprovação → 
🔧 Execução → 📸 Comprovação → ✅ Finalização → 📋 Faturamento
```

 **Regras Específicas:**
- **Equipamento Crítico**: Pula orçamento, vai direto para execução
- **Valor > R$ 5.000**: Exige aprovação da diretoria
- **Cliente VIP**: SLA reduzido em 50%
- **Fora de Garantia**: Exige aprovação do cliente antes de executar

 **Validações por Etapa:**
- **Orçamento**: Anexo obrigatório com 3 cotações
- **Execução**: Fotos "antes e depois" obrigatórias
- **Finalização**: Campo "solução aplicada" detalhado

 **🏢 Caso 2: Recursos Humanos - Processo Seletivo**

 **Fluxo Completo:**
```
📄 Candidatura → 🔍 Triagem Curricular → 👨‍💼 Entrevista 1 → 
🗣️ Entrevista 2 → 📋 Teste Prático → 💰 Aprovação → 📋 Contratação
```

 **Regras Específicas:**
- **Vaga Sênior**: Exige aprovação do diretor
- **Candidato Indicado**: Pula primeira triagem
- **Teste Técnico**: Apenas para vagas de TI
- **Aprovação Final**: Existe aprovação do RH e do gestor

 **Automações:**
- **Email Automático**: Confirmação de recebimento da candidatura
- **Calendário**: Agendamento automático de entrevistas
- **Feedback**: Email automático de recusa para candidatos não aprovados

 **💰 Caso 3: Financeiro - Solicitação de Pagamento**

 **Fluxo Completo:**
```
📋 Solicitação → 📊 Análise Financeira → 💰 Aprovação Gerente → 
💸 Aprovação Diretoria → 🏦 Pagamento → 📄 Comprovante
```

 **Regras Específicas:**
- **Valor < R$ 500**: Apenas aprovação do gerente
- **Valor > R$ 5.000**: Exige aprovação da diretoria
- **Fornecedor Novo**: Análise de cadastro obrigatória
- **Urgência**: Pagamento em 24h se marcado como urgente

 **Validações:**
- **Análise**: Verificação de saldo e orçamento
- **Aprovação**: Assinatura digital obrigatória
- **Pagamento**: Comprovante bancário obrigatório

---

 🚀 **Plano de Adoção e Implementação** (Linhas 601-700)

 **📅 Estratégia de Rollout em Fases**

 **FASE 1: Fundação (Semanas 1-2)**
- ✅ Modelagem de dados completa
- ✅ Criação das interfaces básicas
- ✅ Implementação do fluxo simples (3 etapas)
- ✅ Testes com usuários piloto

 **FASE 2: Expansão (Semanas 3-4)**
- ✅ Interface Kanban completa
- ✅ Sistema de permissões avançado
- ✅ Notificações automáticas
- ✅ Timeline e histórico

 **FASE 3: Automação (Semanas 5-6)**
- ✅ SLA e prazos
- ✅ Regras condicionais simples
- ✅ Dashboard de métricas
- ✅ Sistema de atribuição

 **FASE 4: Inteligência (Semanas 7-8)**
- ✅ IA para sugestões
- ✅ Análise preditiva
- ✅ Otimização automática
- ✅ Relatórios avançados

 **👥 Estratégia de Adoção por Equipe**

 **Equipe 1: Manutenção (Piloto)**
- **Motivação**: Já usa sistema de OS
- **Benefícios**: Organização e controle
- **Métricas**: Tempo de resolução, satisfação cliente

 **Equipe 2: Financeiro (Expansão)**
- **Motivação**: Controle de pagamentos
- **Benefícios**: Auditoria e compliance
- **Métricas**: SLA de pagamentos, economia

 **Equipe 3: RH (Consolidação)**
- **Motivação**: Processo seletivo organizado
- **Benefícios**: Experiência do candidato
- **Métricas**: Tempo de contratação, qualidade

 **📊 Métricas de Sucesso da Implementação**

 **Métricas Técnicas:**
- **Adoção**: % de usuários usando workflow ativamente
- **Performance**: Tempo de carregamento < 2s
- **Estabilidade**: Uptime > 99.9%
- **Satisfação**: NPS > 8.0

 **Métricas de Negócio:**
- **Eficiência**: Redução de 30% no tempo de processo
- **Qualidade**: Redução de 50% em erros e retrabalho
- **Visibilidade**: 100% dos processos rastreáveis
- **Custo**: ROI positivo em 6 meses

---

 📝 **Conclusão: A Transformação Digital do BRAVOFORM** (Linhas 701-750)

 **🎯 O Impacto Estratégico**

O Sistema de Workflow não é apenas uma nova feature - é uma **transformação fundamental** que posiciona o BRAVOFORM como:

- **🚀 Plataforma de Gestão de Processos**: Não apenas coletor de dados
- **🎯 Ferramenta Estratégica**: Alinhada com objetivos de negócio
- **📊 Sistema de Inteligência**: Com métricas e otimização
- **🔄 Solução Escalável**: Que cresce com a empresa

 **💡 O Diferencial Competitivo**

Enquanto concorrentes oferecem formulários estáticos, o BRAVOFORM com Workflow oferece:

- **Dinamismo**: Processos que se adaptam e evoluem
- **Inteligência**: Automação e otimização contínua
- **Visibilidade**: Transparência total em tempo real
- **Flexibilidade**: Adaptação a qualquer tipo de negócio

 **🚀 A Jornada Futura**

Esta feature abre portas para evoluções ainda mais poderosas:
- **Integração com ERPs**: Conectividade com sistemas legados
- **Mobile App**: Experiência nativa para campo
- **API Aberta**: Integração com terceiros
- **Multi-tenant**: SaaS para múltiplos clientes

**O BRAVOFORM deixa de ser uma ferramenta e se torna um ecossistema completo de gestão empresarial.**

 **1. Nova Interface: WorkflowStage**
```typescript
// Localização: /src/types/index.ts
interface WorkflowStage {
  id: string;                    // Auto-generated UUID
  name: string;                  // Nome exibido (ex: "Em Execução")
  color: string;                 // Cor hexadecimal para UI
  icon?: string;                 // Ícone Lucide (opcional)
  allowedRoles: string[];        // Departamentos/cargos permitidos
  allowedUsers: string[];        // Usuários específicos permitidos
  requireComment: boolean;       // Obriga comentário na mudança
  requireAttachments: boolean;   // Obriga anexos para entrar na etapa
  autoNotifications: {           // Configurações de notificação
    email: boolean;
    sms: boolean;
    recipients: string[];        // Emails/SMS adicionais
  };
  order: number;                 // Ordem no fluxo
  isFinalStage: boolean;         // Etapa final do processo
  isInitialStage: boolean;       // Etapa inicial (gerada automaticamente)
}
```

 **2. Extensão do Tipo Form**
```typescript
// Atualização em /src/types/index.ts (linhas 76-101)
interface Form {
  // ... propriedades existentes ...
  isWorkflowEnabled: boolean;    // Flag para ativar/desativar
  workflowStages: WorkflowStage[]; // Array ordenado de etapas
  defaultWorkflowId?: string;    // Template de workflow (opcional)
  workflowSettings: {
    allowStageReversion: boolean;  // Permite voltar etapas
    requireHistoryComment: boolean; // Comentário obrigatório
    autoAssignNextStage: boolean;   // Auto-assina próxima etapa
  };
}
```

 **3. Extensão do Tipo FormResponse**
```typescript
// Atualização em /src/types/index.ts (linhas 104-120)
interface FormResponse {
  // ... propriedades existentes ...
  currentStageId: string;        // Etapa atual
  previousStageId?: string;       // Etapa anterior (para reversão)
  assignedTo?: string;            // Usuário responsável atual
  workflowHistory: WorkflowHistoryEntry[]; // Timeline completa
  stageMetadata: {                // Metadados por etapa
    [stageId: string]: {
      enteredAt: Timestamp;
      enteredBy: string;
      duration?: number;         // Tempo na etapa (ms)
      attachments?: string[];     // Anexos específicos da etapa
    };
  };
}

interface WorkflowHistoryEntry {
  id: string;                    // Auto-generated
  stageId: string;               // Etapa destino
  previousStageId?: string;       // Etapa origem
  changedBy: string;             // UID do usuário
  changedByUsername: string;     // Username para exibição
  changedAt: Timestamp;          // Timestamp da mudança
  comment?: string;              // Comentário da mudança
  attachments: string[];         // Anexos na mudança
  actionType: 'forward' | 'backward' | 'reassigned'; // Tipo de ação
  metadata?: Record<string, any>; // Metadados adicionais
}
```

---

 🎨 **Interface do Administrador** (Linhas 101-200)

 **1. Componente: WorkflowBuilder**
```typescript
// Localização: /src/components/WorkflowBuilder.tsx
interface WorkflowBuilderProps {
  formId: string;
  initialStages?: WorkflowStage[];
  onSave: (stages: WorkflowStage[]) => Promise<void>;
  onPreview: (stages: WorkflowStage[]) => void;
}

// Estado principal
const [stages, setStages] = useState<WorkflowStage[]>([]);
const [selectedStage, setSelectedStage] = useState<WorkflowStage | null>(null);
const [isPreviewMode, setIsPreviewMode] = useState(false);
```

 **2. Funcionalidades do Builder**

 **2.1 Criação de Etapas**
```typescript
// Função de adicionar etapa
const addStage = (afterIndex?: number) => {
  const newStage: WorkflowStage = {
    id: generateId(),
    name: `Nova Etapa ${stages.length + 1}`,
    color: generateRandomColor(),
    allowedRoles: [],
    allowedUsers: [],
    requireComment: false,
    requireAttachments: false,
    autoNotifications: {
      email: false,
      sms: false,
      recipients: []
    },
    order: afterIndex !== undefined ? afterIndex + 1 : stages.length,
    isFinalStage: false,
    isInitialStage: stages.length === 0
  };

  const updatedStages = [...stages];
  if (afterIndex !== undefined) {
    updatedStages.splice(afterIndex + 1, 0, newStage);
  } else {
    updatedStages.push(newStage);
  }

  // Reordena os índices
  return updatedStages.map((stage, index) => ({
    ...stage,
    order: index
  }));
};
```

 **2.2 Drag & Drop com @dnd-kit**
```typescript
// Configuração similar ao EnhancedFormBuilder
const [sensors] = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }
  })
);

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  
  if (active.id !== over?.id) {
    const oldIndex = stages.findIndex(stage => stage.id === active.id);
    const newIndex = stages.findIndex(stage => stage.id === over?.id);
    
    const reorderedStages = arrayMove(stages, oldIndex, newIndex)
      .map((stage, index) => ({ ...stage, order: index }));
    
    setStages(reorderedStages);
  }
};
```

 **2.3 Configuração de Permissões**
```typescript
// Componente de configuração de permissões
const PermissionConfigurator = ({ stage, onUpdate }: {
  stage: WorkflowStage;
  onUpdate: (updates: Partial<WorkflowStage>) => void;
}) => {
  const [availableDepartments, setAvailableDepartments] = useState<Department[]>([]);
  const [availableUsers, setAvailableUsers] = useState<Collaborator[]>([]);

  return (
    <div className={styles.permissionConfig}>
      <h4>Permissões da Etapa: {stage.name}</h4>
      
      {/* Seleção de Departamentos */}
      <div className={styles.permissionGroup}>
        <label>Departamentos Permitidos:</label>
        <MultiSelect
          options={availableDepartments.map(dept => ({
            value: dept.id,
            label: dept.name
          }))}
          selected={stage.allowedRoles}
          onChange={(roles) => onUpdate({ allowedRoles: roles })}
        />
      </div>

      {/* Seleção de Usuários Específicos */}
      <div className={styles.permissionGroup}>
        <label>Usuários Específicos:</label>
        <UserMultiSelect
          selected={stage.allowedUsers}
          onChange={(users) => onUpdate({ allowedUsers: users })}
        />
      </div>

      {/* Configurações de Notificação */}
      <div className={styles.notificationConfig}>
        <h5>Notificações Automáticas</h5>
        <Checkbox
          label="Enviar Email"
          checked={stage.autoNotifications.email}
          onChange={(email) => onUpdate({
            autoNotifications: { ...stage.autoNotifications, email }
          })}
        />
        <Checkbox
          label="Enviar SMS"
          checked={stage.autoNotifications.sms}
          onChange={(sms) => onUpdate({
            autoNotifications: { ...stage.autoNotifications, sms }
          })}
        />
      </div>
    </div>
  );
};
```

---

 👷‍♂️ **Interface do Colaborador** (Linhas 201-350)

 **1. Página de Workflow Dashboard**
```typescript
// Localização: /app/dashboard/workflow/page.tsx
export default function WorkflowDashboard() {
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [selectedForm, setSelectedForm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'kanban' | 'table' | 'timeline'>('kanban');

  // Agrupar respostas por etapa
  const responsesByStage = useMemo(() => {
    const grouped: Record<string, FormResponse[]> = {};
    
    responses
      .filter(response => selectedForm ? response.formId === selectedForm : true)
      .forEach(response => {
        const stageId = response.currentStageId;
        if (!grouped[stageId]) grouped[stageId] = [];
        grouped[stageId].push(response);
      });
    
    return grouped;
  }, [responses, selectedForm]);
}
```

 **2. Componente KanbanBoard**
```typescript
// Localização: /src/components/KanbanBoard.tsx
interface KanbanBoardProps {
  stages: WorkflowStage[];
  responsesByStage: Record<string, FormResponse[]>;
  onMoveResponse: (responseId: string, newStageId: string, comment?: string) => void;
  onOpenResponse: (responseId: string) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  stages,
  responsesByStage,
  onMoveResponse,
  onOpenResponse
}) => {
  return (
    <div className={styles.kanbanContainer}>
      {stages.map(stage => (
        <div 
          key={stage.id} 
          className={styles.kanbanColumn}
          style={{ borderColor: stage.color }}
        >
          <div className={styles.columnHeader}>
            <div className={styles.columnHeaderContent}>
              <h3 style={{ color: stage.color }}>{stage.name}</h3>
              <span className={styles.responseCount}>
                {responsesByStage[stage.id]?.length || 0}
              </span>
            </div>
            {stage.isFinalStage && (
              <span className={styles.finalStageBadge}>Final</span>
            )}
          </div>

          <Droppable id={stage.id}>
            <div className={styles.columnContent}>
              {responsesByStage[stage.id]?.map(response => (
                <Draggable
                  key={response.id}
                  id={response.id}
                  disabled={!canUserMoveToStage(response, stage)}
                >
                  <ResponseCard
                    response={response}
                    onClick={() => onOpenResponse(response.id)}
                    canMove={canUserMoveToStage(response, stage)}
                  />
                </Draggable>
              ))}
            </div>
          </Droppable>
        </div>
      ))}
    </div>
  );
};
```

 **3. Componente ResponseCard**
```typescript
// Localização: /src/components/ResponseCard.tsx
interface ResponseCardProps {
  response: FormResponse;
  onClick: () => void;
  canMove: boolean;
}

const ResponseCard: React.FC<ResponseCardProps> = ({
  response,
  onClick,
  canMove
}) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div 
      className={`${styles.responseCard} ${!canMove ? styles.disabled : ''} ${isDragging ? styles.dragging : ''}`}
      onClick={onClick}
    >
      <div className={styles.cardHeader}>
        <h4>{response.formTitle}</h4>
        <span className={styles.collaboratorName}>
          {response.collaboratorUsername}
        </span>
      </div>

      <div className={styles.cardContent}>
        <p className={styles.createdAt}>
          {formatDate(response.createdAt)}
        </p>
        
        {response.assignedTo && (
          <div className={styles.assignedTo}>
            <User size={14} />
            <span>Atribuído a: {response.assignedTo}</span>
          </div>
        )}

        {response.workflowHistory.length > 0 && (
          <div className={styles.lastActivity}>
            <Clock size={14} />
            <span>
              Última movimentação: {formatDate(
                response.workflowHistory[response.workflowHistory.length - 1].changedAt
              )}
            </span>
          </div>
        )}
      </div>

      {canMove && (
        <div className={styles.dragHandle}>
          <GripVertical size={16} />
        </div>
      )}
    </div>
  );
};
```

---

 🔄 **Lógica de Movimentação** (Linhas 351-500)

 **1. Serviço de Workflow**
```typescript
// Localização: /src/services/workflowService.ts
export class WorkflowService {
  static async moveResponse(
    responseId: string,
    targetStageId: string,
    userId: string,
    username: string,
    comment?: string,
    attachments?: string[]
  ): Promise<void> {
    const responseRef = doc(db, 'responses', responseId);
    const responseDoc = await getDoc(responseRef);
    
    if (!responseDoc.exists()) {
      throw new Error('Resposta não encontrada');
    }

    const response = responseDoc.data() as FormResponse;
    const previousStageId = response.currentStageId;

    // Validar permissões
    await this.validateStageTransition(response, targetStageId, userId);

    // Criar entrada no histórico
    const historyEntry: WorkflowHistoryEntry = {
      id: generateId(),
      stageId: targetStageId,
      previousStageId,
      changedBy: userId,
      changedByUsername: username,
      changedAt: serverTimestamp() as Timestamp,
      comment,
      attachments: attachments || [],
      actionType: this.getTransitionType(previousStageId, targetStageId)
    };

    // Atualizar resposta
    const updateData: Partial<FormResponse> = {
      currentStageId: targetStageId,
      previousStageId,
      workflowHistory: [...response.workflowHistory, historyEntry],
      [`stageMetadata.${targetStageId}`]: {
        enteredAt: serverTimestamp(),
        enteredBy: username
      }
    };

    await updateDoc(responseRef, updateData);

    // Disparar notificações
    await this.triggerStageNotifications(response, targetStageId, historyEntry);
  }

  private static async validateStageTransition(
    response: FormResponse,
    targetStageId: string,
    userId: string
  ): Promise<void> {
    // Buscar formulário para obter configurações do workflow
    const formRef = doc(db, 'forms', response.formId);
    const formDoc = await getDoc(formRef);
    const form = formDoc.data() as Form;

    if (!form.isWorkflowEnabled) {
      throw new Error('Workflow não está ativo para este formulário');
    }

    const targetStage = form.workflowStages.find(s => s.id === targetStageId);
    if (!targetStage) {
      throw new Error('Etapa de destino não encontrada');
    }

    // Validar se usuário tem permissão
    const hasPermission = await this.checkUserStagePermission(
      userId, 
      targetStage, 
      response.companyId, 
      response.departmentId
    );

    if (!hasPermission) {
      throw new Error('Usuário não tem permissão para mover para esta etapa');
    }
  }

  private static async checkUserStagePermission(
    userId: string,
    stage: WorkflowStage,
    companyId: string,
    departmentId: string
  ): Promise<boolean> {
    // Verificar se é admin
    const adminQuery = query(
      collection(db, 'admins'),
      where('uid', '==', userId)
    );
    const adminDocs = await getDocs(adminQuery);
    
    if (!adminDocs.empty) {
      return true; // Admins têm acesso total
    }

    // Verificar permissões específicas do colaborador
    const collaboratorQuery = query(
      collection(db, 'collaborators'),
      where('id', '==', userId)
    );
    const collaboratorDocs = await getDocs(collaboratorQuery);
    
    if (collaboratorDocs.empty) {
      return false;
    }

    const collaborator = collaboratorDocs.docs[0].data() as Collaborator;

    // Verificar se está em allowedRoles (departamento)
    if (stage.allowedRoles.includes(departmentId)) {
      return true;
    }

    // Verificar se está em allowedUsers (usuário específico)
    if (stage.allowedUsers.includes(userId)) {
      return true;
    }

    return false;
  }
}
```

---

 📱 **Componente de Movimentação** (Linhas 501-650)

 **1. Modal de Mudança de Etapa**
```typescript
// Localização: /src/components/StageTransitionModal.tsx
interface StageTransitionModalProps {
  response: FormResponse;
  availableStages: WorkflowStage[];
  currentStage: WorkflowStage;
  onConfirm: (targetStageId: string, comment?: string, attachments?: string[]) => Promise<void>;
  onClose: () => void;
}

const StageTransitionModal: React.FC<StageTransitionModalProps> = ({
  response,
  availableStages,
  currentStage,
  onConfirm,
  onClose
}) => {
  const [selectedStage, setSelectedStage] = useState<WorkflowStage | null>(null);
  const [comment, setComment] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selectedStage) return;

    setIsLoading(true);
    try {
      // Upload de anexos se necessário
      const attachmentUrls: string[] = [];
      for (const file of attachments) {
        const url = await uploadFile(file, `responses/${response.id}/stage-transitions`);
        attachmentUrls.push(url);
      }

      await onConfirm(selectedStage.id, comment, attachmentUrls);
      onClose();
    } catch (error) {
      console.error('Erro ao mover resposta:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose}>
      <div className={styles.modalContent}>
        <h2>Mover: {response.formTitle}</h2>
        
        <div className={styles.currentStage}>
          <span>Etapa Atual:</span>
          <div 
            className={styles.stageBadge}
            style={{ backgroundColor: currentStage.color }}
          >
            {currentStage.name}
          </div>
        </div>

        <div className={styles.targetStage}>
          <label>Mover para:</label>
          <div className={styles.stageOptions}>
            {availableStages.map(stage => (
              <button
                key={stage.id}
                className={`${styles.stageOption} ${selectedStage?.id === stage.id ? styles.selected : ''}`}
                onClick={() => setSelectedStage(stage)}
                style={{ borderColor: stage.color }}
              >
                <div className={styles.stageColor} style={{ backgroundColor: stage.color }} />
                <span>{stage.name}</span>
              </button>
            ))}
          </div>
        </div>

        {selectedStage?.requireComment && (
          <div className={styles.commentSection}>
            <label>Comentário Obrigatório:</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Descreva o motivo da mudança..."
              required
            />
          </div>
        )}

        {selectedStage?.requireAttachments && (
          <div className={styles.attachmentSection}>
            <label>Anexos Obrigatórios:</label>
            <FileUpload
              onFilesChange={setAttachments}
              accept="image/*,.pdf,.doc,.docx"
              multiple
            />
          </div>
        )}

        <div className={styles.modalActions}>
          <button onClick={onClose} disabled={isLoading}>
            Cancelar
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!selectedStage || isLoading || (selectedStage.requireComment && !comment.trim())}
          >
            {isLoading ? 'Movendo...' : 'Confirmar Movimentação'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
```

---

 📊 **Visualização de Timeline** (Linhas 651-750)

 **1. Componente WorkflowTimeline**
```typescript
// Localização: /src/components/WorkflowTimeline.tsx
interface WorkflowTimelineProps {
  response: FormResponse;
  stages: WorkflowStage[];
  onEditEntry?: (entry: WorkflowHistoryEntry) => void;
}

const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  response,
  stages,
  onEditEntry
}) => {
  const timelineData = useMemo(() => {
    return response.workflowHistory
      .map(entry => {
        const stage = stages.find(s => s.id === entry.stageId);
        return {
          ...entry,
          stageName: stage?.name || 'Etapa Desconhecida',
          stageColor: stage?.color || '666'
        };
      })
      .sort((a, b) => b.changedAt.toMillis() - a.changedAt.toMillis());
  }, [response.workflowHistory, stages]);

  return (
    <div className={styles.timelineContainer}>
      <h3>Histórico do Processo</h3>
      
      <div className={styles.timeline}>
        {timelineData.map((entry, index) => (
          <div key={entry.id} className={styles.timelineEntry}>
            <div className={styles.timelineMarker}>
              <div 
                className={styles.timelineDot}
                style={{ backgroundColor: entry.stageColor }}
              />
              {index < timelineData.length - 1 && (
                <div className={styles.timelineLine} />
              )}
            </div>

            <div className={styles.timelineContent}>
              <div className={styles.timelineHeader}>
                <div className={styles.stageInfo}>
                  <span 
                    className={styles.stageBadge}
                    style={{ backgroundColor: entry.stageColor }}
                  >
                    {entry.stageName}
                  </span>
                  <span className={styles.actionType}>
                    {entry.actionType === 'forward' && 'Avançou para'}
                    {entry.actionType === 'backward' && 'Voltou para'}
                    {entry.actionType === 'reassigned' && 'Reatribuído para'}
                  </span>
                </div>
                <span className={styles.timestamp}>
                  {formatDateTime(entry.changedAt)}
                </span>
              </div>

              <div className={styles.userInfo}>
                <User size={14} />
                <span>{entry.changedByUsername}</span>
              </div>

              {entry.comment && (
                <div className={styles.comment}>
                  <MessageSquare size={14} />
                  <p>{entry.comment}</p>
                </div>
              )}

              {entry.attachments.length > 0 && (
                <div className={styles.attachments}>
                  <Paperclip size={14} />
                  <span>{entry.attachments.length} anexo(s)</span>
                </div>
              )}

              {onEditEntry && (
                <button 
                  className={styles.editButton}
                  onClick={() => onEditEntry(entry)}
                >
                  <Edit2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

 🔧 **Backend - Firebase Functions** (Linhas 751-850)

 **1. Trigger de Workflow**
```typescript
// Adição em /functions/src/index.ts
export const onWorkflowStageChange = onDocumentUpdated(
  'responses/{responseId}',
  async (event) => {
    const beforeData = event.data.before.data() as FormResponse;
    const afterData = event.data.after.data() as FormResponse;

    // Verificar se houve mudança de etapa
    if (beforeData.currentStageId === afterData.currentStageId) {
      return;
    }

    // Buscar informações do formulário e etapa
    const formDoc = await getDoc(doc(db, 'forms', afterData.formId));
    const form = formDoc.data() as Form;

    const targetStage = form.workflowStages.find(
      s => s.id === afterData.currentStageId
    );

    if (!targetStage) return;

    // Disparar notificações configuradas
    await sendStageNotifications(afterData, targetStage);

    // Atualizar métricas
    await updateWorkflowMetrics(afterData, targetStage);

    // Verificar se é etapa final
    if (targetStage.isFinalStage) {
      await handleFinalStage(afterData, form);
    }
  }
);

async function sendStageNotifications(
  response: FormResponse,
  stage: WorkflowStage
): Promise<void> {
  if (!stage.autoNotifications.email && !stage.autoNotifications.sms) {
    return;
  }

  const lastEntry = response.workflowHistory[response.workflowHistory.length - 1];
  
  // Preparar conteúdo do email
  const emailContent = {
    to: stage.autoNotifications.recipients,
    subject: `Atualização de Processo: ${response.formTitle}`,
    html: `
      <h2>Mudança de Etapa Detectada</h2>
      <p><strong>Formulário:</strong> ${response.formTitle}</p>
      <p><strong>Nova Etapa:</strong> ${stage.name}</p>
      <p><strong>Movido por:</strong> ${lastEntry.changedByUsername}</p>
      <p><strong>Data/Hora:</strong> ${formatDate(lastEntry.changedAt)}</p>
      ${lastEntry.comment ? `<p><strong>Comentário:</strong> ${lastEntry.comment}</p>` : ''}
      <p><a href="${process.env.FRONTEND_URL}/dashboard/responses/${response.id}">Ver Detalhes</a></p>
    `
  };

  // Enviar email
  if (stage.autoNotifications.email) {
    await sendEmail(emailContent);
  }

  // Enviar SMS se configurado
  if (stage.autoNotifications.sms) {
    await sendSMS({
      to: stage.autoNotifications.recipients,
      body: `Processo "${response.formTitle}" movido para "${stage.name}" por ${lastEntry.changedByUsername}`
    });
  }
}
```

---

 📈 **Métricas e Analytics** (Linhas 851-950)

 **1. Métricas de Workflow**
```typescript
// Localização: /src/services/workflowAnalytics.ts
export class WorkflowAnalytics {
  static async getWorkflowMetrics(
    formId: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<WorkflowMetrics> {
    const responsesQuery = query(
      collectionGroup(db, 'responses'),
      where('formId', '==', formId),
      ...(dateRange ? [
        where('submittedAt', '>=', Timestamp.fromDate(dateRange.start)),
        where('submittedAt', '<=', Timestamp.fromDate(dateRange.end))
      ] : [])
    );

    const responsesSnapshot = await getDocs(responsesQuery);
    const responses = responsesSnapshot.docs.map(doc => doc.data() as FormResponse);

    return {
      totalResponses: responses.length,
      averageTimePerStage: this.calculateAverageTimePerStage(responses),
      stageDistribution: this.calculateStageDistribution(responses),
      bottleneckStages: this.identifyBottlenecks(responses),
      completionRate: this.calculateCompletionRate(responses),
      userProductivity: this.calculateUserProductivity(responses)
    };
  }

  private static calculateAverageTimePerStage(
    responses: FormResponse[]
  ): Record<string, number> {
    const stageTimes: Record<string, number[]> = {};

    responses.forEach(response => {
      response.workflowHistory.forEach((entry, index) => {
        if (index === 0) return; // Primeira entrada não tem tempo anterior

        const prevEntry = response.workflowHistory[index - 1];
        const duration = entry.changedAt.toMillis() - prevEntry.changedAt.toMillis();

        if (!stageTimes[entry.stageId]) {
          stageTimes[entry.stageId] = [];
        }
        stageTimes[entry.stageId].push(duration);
      });
    });

    // Calcular médias
    const averages: Record<string, number> = {};
    Object.entries(stageTimes).forEach(([stageId, times]) => {
      averages[stageId] = times.reduce((sum, time) => sum + time, 0) / times.length;
    });

    return averages;
  }

  private static identifyBottlenecks(
    responses: FormResponse[]
  ): BottleneckStage[] {
    const stageDurations: Record<string, number[]> = {};

    responses.forEach(response => {
      response.workflowHistory.forEach((entry, index) => {
        if (index === 0) return;

        const prevEntry = response.workflowHistory[index - 1];
        const duration = entry.changedAt.toMillis() - prevEntry.changedAt.toMillis();

        if (!stageDurations[entry.stageId]) {
          stageDurations[entry.stageId] = [];
        }
        stageDurations[entry.stageId].push(duration);
      });
    });

    // Identificar etapas com tempo médio acima do percentil 75
    const allDurations = Object.values(stageDurations).flat();
    const percentile75 = this.calculatePercentile(allDurations, 75);

    return Object.entries(stageDurations)
      .map(([stageId, durations]) => ({
        stageId,
        averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        maxDuration: Math.max(...durations),
        isBottleneck: (durations.reduce((sum, d) => sum + d, 0) / durations.length) > percentile75
      }))
      .filter(stage => stage.isBottleneck)
      .sort((a, b) => b.averageDuration - a.averageDuration);
  }
}

interface WorkflowMetrics {
  totalResponses: number;
  averageTimePerStage: Record<string, number>;
  stageDistribution: Record<string, number>;
  bottleneckStages: BottleneckStage[];
  completionRate: number;
  userProductivity: UserProductivity[];
}

interface BottleneckStage {
  stageId: string;
  averageDuration: number;
  maxDuration: number;
  isBottleneck: boolean;
}

interface UserProductivity {
  userId: string;
  username: string;
  totalMovements: number;
  averageTimeBetweenMovements: number;
  mostActiveStages: string[];
}
```

---

 🎯 **Implementação - Fases** (Linhas 951-1050)

 **FASE 1: Modelagem de Dados (Semana 1)**
1. ✅ Atualizar interfaces em `/src/types/index.ts`
2. ✅ Criar serviços base em `/src/services/workflowService.ts`
3. ✅ Configurar Firestore indexes para queries de workflow

 **FASE 2: Interface Admin (Semana 2)**
1. ✅ Criar `WorkflowBuilder.tsx`
2. ✅ Integrar com `EnhancedFormBuilder.tsx`
3. ✅ Implementar drag & drop de etapas
4. ✅ Configurar permissões e notificações

 **FASE 3: Interface Colaborador (Semana 3)**
1. ✅ Criar `/app/dashboard/workflow/page.tsx`
2. ✅ Implementar `KanbanBoard.tsx`
3. ✅ Criar `ResponseCard.tsx`
4. ✅ Desenvolver `StageTransitionModal.tsx`

 **FASE 4: Backend e Automação (Semana 4)**
1. ✅ Implementar Firebase Functions triggers
2. ✅ Criar sistema de notificações
3. ✅ Desenvolver analytics de workflow
4. ✅ Configurar métricas e KPIs

 **FASE 5: Visualizações Avançadas (Semana 5)**
1. ✅ Implementar `WorkflowTimeline.tsx`
2. ✅ Criar dashboard de métricas
3. ✅ Adicionar export de relatórios
4. ✅ Implementar busca e filtros avançados

---

 🔒 **Considerações de Segurança** (Linhas 1051-1100)

 **Validação de Permissões**
- Verificar permissões em todas as movimentações
- Validação client-side e server-side
- Logs completos de auditoria

 **Proteção de Dados**
- Criptografia de comentários sensíveis
- Controle de acesso por hierarquia
- Backup automático de histórico

 **Performance**
- Firestore indexes otimizados
- Cache de etapas frequentemente acessadas
- Paginação em listas grandes

---

 📱 **Experiência Mobile** (Linhas 1101-1150)

 **Design Responsivo**
- Kanban board otimizado para touch
- Swipe gestures para movimentação
- Interface simplificada para mobile

 **Notificações Push**
- Firebase Cloud Messaging
- Notificações de mudança de etapa
- Alertas de tarefas pendentes

---

 🚀 **Deploy e Monitoramento** (Linhas 1151-1200)

 **Configuração de Deploy**
- Environment variables para workflow
- Firestore indexes via CLI
- Functions com triggers configurados

 **Monitoramento**
- Métricas de performance
- Error tracking para movimentações
- Analytics de uso do workflow

---

 📝 **Conclusão** (Linhas 1201-1250)

O **Sistema de Workflow** representa uma evolução significativa para o BRAVOFORM, transformando-o em uma plataforma completa de gestão de processos. Com esta feature, a plataforma oferece:

- **Flexibilidade Total**: Workflows customizáveis por formulário
- **Controle Granular**: Permissões específicas por etapa
- **Visibilidade Completa**: Timeline e histórico detalhado
- **Automação Inteligente**: Notificações e ações automáticas
- **Análise Avançada**: Métricas e identificação de gargalos
- **Experiência Moderna**: Interface intuitiva Kanban/Timeline

Esta implementação posiciona o BRAVOFORM como uma solução enterprise-ready para gestão de processos corporativos, mantendo a escalabilidade e performance da arquitetura serverless do Firebase.

---

 🔄 **Próximos Passos** (Linhas 1251-1300)

1. **Implementação Fase 1**: Começar com modelagem de dados
2. **Protótipo UI**: Criar mockups do WorkflowBuilder
3. **Testes Unitários**: Cobrir toda a lógica de negócio
4. **Documentação API**: Documentar endpoints e serviços
5. **Treinamento**: Capacitar equipe na nova feature

A feature está pronta para desenvolvimento incremental, garantindo estabilidade e qualidade em cada fase.

---

## 🚀 **PLANO DE IMPLEMENTAÇÃO - 8 SEMANAS** (Linhas 1251-1600)

### ✅ **VALIDAÇÃO E ANÁLISE DA ESTRUTURA ATUAL**

#### **Componentes Existentes que Serão Utilizados**

**1. Sistema de Tipos** (`/src/types/index.ts`)
- ✅ AppUser - Linha 5-13
- ✅ Collaborator - Linha 16-27
- ✅ Form - Linha 76-101
- ✅ FormResponse - Linha 104-120
- ✅ FormField - Linha 57-73
- ✅ FormTheme - Linha 30-54

**2. Componentes React Existentes**
- ✅ EnhancedFormBuilder.tsx - Editor de formulários
- ✅ FormResponse.tsx - Renderizador de respostas
- ✅ AdminHistoryModal.tsx - Modal de histórico
- ✅ ComprehensiveHistoryModal.tsx - Histórico completo
- ✅ TrashModal.tsx - Gestão de lixeira

**3. Infraestrutura Firebase**
- ✅ /firebase/config.ts - Configuração
- ✅ /functions/src/index.ts - Cloud Functions
- ✅ Firebase Auth - Autenticação
- ✅ Firestore - Banco de dados
- ✅ Firebase Storage - Arquivos

---

### **📅 SEMANA 1-2: FASE 1 - FUNDAÇÃO E MODELAGEM**

#### **Objetivo:** Criar a base de dados e estruturas TypeScript

#### **Tarefas Detalhadas:**

**1.1 Atualizar `/src/types/index.ts`** ⏱️ 4h
```typescript
// ADICIONAR ao arquivo existente (após linha 268):

// --- WORKFLOW INTERFACES ---

export interface WorkflowStage {
  id: string;
  name: string;
  color: string;
  icon?: string;
  allowedRoles: string[];
  allowedUsers: string[];
  requireComment: boolean;
  requireAttachments: boolean;
  autoNotifications: {
    email: boolean;
    sms: boolean;
    recipients: string[];
  };
  order: number;
  isFinalStage: boolean;
  isInitialStage: boolean;
}

export interface WorkflowHistoryEntry {
  id: string;
  stageId: string;
  previousStageId?: string;
  changedBy: string;
  changedByUsername: string;
  changedAt: Timestamp;
  comment?: string;
  attachments: string[];
  actionType: 'forward' | 'backward' | 'reassigned';
  metadata?: Record<string, any>;
}

export interface WorkflowSettings {
  allowStageReversion: boolean;
  requireHistoryComment: boolean;
  autoAssignNextStage: boolean;
}
```

**1.2 Estender Interface `Form` Existente** ⏱️ 2h
```typescript
// MODIFICAR interface Form (linhas 76-101):
export interface Form {
  // ... propriedades existentes ...
  
  // ADICIONAR:
  isWorkflowEnabled?: boolean;
  workflowStages?: WorkflowStage[];
  defaultWorkflowId?: string;
  workflowSettings?: WorkflowSettings;
}
```

**1.3 Estender Interface `FormResponse` Existente** ⏱️ 2h
```typescript
// MODIFICAR interface FormResponse (linhas 104-120):
export interface FormResponse {
  // ... propriedades existentes ...
  
  // ADICIONAR:
  currentStageId?: string;
  previousStageId?: string;
  assignedTo?: string;
  workflowHistory?: WorkflowHistoryEntry[];
  stageMetadata?: {
    [stageId: string]: {
      enteredAt: Timestamp;
      enteredBy: string;
      duration?: number;
      attachments?: string[];
    };
  };
}
```

**1.4 Criar Serviço de Workflow** ⏱️ 8h

Criar arquivo: `/src/services/workflowService.ts`

```typescript
import { db } from '../../firebase/config';
import { 
  doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp 
} from 'firebase/firestore';
import type { Form, FormResponse, WorkflowStage, WorkflowHistoryEntry } from '../types';

export class WorkflowService {
  static async moveResponse(
    responseId: string,
    targetStageId: string,
    userId: string,
    username: string,
    comment?: string,
    attachments?: string[]
  ): Promise<void> {
    const responseRef = doc(db, 'responses', responseId);
    const responseDoc = await getDoc(responseRef);
    
    if (!responseDoc.exists()) {
      throw new Error('Resposta não encontrada');
    }

    const response = responseDoc.data() as FormResponse;
    await this.validateStageTransition(response, targetStageId, userId);

    const historyEntry: WorkflowHistoryEntry = {
      id: crypto.randomUUID(),
      stageId: targetStageId,
      previousStageId: response.currentStageId,
      changedBy: userId,
      changedByUsername: username,
      changedAt: serverTimestamp() as any,
      comment,
      attachments: attachments || [],
      actionType: 'forward'
    };

    await updateDoc(responseRef, {
      currentStageId: targetStageId,
      previousStageId: response.currentStageId,
      workflowHistory: [...(response.workflowHistory || []), historyEntry],
      [`stageMetadata.${targetStageId}`]: {
        enteredAt: serverTimestamp(),
        enteredBy: username
      }
    });
  }

  private static async validateStageTransition(
    response: FormResponse,
    targetStageId: string,
    userId: string
  ): Promise<void> {
    const formRef = doc(db, 'forms', response.formId);
    const formDoc = await getDoc(formRef);
    const form = formDoc.data() as Form;

    if (!form.isWorkflowEnabled) {
      throw new Error('Workflow não está ativo');
    }

    const targetStage = form.workflowStages?.find(s => s.id === targetStageId);
    if (!targetStage) {
      throw new Error('Etapa não encontrada');
    }

    const hasPermission = await this.checkUserStagePermission(
      userId, targetStage, response.companyId, response.departmentId
    );

    if (!hasPermission) {
      throw new Error('Sem permissão para esta etapa');
    }
  }

  private static async checkUserStagePermission(
    userId: string,
    stage: WorkflowStage,
    companyId: string,
    departmentId: string
  ): Promise<boolean> {
    const adminQuery = query(collection(db, 'admins'), where('uid', '==', userId));
    const adminDocs = await getDocs(adminQuery);
    if (!adminDocs.empty) return true;

    if (stage.allowedRoles.includes(departmentId)) return true;
    if (stage.allowedUsers.includes(userId)) return true;

    return false;
  }
}
```

**1.5 Criar Firestore Indexes** ⏱️ 1h
```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "responses",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "currentStageId", "order": "ASCENDING" },
        { "fieldPath": "submittedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Entregáveis Semana 1-2:**
- ✅ Tipos TypeScript atualizados
- ✅ WorkflowService implementado
- ✅ Firestore indexes configurados
- ✅ Testes unitários básicos

---

### **📅 SEMANA 3-4: FASE 2 - INTERFACE ADMIN (WORKFLOW BUILDER)**

#### **Objetivo:** Criar interface para admin configurar workflows

**2.1 Criar Componente WorkflowBuilder** ⏱️ 12h

Criar arquivo: `/src/components/WorkflowBuilder.tsx`

```typescript
'use client';

import React, { useState, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Save } from 'lucide-react';
import type { WorkflowStage } from '@/types';
import styles from '../../app/styles/WorkflowBuilder.module.css';

interface WorkflowBuilderProps {
  formId: string;
  initialStages?: WorkflowStage[];
  onSave: (stages: WorkflowStage[]) => Promise<void>;
}

export default function WorkflowBuilder({ formId, initialStages = [], onSave }: WorkflowBuilderProps) {
  const [stages, setStages] = useState<WorkflowStage[]>(initialStages);
  const [selectedStage, setSelectedStage] = useState<WorkflowStage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const addStage = useCallback(() => {
    const newStage: WorkflowStage = {
      id: crypto.randomUUID(),
      name: `Etapa ${stages.length + 1}`,
      color: '#3B82F6',
      allowedRoles: [],
      allowedUsers: [],
      requireComment: false,
      requireAttachments: false,
      autoNotifications: { email: false, sms: false, recipients: [] },
      order: stages.length,
      isFinalStage: false,
      isInitialStage: stages.length === 0
    };
    setStages([...stages, newStage]);
  }, [stages]);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = stages.findIndex(s => s.id === active.id);
      const newIndex = stages.findIndex(s => s.id === over?.id);
      setStages(arrayMove(stages, oldIndex, newIndex).map((s, i) => ({ ...s, order: i })));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Configurar Workflow</h2>
        <button onClick={addStage}><Plus size={20} /> Adicionar Etapa</button>
        <button onClick={() => onSave(stages)}><Save size={20} /> Salvar</button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {stages.map(stage => (
            <StageCard key={stage.id} stage={stage} onClick={() => setSelectedStage(stage)} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

**2.2 Integrar com EnhancedFormBuilder** ⏱️ 4h
**2.3 Criar CSS Module** ⏱️ 3h
**2.4 Criar StageConfigurator** ⏱️ 6h

**Entregáveis Semana 3-4:**
- ✅ WorkflowBuilder funcional
- ✅ Drag & drop de etapas
- ✅ Integração com FormBuilder

---

### **📅 SEMANA 5-6: FASE 3 - INTERFACE COLABORADOR (KANBAN)**

#### **Objetivo:** Criar visualização Kanban para colaboradores

**3.1 Criar Página Workflow Dashboard** ⏱️ 8h

Criar arquivo: `/app/dashboard/workflow/page.tsx`

**3.2 Criar KanbanBoard** ⏱️ 10h

Criar arquivo: `/src/components/KanbanBoard.tsx`

**3.3 Criar ResponseCard** ⏱️ 4h
**3.4 Criar StageTransitionModal** ⏱️ 6h
**3.5 Implementar Drag & Drop** ⏱️ 6h

**Entregáveis Semana 5-6:**
- ✅ Dashboard Kanban funcional
- ✅ Drag & drop de tickets
- ✅ Modal de transição
- ✅ Validações de permissão

---

### **📅 SEMANA 7-8: FASE 4 - BACKEND E AUTOMAÇÃO**

#### **Objetivo:** Implementar Firebase Functions e automações

**4.1 Criar Trigger de Workflow** ⏱️ 8h

Adicionar em `/functions/src/index.ts`:

```typescript
export const onWorkflowStageChange = onDocumentUpdated(
  'responses/{responseId}',
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (beforeData.currentStageId === afterData.currentStageId) return;

    const formDoc = await getDoc(doc(db, 'forms', afterData.formId));
    const form = formDoc.data();
    const targetStage = form.workflowStages?.find(s => s.id === afterData.currentStageId);

    if (targetStage) {
      await sendStageNotifications(afterData, targetStage);
    }
  }
);
```

**4.2 Sistema de Notificações** ⏱️ 6h
**4.3 Métricas e Analytics** ⏱️ 6h
**4.4 Testes de Integração** ⏱️ 4h

**Entregáveis Semana 7-8:**
- ✅ Firebase Functions configuradas
- ✅ Sistema de notificações
- ✅ Analytics básico
- ✅ Testes end-to-end

---

## 📊 **CHECKLIST DE IMPLEMENTAÇÃO**

### **Fase 1: Fundação** (Semanas 1-2)
- [ ] Atualizar `/src/types/index.ts` com interfaces de Workflow
- [ ] Criar `/src/services/workflowService.ts`
- [ ] Configurar Firestore indexes
- [ ] Escrever testes unitários
- [ ] Documentar API do serviço

### **Fase 2: Interface Admin** (Semanas 3-4)
- [ ] Criar `WorkflowBuilder.tsx`
- [ ] Criar `StageConfigurator.tsx`
- [ ] Criar `WorkflowBuilder.module.css`
- [ ] Integrar com `EnhancedFormBuilder.tsx`
- [ ] Testes de componentes

### **Fase 3: Interface Colaborador** (Semanas 5-6)
- [ ] Criar `/app/dashboard/workflow/page.tsx`
- [ ] Criar `KanbanBoard.tsx`
- [ ] Criar `ResponseCard.tsx`
- [ ] Criar `StageTransitionModal.tsx`
- [ ] Implementar drag & drop
- [ ] Validações de permissão

### **Fase 4: Backend** (Semanas 7-8)
- [ ] Implementar `onWorkflowStageChange` trigger
- [ ] Sistema de notificações email/SMS
- [ ] Dashboard de métricas
- [ ] Testes de integração
- [ ] Deploy em produção

---

---

## 🛒 **NOVO FLUXO: Processo de Compras com Validação XML** (100% Customizável)

### **Visão Geral**

Fluxo completo de compras que integra pedidos, aprovação gerencial, validação de fornecedores, conferência automática de XML fiscal e formulário de recebimento com geração de PDF. Totalmente customizável via BravoFlow.

### **Fluxo Visual Completo**
```
📋 Novo Pedido (Comprador)
    │
    ▼
🔍 Detecção Automática de Pedidos (Sistema)
    │
    ▼
👔 Aprovação Gerencial (Gerente)
    │
    ▼
💰 Validação de Fornecedor (Faturamento)
    │
    ├── ✅ Fornecedor OK ──────────────────────────────┐
    │                                                   │
    └── ❌ Fornecedor Diferente ──► 🔄 Refazer Pedido  │
         (Compras recebe novo fornecedor,               │
          refaz pedido, informa nº novo)                │
         ⚠️ Novo pedido excluído de abrir novo fluxo   │
                        │                               │
                        └───────────────────────────────┤
                                                        ▼
                                                 📎 Upload XML NF-e
                                                   (Faturamento)
                                                        │
                                                        ▼
                                                 🤖 Validação Automática
                                                   XML vs Pedido
                                                        │
                                    ┌───────────────────┤
                                    │                   │
                              ❌ Divergência      ✅ Dados OK
                                    │                   │
                                    ▼                   │
                            ⚠️ Notifica Compras         │
                            (3 opções):                 │
                            • Seguir c/ justificativa   │
                              (campo texto obrigatório) │
                            • Modificar pedido atual    │
                            • Novo pedido               │
                              (nº novo, excluído        │
                               de abrir novo fluxo)     │
                                    │                   │
                                    └───────────────────┤
                                                        ▼
                                                 📝 Formulário de
                                                   Recebimento
                                                   (Operação)
                                                        │
                                                        ▼
                                                 📄 Geração de PDF
                                                   (Qualidade +
                                                    Faturamento)
                                                        │
                                                        ▼
                                                    ✅ FIM
```

---

### **Detalhamento das Etapas**

#### **Etapa 1: Criação de Pedido (Comprador)**
- **Responsável:** Setor de Compras
- **Ação:** Comprador cria o pedido no sistema
- **Dados:** Fornecedor, itens, quantidades, valores, condições de pagamento
- **Resultado:** Pedido registrado no banco de dados com status `novo`

#### **Etapa 2: Detecção Automática de Novos Pedidos (Sistema)**
- **Tipo:** Automática (trigger/polling no banco)
- **Ação:** Sistema monitora a collection/tabela de pedidos para identificar novos registros
- **Regra:** Apenas pedidos com status `novo` e que **não estejam na lista de exclusão** (pedidos refeitos que já pertencem a um fluxo existente)
- **Resultado:** Cria uma instância de workflow automaticamente para cada novo pedido detectado

```typescript
interface PedidoDetection {
  pollInterval: number;              // Intervalo de verificação (ms)
  statusFilter: 'novo';             // Apenas pedidos novos
  excludedOrderIds: string[];       // IDs de pedidos excluídos (refeitos)
  autoCreateInstance: boolean;      // Criar instância automaticamente
}
```

#### **Etapa 3: Aprovação Gerencial (Gerente)**
- **Responsável:** Gerentes (allowedRoles: ['gerente'])
- **Ação:** Gerente revisa o pedido e aprova ou rejeita
- **Campos:**
  - Visualização completa dos dados do pedido
  - Botão "Aprovar" → avança para Etapa 4
  - Botão "Rejeitar" → volta para Compras com comentário obrigatório
- **Validação:** `requireComment: true` em caso de rejeição

#### **Etapa 4: Validação de Fornecedor (Faturamento)**
- **Responsável:** Setor de Faturamento
- **Ação:** Faturamento verifica se o fornecedor do pedido é o correto
- **Campos:**
  - Exibição do fornecedor atual do pedido
  - Checkbox: "Fornecedor está correto?"
  - Se **SIM** → avança para Etapa 5 (Upload XML)
  - Se **NÃO** → campo para informar o fornecedor correto → envia para Compras (Etapa 4.1)

```typescript
interface ValidacaoFornecedor {
  fornecedorOriginal: string;       // Fornecedor do pedido
  fornecedorCorreto: boolean;       // Check do faturamento
  novoFornecedor?: string;          // Se diferente, qual o correto
}
```

#### **Etapa 4.1: Refazer Pedido (Compras) — Sub-etapa condicional**
- **Responsável:** Setor de Compras
- **Trigger:** Ativada quando faturamento indica fornecedor diferente
- **Ação:** Compras recebe a informação do novo fornecedor, refaz o pedido e informa o número do novo pedido
- **Campos:**
  - Exibição do fornecedor correto indicado pelo faturamento
  - Campo: "Número do Novo Pedido" (obrigatório)
- **Regra Crítica:** O número do novo pedido é adicionado à **lista de exclusão** (`excludedOrderIds`), para que o sistema **não abra um novo fluxo** para esse pedido
- **Resultado:** Retorna para Etapa 5 (Upload XML) com o novo pedido vinculado

```typescript
interface RefazerPedido {
  motivoRefacao: string;            // Fornecedor diferente
  novoNumeroPedido: string;         // Número do pedido refeito
  adicionarExclusao: true;          // Flag para excluir do auto-detect
}
```

#### **Etapa 5: Upload de XML da Nota Fiscal (Faturamento)**
- **Responsável:** Setor de Faturamento
- **Ação:** Faturamento faz upload do arquivo XML da NF-e
- **Campos:**
  - Campo de upload de arquivo (aceita apenas `.xml`)
  - `requireAttachments: true`
- **Validação:** Arquivo deve ser XML válido (NF-e)

#### **Etapa 6: Validação Automática XML vs Pedido (Sistema)**
- **Tipo:** Automática
- **Ação:** Sistema lê o XML da NF-e e compara automaticamente com os dados do pedido
- **Campos Comparados:**
  - CNPJ do fornecedor
  - Descrição dos itens
  - Quantidades
  - Valores unitários e totais
  - Condições de pagamento
- **Resultado:**
  - ✅ **Tudo OK** → avança para Etapa 7 (Formulário de Recebimento)
  - ❌ **Divergência encontrada** → envia para Etapa 6.1 (Notifica Compras)

```typescript
interface XMLValidation {
  xmlData: {
    cnpjEmitente: string;
    itens: Array<{ descricao: string; quantidade: number; valorUnitario: number }>;
    valorTotal: number;
    condicaoPagamento?: string;
  };
  pedidoData: {
    cnpjFornecedor: string;
    itens: Array<{ descricao: string; quantidade: number; valorUnitario: number }>;
    valorTotal: number;
  };
  divergencias: Array<{
    campo: string;
    valorXML: string;
    valorPedido: string;
    tipo: 'critico' | 'aviso';
  }>;
  resultado: 'aprovado' | 'divergente';
}
```

#### **Etapa 6.1: Resolução de Divergência (Compras) — Sub-etapa condicional**
- **Responsável:** Setor de Compras
- **Trigger:** Ativada quando a validação XML detecta divergência
- **Exibição:** Lista detalhada de todas as divergências encontradas
- **Opções (3 caminhos):**

  **Opção A — Seguir mesmo assim:**
  - Campo de texto **obrigatório** onde Compras deve explicar/justificar a divergência
  - `requireComment: true` (campo de justificativa obrigatório)
  - Resultado: Avança para Etapa 7 com registro da justificativa no histórico

  **Opção B — Modificar o pedido atual:**
  - Compras corrige os dados do pedido para bater com o XML
  - Resultado: Retorna para Etapa 6 (revalidação automática)

  **Opção C — Fazer novo pedido:**
  - Campo: "Número do Novo Pedido" (obrigatório)
  - **Regra Crítica:** Novo pedido é adicionado à **lista de exclusão** (`excludedOrderIds`)
  - Resultado: Retorna para Etapa 5 (Upload XML) com novo pedido vinculado

```typescript
interface ResolucaoDivergencia {
  acao: 'seguir_com_justificativa' | 'modificar_pedido' | 'novo_pedido';
  justificativa?: string;           // Obrigatório se acao = 'seguir_com_justificativa'
  novoNumeroPedido?: string;        // Obrigatório se acao = 'novo_pedido'
  adicionarExclusao?: boolean;      // true se acao = 'novo_pedido'
  modificacoes?: Record<string, any>; // Se acao = 'modificar_pedido'
}
```

#### **Etapa 7: Formulário de Recebimento (Operação)**
- **Responsável:** Setor de Operação
- **Ação:** Preenchimento do formulário de recebimento de materiais
- **Campos do Formulário:**
  - Data de recebimento
  - Número da NF-e (preenchido automaticamente do XML)
  - Fornecedor (preenchido automaticamente)
  - Conferência física: quantidades recebidas vs NF-e
  - Estado dos materiais (conforme / avariado / faltante)
  - Observações da operação
  - Fotos do recebimento (opcional)
  - Assinatura do conferente
- **Validação:** Todos os campos obrigatórios devem ser preenchidos

```typescript
interface FormularioRecebimento {
  dataRecebimento: Date;
  numeroNFe: string;                // Auto-preenchido do XML
  fornecedor: string;               // Auto-preenchido
  itensConferidos: Array<{
    descricao: string;
    qtdNFe: number;
    qtdRecebida: number;
    estado: 'conforme' | 'avariado' | 'faltante';
    observacao?: string;
  }>;
  observacoesGerais?: string;
  fotosRecebimento?: string[];      // URLs das fotos
  assinaturaConferente: string;     // Nome ou assinatura digital
}
```

#### **Etapa 8: Geração de PDF (Sistema → Qualidade + Faturamento)**
- **Tipo:** Automática
- **Ação:** Sistema gera um PDF completo com todos os dados consolidados
- **Conteúdo do PDF:**
  - Dados do pedido original
  - Dados da NF-e (extraídos do XML)
  - Resultado da validação XML vs Pedido
  - Eventuais justificativas de divergência
  - Formulário de recebimento preenchido
  - Fotos do recebimento (se houver)
  - Timeline completa do workflow
- **Distribuição:**
  - Enviado automaticamente para o setor de **Qualidade**
  - Enviado automaticamente para o setor de **Faturamento**
- **Formato:** PDF gerado via biblioteca (ex: `jsPDF`, `@react-pdf/renderer` ou `puppeteer`)

```typescript
interface PDFRecebimento {
  pedido: PedidoData;
  nfe: XMLData;
  validacao: XMLValidation;
  recebimento: FormularioRecebimento;
  historico: StageHistoryEntry[];
  divergencias?: {
    existiram: boolean;
    justificativa?: string;
  };
  destinatarios: {
    qualidade: string[];            // Emails do setor de qualidade
    faturamento: string[];          // Emails do setor de faturamento
  };
}
```

---

### **Regras de Negócio Críticas**

#### **1. Exclusão de Pedidos Refeitos**
```
Quando Compras refaz um pedido (Etapa 4.1 ou Etapa 6.1 Opção C):
  → O número do novo pedido é salvo em `excludedOrderIds`
  → O sistema de detecção automática (Etapa 2) IGNORA esses pedidos
  → Isso evita que um pedido refeito abra um SEGUNDO fluxo duplicado
```

#### **2. Validação XML Automática**
```
O sistema deve:
  → Fazer parse do XML da NF-e
  → Extrair dados: CNPJ, itens, quantidades, valores
  → Comparar campo a campo com o pedido original
  → Gerar lista de divergências (se houver)
  → Classificar divergências como 'critico' ou 'aviso'
```

#### **3. Campo de Justificativa Obrigatório**
```
Quando Compras decide seguir apesar de divergência:
  → Campo de texto é OBRIGATÓRIO (não pode estar vazio)
  → Justificativa fica registrada no histórico do workflow
  → Aparece no PDF final gerado para Qualidade e Faturamento
```

#### **4. Geração Automática de PDF**
```
Ao concluir o formulário de recebimento:
  → Sistema gera PDF automaticamente
  → PDF consolidado com TODAS as informações do fluxo
  → Enviado por email para Qualidade e Faturamento
  → Arquivado no histórico da instância do workflow
```

---

### **Componentes Técnicos Necessários**

| Componente | Tipo | Descrição |
|-----------|------|-----------|
| `PedidoDetectionService` | Service | Monitora banco para novos pedidos, respeita lista de exclusão |
| `XMLParserService` | Service | Faz parse de XML NF-e e extrai dados estruturados |
| `XMLValidationService` | Service | Compara dados do XML com dados do pedido |
| `SupplierValidationStep` | Component | UI para faturamento validar fornecedor |
| `DivergenceResolutionStep` | Component | UI para compras resolver divergências (3 opções) |
| `ReceivingFormStep` | Component | Formulário de recebimento para operação |
| `PDFGeneratorService` | Service | Gera PDF consolidado com todos os dados |
| `PDFDistributionService` | Service | Envia PDF por email para qualidade e faturamento |
| `ExcludedOrdersManager` | Service | Gerencia lista de pedidos excluídos do auto-detect |

---

### **Permissões por Etapa**

| Etapa | Setor Responsável | allowedRoles |
|-------|------------------|-------------|
| 1. Criação de Pedido | Compras | `['compras']` |
| 2. Detecção Automática | Sistema | `['system']` (automático) |
| 3. Aprovação | Gerência | `['gerente', 'diretoria']` |
| 4. Validação Fornecedor | Faturamento | `['faturamento']` |
| 4.1. Refazer Pedido | Compras | `['compras']` |
| 5. Upload XML | Faturamento | `['faturamento']` |
| 6. Validação XML | Sistema | `['system']` (automático) |
| 6.1. Resolução Divergência | Compras | `['compras']` |
| 7. Formulário Recebimento | Operação | `['operacao']` |
| 8. Geração PDF | Sistema | `['system']` (automático) |

---

## 🎯 **PRÓXIMOS PASSOS IMEDIATOS**

### **1. Começar Fase 1 - Tarefa 1.1** 
```bash
# Abrir arquivo:
/src/types/index.ts

# Adicionar após linha 268 as novas interfaces
```

### **2. Criar Branch de Desenvolvimento**
```bash
git checkout -b feature/workflow-system
```

### **3. Configurar Ambiente**
```bash
npm install
npm run build
```

---

## 📝 **NOTAS IMPORTANTES**

### **Compatibilidade com Sistema Atual**
- ✅ Todas as mudanças são **retrocompatíveis**
- ✅ Campos de workflow são **opcionais** (usando `?`)
- ✅ Sistema atual continua funcionando sem workflow
- ✅ Migração gradual por formulário

### **Segurança**
- ✅ Validação client-side e server-side
- ✅ Firestore Rules atualizadas
- ✅ Logs de auditoria completos
- ✅ Controle de permissões granular

### **Performance**
- ✅ Indexes otimizados
- ✅ Queries eficientes
- ✅ Cache quando apropriado
- ✅ Lazy loading de componentes

---

## 🚀 **PRONTO PARA INICIAR!**

O plano está validado e alinhado com a estrutura atual do BRAVOFORM. Podemos começar pela **Fase 1 - Tarefa 1.1** atualizando os tipos TypeScript.

A feature está pronta para desenvolvimento incremental, garantindo estabilidade e qualidade em cada fase.
