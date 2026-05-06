'use client';

/**
 * Ordem de Retirada — página printável + geração de PDF.
 * Usa jspdf (já é dependência do projeto, ver HistoryPanel).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, Download, ArrowLeft, Truck } from 'lucide-react';

interface OrdemData {
  id: string;
  formTitle: string;
  solicitante: string;
  motorista?: string;
  placa?: string;
  setor_entrega?: string;
  endereco_entrega?: string;
  dias_entrega?: string;
  status: string;
  submittedAt: string;
  approved_at?: string;
  answers?: Record<string, any>;
  pdf_nota_fiscal_url?: string;
}

export default function OrdemRetiradaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<OrdemData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/dataconnect/responses?id=${encodeURIComponent(params.id)}`);
        const json = await res.json();
        if (json.success && json.data) {
          setData({
            id: json.data.id,
            formTitle: json.data.formTitle,
            solicitante: json.data.collaboratorUsername,
            motorista: json.data.motorista,
            placa: json.data.placa,
            setor_entrega: json.data.setor_entrega,
            endereco_entrega: json.data.endereco_entrega,
            dias_entrega: json.data.dias_entrega,
            status: json.data.status,
            submittedAt: json.data.submittedAt,
            approved_at: json.data.approved_at,
            answers: json.data.answers,
            pdf_nota_fiscal_url: json.data.pdf_nota_fiscal_url,
          });
        }
      } catch (e) {
        console.error('Erro ao carregar ordem:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.id]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!data) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ORDEM DE RETIRADA', 105, 18, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${data.id.slice(-12).toUpperCase()}`, 105, 25, { align: 'center' });

    // Linha divisória
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.5);
    doc.line(15, 30, 195, 30);

    // Bloco de informações principais
    autoTable(doc, {
      startY: 36,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontStyle: 'bold' },
      head: [['Campo', 'Valor']],
      body: [
        ['Solicitante',     data.solicitante || '—'],
        ['Formulário',      data.formTitle || '—'],
        ['Status',          data.status || '—'],
        ['Submetida em',    data.submittedAt ? new Date(data.submittedAt).toLocaleString('pt-BR') : '—'],
        ['Aprovada em',     data.approved_at ? new Date(data.approved_at).toLocaleString('pt-BR') : '—'],
      ],
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });

    // Bloco de roteirização
    autoTable(doc, {
      // @ts-ignore
      startY: (doc as any).lastAutoTable.finalY + 8,
      theme: 'grid',
      headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
      head: [['Roteirização', '']],
      body: [
        ['Motorista', data.motorista || '—'],
        ['Placa',     data.placa || '—'],
      ],
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });

    // Bloco de entrega
    autoTable(doc, {
      // @ts-ignore
      startY: (doc as any).lastAutoTable.finalY + 8,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      head: [['Entrega', '']],
      body: [
        ['Setor',      data.setor_entrega || '—'],
        ['Endereço',   data.endereco_entrega || '—'],
        ['Prazo',      data.dias_entrega || '—'],
      ],
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });

    // Assinaturas no rodapé
    const finalY = (doc as any).lastAutoTable.finalY + 30;
    doc.setFontSize(9);
    doc.line(20, finalY, 90, finalY);
    doc.line(120, finalY, 190, finalY);
    doc.text('Assinatura do Motorista', 55, finalY + 6, { align: 'center' });
    doc.text('Assinatura do Recebedor', 155, finalY + 6, { align: 'center' });

    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}  •  BravoFlow`, 105, 285, { align: 'center' });

    doc.save(`ordem-retirada-${data.id.slice(-8)}.pdf`);
  };

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center' }}>Carregando ordem...</div>;
  }
  if (!data) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#ef4444' }}>Ordem não encontrada.</div>;
  }

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '2rem' }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      <div className="no-print" style={{ maxWidth: 800, margin: '0 auto 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#3b82f6', border: '1.5px solid #3b82f6', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            <Printer size={16} /> Imprimir
          </button>
          <button
            onClick={handleDownloadPDF}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            <Download size={16} /> Baixar PDF
          </button>
        </div>
      </div>

      {/* Folha A4 */}
      <div style={{
        maxWidth: 800, margin: '0 auto', background: '#fff', padding: '2.5rem',
        boxShadow: '0 4px 12px rgba(0,0,0,.08)', borderRadius: 8,
      }}>
        <div style={{ borderBottom: '3px solid #6366f1', paddingBottom: 16, marginBottom: 24, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#111827', letterSpacing: '.05em' }}>ORDEM DE RETIRADA</h1>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
            #{data.id.slice(-12).toUpperCase()}
          </div>
        </div>

        <Section title="Solicitação" color="#6366f1">
          <Row label="Solicitante" value={data.solicitante} />
          <Row label="Formulário" value={data.formTitle} />
          <Row label="Status" value={data.status} />
          <Row label="Submetida em" value={data.submittedAt ? new Date(data.submittedAt).toLocaleString('pt-BR') : '—'} />
          <Row label="Aprovada em" value={data.approved_at ? new Date(data.approved_at).toLocaleString('pt-BR') : '—'} />
        </Section>

        <Section title="Roteirização" color="#f59e0b">
          <Row label="Motorista" value={data.motorista} />
          <Row label="Placa" value={data.placa} />
        </Section>

        <Section title="Entrega" color="#10b981">
          <Row label="Setor" value={data.setor_entrega} />
          <Row label="Endereço" value={data.endereco_entrega} />
          <Row label="Prazo" value={data.dias_entrega} />
        </Section>

        {data.pdf_nota_fiscal_url && (
          <Section title="Nota Fiscal" color="#8b5cf6">
            <a href={data.pdf_nota_fiscal_url} target="_blank" rel="noopener noreferrer"
               style={{ color: '#8b5cf6', textDecoration: 'underline' }}>
              📄 Baixar PDF da NF
            </a>
          </Section>
        )}

        {/* Assinaturas */}
        <div style={{ marginTop: 60, display: 'flex', justifyContent: 'space-around', gap: 32 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ borderTop: '1px solid #111', paddingTop: 6, fontSize: 12 }}>Assinatura do Motorista</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ borderTop: '1px solid #111', paddingTop: 6, fontSize: 12 }}>Assinatura do Recebedor</div>
          </div>
        </div>

        <div style={{ marginTop: 30, textAlign: 'center', fontSize: 10, color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
          Gerada em {new Date().toLocaleString('pt-BR')} • BravoFlow
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children }: any) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{
        fontSize: 13, color: '#fff', background: color,
        padding: '6px 12px', borderRadius: 4, margin: '0 0 8px',
        textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700,
      }}>{title}</h2>
      <div style={{ padding: '4px 4px' }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: any) {
  return (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>
      <span style={{ flex: '0 0 140px', color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <span style={{ flex: 1, color: '#111827', fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );
}
