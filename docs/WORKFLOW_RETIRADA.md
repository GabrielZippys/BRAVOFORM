# Workflow Retirada — Guia de Implementação

Este documento explica **passo-a-passo** como ativar o workflow "Retirada de Qualidade" descrito pelo cliente, usando os blocos publicados nos commits `bravoflow: bloco 1..4`.

---

## 1. Aplicar a migração SQL

A migração `scripts/sql/002_workflow_retirada.sql` adiciona:
- Coluna `roles` (JSONB) em `dim_collaborators`
- Vários campos em `fact_form_response` (aprovação, réplica, motorista, placa, boletim, etc.)
- Views `vw_workflow_metrics` e `vw_retiradas_painel`

```bash
psql -h <host> -U <user> -d formbravo-8854e-database -f scripts/sql/002_workflow_retirada.sql
```

A migração é **idempotente** (`ADD COLUMN IF NOT EXISTS`) — pode ser rodada múltiplas vezes sem efeito colateral.

---

## 2. Atribuir os papéis BravoFlow aos colaboradores

1. Acesse **Dashboard → Deptos & Usuários**
2. Selecione a empresa → o setor → veja a lista de colaboradores
3. Em cada card, abaixo das permissões legadas, há a seção **"Papéis BravoFlow"** com 5 pílulas:
   - **Solicitante** — quem abre solicitações (preenche o form inicial)
   - **Aprovador Qualidade** — revisa e aprova/reprova
   - **Roteirizador** — define motorista e placa
   - **Operador Retirada** — digita boletim/protocolo
   - **Supervisor** — papel genérico de revisor

Clique nas pílulas para alternar. Cada toggle:
- Atualiza Firestore (`collaborators/{id}.bravoflowRoles`)
- Sincroniza PostgreSQL (`dim_collaborators.roles` JSONB)

---

## 3. Criar o formulário inicial "Retirada Qualidade"

1. **Dashboard → Formulários → Novo Formulário**
2. Adicione os campos pedidos pelo cliente (categoria "Dados Coletados"):
   - Unidade (Texto)
   - Código Vendedor (Texto)
   - Nome Vendedor (Texto)
   - Código Cliente (Texto)
   - Nome Cliente (Texto)
   - Número Nota Fiscal (Texto)
   - Código Produto + Nome Produto + Quantidade → **use o tipo "Grade de Pedidos"** (já tem catálogo integrado)
   - Fotos (Anexo, múltiplas)
   - Breve Relato (Texto multilinha)
3. Marque o checkbox **"Habilitar workflow"** nas configurações
4. Salve e copie o `formId` (firebase_id) — você vai precisar dele no próximo passo.

---

## 4. Configurar o workflow (BravoFlow)

1. **Dashboard → BravoFlow → Novo Workflow**
2. Use o builder visual (ReactFlow) para montar os estágios:
   1. **Início** (start) — automático ao submeter o form
   2. **Aprovação Qualidade** (approval) — assignedRoles: `["AprovadorQualidade"]`
   3. **Decisão: Aprovada?** (decision) com 2 caminhos:
      - SIM → **Roteirização**
      - NÃO → **Reprovada** (envia e-mail + ramo de réplica)
   4. **Roteirização** (execution) — assignedRoles: `["Roteirizador"]`
   5. **Distribuir Retiradas** (execution) — gera Ordem de Retirada (PDF)
   6. **Decisão: Retirado?** (decision) com 3 caminhos:
      - SIM → **Finalizar** (boletim, e-mail, fim)
      - NÃO → volta para **Roteirização**
      - CANCELADA → **Cancelamento** (protocolo, e-mail, fim)
3. No campo `formIds` do workflow, vincule o formId copiado no passo 3.

---

## 5. Atribuir o workflow ao formulário

No próprio Form Builder, em "Configurações de Workflow":
- Marque o workflow recém-criado como **default** para esse form
- Assim, toda nova submissão dispara automaticamente uma instância

---

## 6. Configurar SMTP (envio de e-mails)

Em `.env.local` (ou variáveis de ambiente do hosting):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-app
SMTP_FROM=noreply@suaempresa.com
```

Templates disponíveis (ver `src/lib/email/templates.ts`):
- `retirada.aprovada` — variáveis: `{{solicitante}}`, `{{formTitle}}`, `{{aprovador}}`, `{{setorEntrega}}`, `{{enderecoEntrega}}`, `{{diasEntrega}}`, `{{regras}}`
- `retirada.reprovada` — `{{solicitante}}`, `{{formTitle}}`, `{{aprovador}}`, `{{motivoNegativa}}`
- `retirada.replica` — `{{solicitante}}`, `{{formTitle}}`, `{{replicaNumber}}`
- `retirada.roteirizada` — `{{formTitle}}`, `{{motorista}}`, `{{placa}}`
- `retirada.concluida` — `{{formTitle}}`, `{{operador}}`, `{{boletim}}`
- `retirada.cancelada` — `{{formTitle}}`, `{{protocolo}}`, `{{motivoCancelamento}}`

Teste com:
```bash
curl -X POST http://localhost:3000/api/notifications/template \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "retirada.aprovada",
    "to": "destino@empresa.com",
    "vars": {
      "solicitante": "João",
      "formTitle": "Retirada NF 12345",
      "aprovador": "Maria",
      "setorEntrega": "CD São Paulo",
      "enderecoEntrega": "Rua A, 100",
      "diasEntrega": "3 dias úteis",
      "regras": "Entregar até 18h"
    }
  }'
