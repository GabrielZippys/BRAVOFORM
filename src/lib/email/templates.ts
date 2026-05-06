/**
 * BravoFlow — Email Templates
 *
 * Templates HTML reutilizáveis com substituição de variáveis estilo {{var}}.
 * Cada template tem um id, subject e body HTML. Variáveis suportadas vêm
 * em um objeto plano (Record<string, string|number>).
 *
 * Uso típico:
 *   const { subject, html } = renderTemplate('retirada.aprovada', {
 *     solicitante: 'João',
 *     formTitle: 'Retirada NF 12345',
 *     regras: 'Entregar até 18h. Aceitar apenas com NF impressa.',
 *   });
 */

export type TemplateId =
  | 'retirada.aprovada'
  | 'retirada.reprovada'
  | 'retirada.replica'
  | 'retirada.roteirizada'
  | 'retirada.concluida'
  | 'retirada.cancelada'
  | 'workflow.transition'
  | 'workflow.assigned';

export interface EmailTemplate {
  id: TemplateId;
  subject: string;
  html: string;
}

const BASE_STYLES = `
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 24px; background: #f3f4f6; color: #1f2937; }
    .card { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,.08); }
    .header { padding: 24px; color: #fff; text-align: center; }
    .header h1 { margin: 0 0 4px; font-size: 22px; }
    .header p { margin: 0; opacity: .9; font-size: 14px; }
    .body { padding: 24px; line-height: 1.6; font-size: 15px; }
    .body p { margin: 0 0 16px; }
    .info-box { background: #f9fafb; border-left: 4px solid #6366f1; padding: 14px 16px; border-radius: 6px; margin: 16px 0; }
    .info-box strong { display: block; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    .footer { padding: 16px 24px; background: #f9fafb; color: #6b7280; font-size: 12px; text-align: center; border-top: 1px solid #e5e7eb; }
  </style>`;

