/**
 * POST /api/ai/generate-workflow
 *
 * Gera um workflow BravoFlow a partir de uma descrição em português brasileiro.
 *
 * O modelo é instruído com:
 *   - O catálogo de stage types disponíveis (execution/waiting/notification/...)
 *   - Os papéis BravoFlow (AprovadorQualidade, Roteirizador, OperadorRetirada, Supervisor)
 *   - Vocabulário operacional brasileiro (retirada, roteirização, qualidade, NF, boletim)
 *   - Schema do output (JSON estrito validado no servidor)
 *
 * Body:
 *   {
 *     description: string,   // descrição em pt-BR do processo
 *     context?: {
 *       companyName?: string,
 *       companyDepartments?: string[],
 *     }
 *   }
 *
 * Response (sucesso):
 *   {
 *     success: true,
 *     data: {
 *       suggestedName: string,
 *       suggestedDescription: string,
 *       stages: WorkflowStage[],   // já em ordem, com isInitialStage/isFinalStage corretos
 *       reasoning: string,         // explicação curta da estrutura escolhida
 *     }
 *   }
 *
 * Response (erro):
 *   { success: false, error: string }
 *
 * ⚠️ Reusa OPENAI_API_KEY (já configurada em /api/process-products).
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Tipos de saída esperados pelo modelo ────────────────────────────────
interface AIStage {
  name: string;
  description?: string;
  stageType: 'execution' | 'waiting' | 'notification' | 'documentation' | 'validation' | 'custom';
  color?: string;
  requireComment?: boolean;
  requireAttachments?: boolean;
  requireForms?: boolean;
  /** Sugestão de papel do executor (texto livre, mapeado depois) */
  suggestedRole?: string;
  /** Para etapas de timer */
  timer?: {
    type: 'hours' | 'days' | 'date';
    value: number | string;
  };
  autoNotifications?: {
    email?: boolean;
    whatsapp?: boolean;
    message?: string;
  };
}

interface AIResponse {
  suggestedName: string;
  suggestedDescription: string;
  stages: AIStage[];
  reasoning: string;
}