```

---

## 7. Ativar o cron das 19h30

```bash
cd functions
npm run deploy
```

Isso publica duas Cloud Functions agendadas:
- `reenviarRetiradasPendentes` — todo dia 19h30 (America/Sao_Paulo). Pega todas as retiradas com status `in_routing` ou `in_pickup`, marca `lastReroutedAt` e incrementa `rerouteCount`.
- `limpezaLixeira30Dias` — todo dia 03h00. Remove permanentemente itens com 30+ dias na lixeira (reforço ao auto-cleanup do TrashPanel).

**Variável necessária:** configure `NEXT_PUBLIC_BASE_URL` apontando para a URL do app Next.js. O cron usa essa URL para chamar `/api/dataconnect/workflow-action` e registrar histórico SQL.

---

## 8. Operação no dia-a-dia

### Para o **Solicitante**:
- Acessa o link público do form (ou o app de colaborador)
- Preenche os campos e submete
- Recebe e-mail automático quando aprovado/reprovado
- Pode reenviar (réplica) se for reprovado

### Para o **Aprovador Qualidade**:
- Acessa **Dashboard → Painel Retiradas**
- Filtra por status "Aguardando aprovação"
- Em cada card, clica **Aprovar** (preenche setor/endereço/dias/PDF da NF)
  ou **Reprovar** (preenche motivo)

### Para o **Roteirizador**:
- Mesma página **Painel Retiradas**, filtra por "Aprovada" ou "Em roteirização"
- Clica **Roteirizar** → preenche motorista + placa
- Clica **Imprimir OR** → abre tela de Ordem de Retirada (botão imprimir + baixar PDF)

### Para o **Operador de Retirada**:
- Filtra por "Em retirada" ou "Em roteirização"
- Clica **Marcar retirado** → preenche boletim → envia
- Ou clica **Cancelar** → preenche protocolo + motivo

### Para o **Admin**:
- **Dashboard → BravoFlow → Métricas** — vê quantos fluxos iniciaram, status atual, SLA por etapa, distribuição por formulário, últimas 20 instâncias
- **Dashboard → Painel Retiradas** — vê tudo em tempo real
- **Dashboard → Lixeira** — itens excluídos (auto-limpeza após 30 dias)

---

## 9. APIs novas — referência rápida

### `POST /api/dataconnect/workflow-action`
Aplica uma ação de workflow. Body:
```json
{
  "responseId": "...",
  "action": "approve|reject|replicate|route|mark-picked-up|cancel|transition",
  "performedBy": "...",
  "performedByUsername": "...",
  // campos específicos por ação
}
```
Atualiza `fact_form_response` e registra `fact_workflow_history`.

### `GET /api/dataconnect/workflow-metrics`
Query: `?formId=&companyId=&from=&to=`
Retorna: `{ totals, byForm, byStage, byStatus, recent, sla }`

### `POST /api/notifications/template`
Body: `{ templateId, to, vars }` — renderiza e envia.

### `GET /api/notifications/template`
Lista templates disponíveis.

---

## 10. Estrutura de arquivos criados/modificados

```
scripts/sql/
  └── 002_workflow_retirada.sql              [NOVO]

src/types/
  └── index.ts                               [Modificado: CollaboratorRole, FormResponse estendido]

src/lib/email/
  └── templates.ts                           [NOVO: 8 templates HTML]

functions/src/
  └── scheduledTriggers.ts                   [NOVO: cron 19h30 + limpeza lixeira]

src/components/
  ├── RetiradaActionModal.tsx                [NOVO: modal de ações]
  └── Sidebar.tsx                            [Modificado: links Retiradas + Lixeira]

app/api/dataconnect/
  ├── workflow-action/route.ts               [NOVO]
  ├── workflow-metrics/route.ts              [NOVO]
  └── save-collaborator/route.ts             [Modificado: aceita roles[]]

app/api/notifications/template/
  └── route.ts                               [NOVO]

app/dashboard/
  ├── users/page.tsx                         [Modificado: pílulas BravoFlow]
  ├── bravoflow/page.tsx                     [Modificado: botão Métricas]
  ├── bravoflow/metrics/page.tsx             [NOVO]
  ├── retiradas/page.tsx                     [NOVO]
  └── retiradas/[id]/ordem-retirada/page.tsx [NOVO]

docs/
  └── WORKFLOW_RETIRADA.md                   [NOVO — este arquivo]
```

---

## 11. O que ainda pode evoluir (próximas iterações)

- **Editor de templates de e-mail** na UI (admin pode editar HTML/variáveis sem mexer no código)
- **Notificações in-app** (sino de notificação no header) além do e-mail
- **Upload de PDF da NF direto no modal de aprovação** (hoje aceita URL, falta integrar Storage)
- **Réplica** completa: hoje a contagem é incrementada, mas a UI específica de "reenviar como réplica" ainda usa o form normal — pode-se criar um botão "Reenviar (réplica)" no histórico do solicitante
- **Dashboards específicos** por papel (Aprovador vê só pendentes dele, Roteirizador vê só prontos para roteirizar etc.)
- **Geração automática de PDF da Ordem de Retirada anexada ao e-mail** (hoje só baixa pela tela)
- **Integração com WhatsApp** pelos templates (já tem Twilio configurado, falta só a função `renderWhatsAppTemplate`)
