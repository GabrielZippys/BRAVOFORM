'use client';

/**
 * RetiradaActionModal — Modal único que renderiza o formulário apropriado
 * para cada ação do workflow de Retirada (approve, reject, route, pickup,
 * cancel). Submete via POST /api/dataconnect/workflow-action e dispara o
 * e-mail correspondente via POST /api/notifications/template.
 */

import { useState } from 'react';
import { X, CheckCircle2, XCircle, Truck, PackageCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type Action = 'approve' | 'reject' | 'route' | 'pickup' | 'cancel';

interface Retirada {
  id: string;
  formTitle: string;
  solicitante: string;
  motorista?: string;
  placa?: string;
}

interface Props {
  action: Action;
  retirada: Retirada;
  onClose: (refresh?: boolean) => void;
}

const ACTION_CONFIG: Record<Action, { title: string; color: string; icon: any; submit: string; templateId: string | null }> = {
  approve: { title: 'Aprovar retirada',  color: '#10b981', icon: CheckCircle2, submit: 'Aprovar',          templateId: 'retirada.aprovada' },
  reject:  { title: 'Reprovar retirada', color: '#ef4444', icon: XCircle,      submit: 'Reprovar',         templateId: 'retirada.reprovada' },
  route:   { title: 'Roteirizar',         color: '#3b82f6', icon: Truck,        submit: 'Salvar rota',      templateId: 'retirada.roteirizada' },
  pickup:  { title: 'Marcar retirado',    color: '#059669', icon: PackageCheck, submit: 'Finalizar',        templateId: 'retirada.concluida' },
  cancel:  { title: 'Cancelar retirada',  color: '#6b7280', icon: AlertCircle,  submit: 'Confirmar cancelamento', templateId: 'retirada.cancelada' },
};

export default function RetiradaActionModal({ action, retirada, onClose }: Props) {
  const { user } = useAuth();
  const cfg = ACTION_CONFIG[action];
  const Icon = cfg.icon;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Estados específicos por ação
  const [setorEntrega, setSetorEntrega] = useState('');
  const [enderecoEntrega, setEnderecoEntrega] = useState('');
  const [diasEntrega, setDiasEntrega] = useState('');
  const [produtoExisteNF, setProdutoExisteNF] = useState<boolean | null>(null);
  const [pdfNfUrl, setPdfNfUrl] = useState('');
  const [regras, setRegras] = useState('Entregar até 18h. Apresentar NF impressa.');

  const [rejectionReason, setRejectionReason] = useState('');

  const [motorista, setMotorista] = useState(retirada.motorista || '');
  const [placa, setPlaca] = useState(retirada.placa || '');

  const [boletim, setBoletim] = useState('');

  const [protocolo, setProtocolo] = useState('');
  const [motivoCancel, setMotivoCancel] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const body: any = {
        responseId: retirada.id,
        action,
        performedBy: user?.uid || 'admin',
        performedByUsername: user?.email || 'Administrador',
      };

      if (action === 'approve') {
        if (!setorEntrega || !enderecoEntrega || !diasEntrega) {
          throw new Error('Setor, endereço e dias de entrega são obrigatórios.');
        }
        Object.assign(body, {
          setorEntrega, enderecoEntrega, diasEntrega,
          produtoExisteNF: produtoExisteNF ?? undefined,
          pdfNotaFiscalUrl: pdfNfUrl || undefined,
        });
      } else if (action === 'reject') {
        if (!rejectionReason.trim()) throw new Error('Informe o motivo da reprovação.');
        Object.assign(body, { rejectionReason });
      } else if (action === 'route') {
        if (!motorista || !placa) throw new Error('Motorista e placa são obrigatórios.');
        Object.assign(body, { motorista, placa });
      } else if (action === 'pickup') {
        if (!boletim.trim()) throw new Error('Informe o número do boletim.');
        Object.assign(body, { boletim });
      } else if (action === 'cancel') {
        if (!protocolo.trim()) throw new Error('Informe o protocolo de cancelamento.');
        Object.assign(body, { protocoloCancelamento: protocolo, motivoCancelamento: motivoCancel });
      }

      // 1) Aplica a ação no SQL
      const res = await fetch('/api/dataconnect/workflow-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao executar ação');

      // 2) Dispara e-mail (best-effort, não bloqueante)
      if (cfg.templateId && recipientEmail) {
        try {
          const vars: Record<string, any> = {
            formTitle: retirada.formTitle,
            solicitante: retirada.solicitante,
            aprovador: user?.email || 'Administrador',
          };
          if (action === 'approve') Object.assign(vars, { setorEntrega, enderecoEntrega, diasEntrega, regras });
          if (action === 'reject') Object.assign(vars, { motivoNegativa: rejectionReason });
          if (action === 'route') Object.assign(vars, { motorista, placa });
          if (action === 'pickup') Object.assign(vars, { operador: user?.email || 'Operador', boletim });
          if (action === 'cancel') Object.assign(vars, { protocolo, motivoCancelamento: motivoCancel });

          await fetch('/api/notifications/template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId: cfg.templateId, to: recipientEmail, vars }),
          });
        } catch (emailErr) {
          console.warn('⚠️ Falha no e-mail (a ação foi registrada):', emailErr);
        }
      }

      onClose(true);
    } catch (e: any) {
      setError(e.message || 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20,
    }} onClick={() => onClose(false)}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, maxWidth: 520, width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', background: cfg.color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon size={24} />
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{cfg.title}</h2>
              <p style={{ margin: '2px 0 0', fontSize: 13, opacity: .9 }}>{retirada.formTitle}</p>
            </div>
          </div>
          <button onClick={() => onClose(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          {/* Approve */}
          {action === 'approve' && (
            <>
              <Field label="Setor de entrega *" value={setorEntrega} onChange={setSetorEntrega} placeholder="Ex: CD São Paulo" />
              <Field label="Endereço de entrega *" value={enderecoEntrega} onChange={setEnderecoEntrega} placeholder="Rua, número, cidade" />
              <Field label="Dias de entrega *" value={diasEntrega} onChange={setDiasEntrega} placeholder="Ex: 3 dias úteis" />
              <Field label="URL do PDF da Nota Fiscal" value={pdfNfUrl} onChange={setPdfNfUrl} placeholder="https://..." />
              <FieldRadio
                label="Produto existe na NF?"
                value={produtoExisteNF}
                onChange={setProdutoExisteNF}
              />
              <Field label="Regras (vai no e-mail)" value={regras} onChange={setRegras} multiline />
            </>
          )}
          {/* Reject */}
          {action === 'reject' && (
            <Field
              label="Motivo da reprovação *"
              value={rejectionReason}
              onChange={setRejectionReason}
              multiline
              placeholder="Explique por que a solicitação foi reprovada..."
            />
          )}
          {/* Route */}
          {action === 'route' && (
            <>
              <Field label="Nome do motorista *" value={motorista} onChange={setMotorista} placeholder="Ex: João Silva" />
              <Field label="Placa do veículo *" value={placa} onChange={setPlaca} placeholder="ABC-1234" />
            </>
          )}
          {/* Pickup */}
          {action === 'pickup' && (
            <Field
              label="Número do boletim *"
              value={boletim}
              onChange={setBoletim}
              placeholder="Ex: BOL-2025-001234"
            />
          )}
          {/* Cancel */}
          {action === 'cancel' && (
            <>
              <Field label="Protocolo de cancelamento *" value={protocolo} onChange={setProtocolo} placeholder="Ex: PROT-2025-0001" />
              <Field label="Motivo do cancelamento" value={motivoCancel} onChange={setMotivoCancel} multiline />
            </>
          )}

          {/* Email opcional para notificação */}
          <Field
            label="E-mail para notificar (opcional)"
            value={recipientEmail}
            onChange={setRecipientEmail}
            placeholder="solicitante@empresa.com"
            type="email"
          />

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={() => onClose(false)}
            disabled={submitting}
            style={{ padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: '9px 18px', background: cfg.color, color: '#fff', border: 'none', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: submitting ? .6 : 1 }}
          >
            {submitting ? 'Enviando...' : cfg.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, multiline, type = 'text' }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</label>
      {multiline ? (
        <textarea
          value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />
      ) : (
        <input
          type={type} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
        />
      )}
    </div>
  );
}

function FieldRadio({ label, value, onChange }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</label>
      <div style={{ display: 'flex', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="radio" checked={value === true} onChange={() => onChange(true)} /> Sim
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="radio" checked={value === false} onChange={() => onChange(false)} /> Não
        </label>
      </div>
    </div>
  );
}