// ─── System prompt — calibrado para vocabulário operacional brasileiro ───
const SYSTEM_PROMPT = `Você é um especialista em desenho de processos (BPM) para empresas brasileiras, principalmente dos setores de logística, qualidade industrial, varejo e agroindústria. Sua tarefa é converter descrições em português coloquial em workflows BravoFlow estruturados.

⚠️ REGRAS CRÍTICAS:
1. Sempre retorne JSON válido, sem texto antes ou depois.
2. A primeira etapa (índice 0) é SEMPRE a entrada do fluxo (onde novas instâncias começam).
3. A última etapa é SEMPRE de tipo "custom" ou "validation" representando o fechamento.
4. Use no MÁXIMO 7 etapas. Prefira 3-5 para fluxos simples.
5. Cada etapa deve ter um propósito claro e distinto da anterior.

📐 TIPOS DE ETAPA DISPONÍVEIS:
- "execution"     → trabalho operacional em andamento (alguém executa). Use para coleta, montagem, separação, roteirização.
- "waiting"       → pausa temporal (timer). Use quando o fluxo deve esperar X horas/dias antes de avançar.
- "notification"  → envia e-mail/WhatsApp e avança automaticamente. Use para avisos a clientes/partes externas.
- "documentation" → coleta obrigatória (formulário + anexos). Use para registrar NF, fotos, comprovantes.
- "validation"    → aprovação humana (aprova/reprova/edita). Use para qualquer ponto de decisão.
- "custom"        → genérico. Use só quando nada mais se encaixa.

🎨 CORES SUGERIDAS POR TIPO (use exatamente esses hex):
- execution: "#8B5CF6"
- waiting: "#EF4444"
- notification: "#06B6D4"
- documentation: "#6366F1"
- validation: "#14B8A6"
- custom: "#10B981" (verde — use na etapa final de sucesso)

👥 PAPÉIS BRAVOFLOW (use no campo suggestedRole quando relevante):
- "AprovadorQualidade" — para validações de qualidade
- "Roteirizador"       — para etapas de roteirização logística
- "OperadorRetirada"   — para execução de retiradas/coletas
- "Supervisor"         — para aprovações gerenciais
- "Solicitante"        — para a etapa inicial (quem abre a solicitação)
- "Colaborador"        — genérico

🇧🇷 VOCABULÁRIO BRASILEIRO ESPERADO:
- "retirada"        = pickup/coleta de qualidade
- "roteirização"    = atribuir motorista/rota
- "boletim"         = comprovante de retirada
- "NF"              = nota fiscal
- "PA"              = produto acabado
- "aprovação"       = etapa de validação
- "supervisor"      = papel hierárquico

📤 FORMATO DE SAÍDA (JSON estrito):
{
  "suggestedName": "Nome curto do workflow (max 60 chars)",
  "suggestedDescription": "Descrição em 1 frase (max 140 chars)",
  "reasoning": "Por que escolhi essa estrutura (max 200 chars)",
  "stages": [
    {
      "name": "Nome da etapa (max 30 chars)",
      "description": "O que acontece nessa etapa (max 100 chars)",
      "stageType": "documentation|execution|validation|notification|waiting|custom",
      "color": "#XXXXXX",
      "requireComment": false,
      "requireAttachments": false,
      "requireForms": false,
      "suggestedRole": "AprovadorQualidade|Roteirizador|...",
      "timer": { "type": "hours", "value": 2 },
      "autoNotifications": {
        "email": true,
        "whatsapp": false,
        "message": "Texto da notificação"
      }
    }
  ]
}

Não inclua campos opcionais que não se aplicam à etapa.

EXEMPLO de descrição: "fluxo de retirada de qualidade com aprovação do supervisor e roteirização"
EXEMPLO de saída esperada (resumido):
- Etapa 1: "Solicitação" (documentation, role: Solicitante, requireForms: true)
- Etapa 2: "Aprovação Supervisor" (validation, role: Supervisor)
- Etapa 3: "Roteirização" (execution, role: Roteirizador)
- Etapa 4: "Retirada" (execution, role: OperadorRetirada, requireAttachments: true)
- Etapa 5: "Concluída" (custom, color: #10B981)`;

// ─── Validação do output do modelo ───────────────────────────────────────
function validateAIResponse(data: any): { valid: boolean; error?: string; cleaned?: AIResponse } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Resposta da IA não é um objeto JSON' };
  }
  if (typeof data.suggestedName !== 'string' || !data.suggestedName.trim()) {
    return { valid: false, error: 'suggestedName ausente ou inválido' };
  }
  if (!Array.isArray(data.stages) || data.stages.length === 0) {
    return { valid: false, error: 'stages deve ser array não-vazio' };
  }
  if (data.stages.length > 10) {
    return { valid: false, error: 'Máximo de 10 etapas por workflow' };
  }

  const validTypes = new Set(['execution', 'waiting', 'notification', 'documentation', 'validation', 'custom']);
  for (let i = 0; i < data.stages.length; i++) {
    const s = data.stages[i];
    if (!s || typeof s !== 'object') {
      return { valid: false, error: `Etapa ${i + 1}: não é um objeto válido` };
    }
    if (typeof s.name !== 'string' || !s.name.trim()) {
      return { valid: false, error: `Etapa ${i + 1}: name ausente` };
    }
    if (!validTypes.has(s.stageType)) {
      return { valid: false, error: `Etapa ${i + 1}: stageType "${s.stageType}" inválido` };
    }
  }

  return {
    valid: true,
    cleaned: {
      suggestedName: String(data.suggestedName).slice(0, 100),
      suggestedDescription: String(data.suggestedDescription || '').slice(0, 200),
      reasoning: String(data.reasoning || '').slice(0, 300),
      stages: data.stages,
    },
  };
}