function wrap(headerColor: string, title: string, subtitle: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLES}</head><body>
    <div class="card">
      <div class="header" style="background: ${headerColor};">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="body">${content}</div>
      <div class="footer">Este é um e-mail automático do BravoFlow.</div>
    </div>
  </body></html>`;
}

const TEMPLATES: Record<TemplateId, EmailTemplate> = {
  // -------------------------------------------------------------------- APROVADA
  'retirada.aprovada': {
    id: 'retirada.aprovada',
    subject: '✅ Retirada aprovada — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'Solicitação aprovada',
      'Sua retirada foi aprovada e seguirá para roteirização',
      `<p>Olá <strong>{{solicitante}}</strong>,</p>
       <p>Sua solicitação <strong>{{formTitle}}</strong> foi aprovada por <strong>{{aprovador}}</strong>.</p>
       <div class="info-box">
         <strong>Setor de entrega</strong>{{setorEntrega}}
       </div>
       <div class="info-box">
         <strong>Endereço</strong>{{enderecoEntrega}}
       </div>
       <div class="info-box">
         <strong>Dias de entrega</strong>{{diasEntrega}}
       </div>
       <div class="info-box" style="border-left-color:#10b981;">
         <strong>Regras</strong>{{regras}}
       </div>
       <p>Em breve um roteirizador definirá o motorista e a placa para esta retirada.</p>`
    ),
  },

  // -------------------------------------------------------------------- REPROVADA
  'retirada.reprovada': {
    id: 'retirada.reprovada',
    subject: '❌ Retirada reprovada — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      'Solicitação reprovada',
      'Sua solicitação não foi aprovada',
      `<p>Olá <strong>{{solicitante}}</strong>,</p>
       <p>Sua solicitação <strong>{{formTitle}}</strong> foi reprovada por <strong>{{aprovador}}</strong>.</p>
       <div class="info-box" style="border-left-color:#ef4444;">
         <strong>Motivo da reprovação</strong>{{motivoNegativa}}
       </div>
       <p>Você pode <strong>corrigir os dados e reenviar a solicitação (réplica)</strong> ou encerrar a solicitação.</p>`
    ),
  },

  // -------------------------------------------------------------------- RÉPLICA
  'retirada.replica': {
    id: 'retirada.replica',
    subject: '🔁 Réplica recebida — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      'Nova réplica para análise',
      'O solicitante reenviou a solicitação após reprovação',
      `<p>O solicitante <strong>{{solicitante}}</strong> reenviou a solicitação <strong>{{formTitle}}</strong> após a reprovação anterior.</p>
       <div class="info-box">
         <strong>Réplica nº</strong>{{replicaNumber}}
       </div>
       <p>Acesse o BravoFlow para revisar os novos dados informados.</p>`
    ),
  },

  // -------------------------------------------------------------------- ROTEIRIZADA
  'retirada.roteirizada': {
    id: 'retirada.roteirizada',
    subject: '🚚 Retirada distribuída — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'Retirada roteirizada',
      'Motorista designado para a retirada',
      `<p>A retirada <strong>{{formTitle}}</strong> foi distribuída.</p>
       <div class="info-box">
         <strong>Motorista</strong>{{motorista}}
       </div>
       <div class="info-box">
         <strong>Placa</strong>{{placa}}
       </div>
       <p>NF e Ordem de Retirada estão prontas para impressão no painel.</p>`
    ),
  },

  // -------------------------------------------------------------------- CONCLUÍDA
  'retirada.concluida': {
    id: 'retirada.concluida',
    subject: '✔️ Retirada concluída — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      'Retirada finalizada',
      'A operação foi concluída com sucesso',
      `<p>A retirada <strong>{{formTitle}}</strong> foi finalizada por <strong>{{operador}}</strong>.</p>
       <div class="info-box">
         <strong>Boletim</strong>{{boletim}}
       </div>
       <p>Obrigado!</p>`
    ),
  },

  // -------------------------------------------------------------------- CANCELADA
  'retirada.cancelada': {
    id: 'retirada.cancelada',
    subject: '⚠️ Retirada cancelada — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
      'Retirada cancelada',
      'Operação cancelada — confira o protocolo',
      `<p>A retirada <strong>{{formTitle}}</strong> foi cancelada.</p>
       <div class="info-box">
         <strong>Protocolo</strong>{{protocolo}}
       </div>
       <div class="info-box">
         <strong>Motivo</strong>{{motivoCancelamento}}
       </div>`
    ),
  },

  // -------------------------------------------------------------------- TRANSIÇÃO GENÉRICA
  'workflow.transition': {
    id: 'workflow.transition',
    subject: '🔔 Workflow atualizado — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      'Atualização do workflow',
      '{{stageName}}',
      `<p>O workflow <strong>{{formTitle}}</strong> avançou para a etapa <strong>{{stageName}}</strong>.</p>
       <p>{{message}}</p>`
    ),
  },

  // -------------------------------------------------------------------- ATRIBUIÇÃO
  'workflow.assigned': {
    id: 'workflow.assigned',
    subject: '📌 Atribuído a você — {{formTitle}}',
    html: wrap(
      'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      'Nova tarefa atribuída',
      'Você foi designado para a próxima etapa',
      `<p>Olá <strong>{{assignee}}</strong>,</p>
       <p>Você foi designado para a etapa <strong>{{stageName}}</strong> do workflow <strong>{{formTitle}}</strong>.</p>
       <p>{{message}}</p>`
    ),
  },
};

/**
 * Renderiza um template substituindo as variáveis no formato {{nome}}.
 * Chaves não fornecidas são substituídas por string vazia.
 */
export function renderTemplate(
  templateId: TemplateId,
  vars: Record<string, string | number | boolean | undefined | null> = {}
): { subject: string; html: string } {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new Error(`Template não encontrado: ${templateId}`);

  const replace = (str: string) =>
    str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const v = vars[key];
      if (v === undefined || v === null) return '';
      return String(v);
    });

  return {
    subject: replace(tpl.subject),
    html: replace(tpl.html),
  };
}

export function listTemplates(): EmailTemplate[] {
  return Object.values(TEMPLATES);
}