// ─── Conversão para formato WorkflowStage do BravoFlow ───────────────────
function aiStagesToWorkflowStages(aiStages: AIStage[]): any[] {
  return aiStages.map((s, idx) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ai_stage_${Date.now()}_${idx}`;

    const colorMap: Record<string, string> = {
      execution: '#8B5CF6',
      waiting: '#EF4444',
      notification: '#06B6D4',
      documentation: '#6366F1',
      validation: '#14B8A6',
      custom: idx === aiStages.length - 1 ? '#10B981' : '#6B7280',
    };

    return {
      id,
      name: s.name.slice(0, 60),
      description: s.description?.slice(0, 200) || '',
      stageType: s.stageType,
      color: s.color || colorMap[s.stageType] || '#6B7280',
      allowedRoles: [],
      allowedUsers: [],
      requireComment: !!s.requireComment,
      requireAttachments: !!s.requireAttachments,
      requireForms: !!s.requireForms,
      autoNotifications: {
        email: s.autoNotifications?.email || false,
        whatsapp: s.autoNotifications?.whatsapp || false,
        recipients: [],
        message: s.autoNotifications?.message || '',
        emailRecipients: [],
        whatsappNumbers: [],
      },
      timer: s.timer
        ? { type: s.timer.type, value: s.timer.value, autoAdvance: true }
        : undefined,
      order: idx,
      isInitialStage: idx === 0,
      isFinalStage: idx === aiStages.length - 1,
      suggestedRole: s.suggestedRole, // metadado para o frontend mostrar dica
    };
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'OPENAI_API_KEY não configurada. Adicione no .env.local',
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const description: string | undefined = body?.description;
    const context = body?.context || {};

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'Descrição muito curta. Forneça pelo menos 10 caracteres descrevendo o processo.',
        },
        { status: 400 }
      );
    }
    if (description.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Descrição muito longa (máx 2000 caracteres)' },
        { status: 400 }
      );
    }

    // Mensagem de usuário enriquecida com contexto da empresa (se houver)
    const userMessage = [
      `DESCRIÇÃO DO PROCESSO:\n"${description.trim()}"`,
      context.companyName ? `\nEMPRESA: ${context.companyName}` : '',
      Array.isArray(context.companyDepartments) && context.companyDepartments.length > 0
        ? `DEPARTAMENTOS DISPONÍVEIS: ${context.companyDepartments.join(', ')}`
        : '',
      '\nGere o workflow BravoFlow estruturado em JSON conforme o schema.',
    ]
      .filter(Boolean)
      .join('\n');

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: `Erro da OpenAI (HTTP ${aiResponse.status}): ${errBody?.error?.message || 'desconhecido'}`,
        },
        { status: 502 }
      );
    }

    const data = await aiResponse.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Resposta da IA veio vazia' },
        { status: 502 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Fallback: tentar extrair JSON do texto
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json(
          { success: false, error: 'IA retornou conteúdo não-JSON' },
          { status: 502 }
        );
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return NextResponse.json(
          { success: false, error: 'IA retornou JSON malformado' },
          { status: 502 }
        );
      }
    }

    const validation = validateAIResponse(parsed);
    if (!validation.valid || !validation.cleaned) {
      return NextResponse.json(
        { success: false, error: `Resposta da IA inválida: ${validation.error}` },
        { status: 502 }
      );
    }

    const workflowStages = aiStagesToWorkflowStages(validation.cleaned.stages);

    return NextResponse.json({
      success: true,
      data: {
        suggestedName: validation.cleaned.suggestedName,
        suggestedDescription: validation.cleaned.suggestedDescription,
        reasoning: validation.cleaned.reasoning,
        stages: workflowStages,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Erro interno: ${error?.message || 'desconhecido'}` },
      { status: 500 }
    );
  }
}
