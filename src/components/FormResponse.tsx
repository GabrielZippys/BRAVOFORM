'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../firebase/config';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { type Form, type FormResponse as FormResponseType } from '@/types';
import { X, Send, Eraser, CheckCircle2, AlertTriangle } from 'lucide-react';



// Campo aprimorado para tipos
type EnhancedFormField = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  displayAs?: string;
  placeholder?: string;
  description?: string;
  options?: string[];
  allowOther?: boolean;
  columns?: { id: string; label: string; type: string; options?: string[] }[];
  rows?: { id: string; label: string }[];
  [key: string]: any;
};

interface FormResponseProps {
  form: Form | null;
  collaborator: {
    id: string;
    username: string;
    companyId: string;
    departmentId: string;
    canViewHistory?: boolean;
    canEditHistory?: boolean;
  };
  onClose: () => void;
  existingResponse?: FormResponseType | null;
  canEdit?: boolean;
}

export default function FormResponse({
  form,
  collaborator,
  onClose,
  existingResponse,
  canEdit
}: FormResponseProps) {
  if (!form) return null;

  // ---- TEMA PEGO DO FORMULÁRIO ----
const theme = {
  bgColor: form.theme?.bgColor || "#ffffff",
  accentColor: form.theme?.accentColor || "#3b82f6",
  fontColor: form.theme?.fontColor || "#1f2937",
  inputBgColor: form.theme?.inputBgColor || "#171e2c",
  inputFontColor: form.theme?.inputFontColor || "#e8f2ff",
  sectionHeaderBg: form.theme?.sectionHeaderBg || "#19263b",
  sectionHeaderFont: form.theme?.sectionHeaderFont || "#49cfff",
  buttonBg: form.theme?.buttonBg || "#000",
  buttonFont: form.theme?.buttonFont || "#fff",
  footerBg: form.theme?.footerBg || "#182138",
  footerFont: form.theme?.footerFont || "#fff",
  borderRadius: form.theme?.borderRadius ?? 8,
  tableHeaderBg: form.theme?.tableHeaderBg || "#1a2238",
  tableHeaderFont: form.theme?.tableHeaderFont || "#49cfff",
  tableBorderColor: form.theme?.tableBorderColor || "#19263b",
  tableOddRowBg: form.theme?.tableOddRowBg || "#222c42",
  tableEvenRowBg: form.theme?.tableEvenRowBg || "#171e2c",
  tableCellFont: form.theme?.tableCellFont || "#e0e6f7"
};

// resolve o fundo real do input (se vier com alpha, mistura no bg geral do card)
const resolvedInputBgRGB = blendOver(theme.inputBgColor, theme.bgColor);
const resolvedInputBg = rgbToHex(resolvedInputBgRGB);

// escolhe texto legível automaticamente
const autoInputText = pickReadableTextColor(resolvedInputBg, theme.inputFontColor);

// placeholder/caret coerentes
const autoPlaceholder = withAlpha(autoInputText, 0.6);


// --- utils de cor/contraste ---
// aceita: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba()
function parseColor(c: string): {r:number,g:number,b:number,a:number} {
  c = c.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]+hex[0],16);
      const g = parseInt(hex[1]+hex[1],16);
      const b = parseInt(hex[2]+hex[2],16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 4) { // #rgba
      const r = parseInt(hex[0]+hex[0],16);
      const g = parseInt(hex[1]+hex[1],16);
      const b = parseInt(hex[2]+hex[2],16);
      const a = parseInt(hex[3]+hex[3],16)/255;
      return { r, g, b, a };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0,2),16);
      const g = parseInt(hex.slice(2,4),16);
      const b = parseInt(hex.slice(4,6),16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0,2),16);
      const g = parseInt(hex.slice(2,4),16);
      const b = parseInt(hex.slice(4,6),16);
      const a = parseInt(hex.slice(6,8),16)/255;
      return { r, g, b, a };
    }
  }
  if (c.startsWith('rgb')) {
    const nums = c.match(/[\d.]+/g)?.map(Number) ?? [0,0,0];
    const [r,g,b,a=1] = nums;
    return { r, g, b, a };
  }
  // fallback
  return { r: 0, g: 0, b: 0, a: 1 };
}

function srgbToLin(v:number){ v/=255; return v<=0.04045? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
function relLuminance({r,g,b}:{r:number,g:number,b:number}) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  return 0.2126*R + 0.7152*G + 0.0722*B;
}
function contrastRatio(fg:{r:number,g:number,b:number}, bg:{r:number,g:number,b:number}) {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const [light, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (light + 0.05) / (dark + 0.05);
}

function blendOver(top:string, bottom:string){
  const T = parseColor(top);
  const B = parseColor(bottom);
  const a = T.a + B.a*(1-T.a);
  const r = Math.round((T.r*T.a + B.r*B.a*(1-T.a))/a);
  const g = Math.round((T.g*T.a + B.g*B.a*(1-T.a))/a);
  const b = Math.round((T.b*T.a + B.b*B.a*(1-T.a))/a);
  return {r,g,b,a};
}

function rgbToHex({r,g,b}:{r:number,g:number,b:number}){
  const h = (n:number)=> n.toString(16).padStart(2,'0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// escolhe automaticamente a melhor cor de texto (preferida se tiver contraste; senão preto/branco)
function pickReadableTextColor(bgCss:string, preferredCss:string, min=4.5){
  const bg = parseColor(bgCss);
  const preferred = parseColor(preferredCss);
  const black = {r:0,g:0,b:0}, white = {r:255,g:255,b:255};
  const bgNoAlpha = {r:bg.r,g:bg.g,b:bg.b};
  const cPref = contrastRatio({r:preferred.r,g:preferred.g,b:preferred.b}, bgNoAlpha);
  if (cPref >= min) return rgbToHex({r:preferred.r,g:preferred.g,b:preferred.b});
  const cBlack = contrastRatio(black, bgNoAlpha);
  const cWhite = contrastRatio(white, bgNoAlpha);
  return cBlack >= cWhite ? '#111111' : '#ffffff';
}

function withAlpha(hex:string, alpha=0.6){
  const {r,g,b} = parseColor(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}


// ---- Estados principais ----
const [responses, setResponses] = useState<Record<string, any>>({});
const [otherInputValues, setOtherInputValues] = useState<Record<string, string>>({});
const [isSubmitting, setIsSubmitting] = useState(false);
const [error, setError] = useState('');
const [triedSubmit, setTriedSubmit] = useState(false);
const signaturePads = useRef<Record<string, HTMLCanvasElement | null>>({});

// ===== Validação obrigatórios =====
const [invalid, setInvalid] = useState<Record<string, string>>({});
const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
const isBlank = (v: any) => (typeof v === 'string' ? v.trim() === '' : v == null);

function validateRequiredField(field: EnhancedFormField): string | '' {
  const fieldId = String(field.id);
  const val = responses[fieldId];

  if (field.type === 'Cabeçalho') return '';
  if (!field.required) return '';

  switch (field.type) {
    case 'Texto':
    case 'Data':
      return isBlank(val) ? 'Campo obrigatório' : '';

    case 'Múltipla Escolha': {
      if (isBlank(val)) return 'Selecione uma opção';
      if (val === '___OTHER___') {
        const other = (otherInputValues[fieldId] || '').trim();
        return other ? '' : 'Descreva em "Outros"';
      }
      return '';
    }

    case 'Caixa de Seleção': {
      const arr: string[] = Array.isArray(val) ? val : [];
      if (arr.length === 0) return 'Selecione ao menos uma opção';
      if (arr.includes('___OTHER___')) {
        const other = (otherInputValues[fieldId] || '').trim();
        if (!other) return 'Descreva em "Outros"';
      }
      return '';
    }

    case 'Anexo': {
      const arr = Array.isArray(val) ? val : [];
      return arr.length === 0 ? 'Envie ao menos um arquivo' : '';
    }

    case 'Assinatura': {
      return typeof val === 'string' && val.startsWith('data:image')
        ? ''
        : 'Assinatura obrigatória';
    }

    case 'Tabela': {
      const rows = field.rows || [];
      const cols = field.columns || [];
      for (const r of rows) {
        for (const c of cols) {
          const cell = val?.[String(r.id)]?.[String(c.id)];
          if (isBlank(cell)) return 'Preencha todos os campos da tabela';
        }
      }
      return '';
    }

    default:
      return isBlank(val) ? 'Campo obrigatório' : '';
  }
}

// estilo que pinta a borda se inválido
const invalidize = (fieldId: string): React.CSSProperties =>
  invalid[fieldId]
    ? { borderColor: '#ef4444', boxShadow: '0 0 0 2px rgba(239,68,68,.25)' }
    : {};

// ===== TOAST (sucesso/erro) =====
type ToastState = { visible: boolean; type: 'success' | 'error'; message: string; duration: number };
const [toast, setToast] = useState<ToastState>({
  visible: false, type: 'success', message: '', duration: 2600
});
const toastTimer = useRef<number | null>(null);

function triggerToast(type: 'success' | 'error', message: string, duration = 2600, after?: () => void) {
  if (toastTimer.current) {
    window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
  }
  setToast({ visible: true, type, message, duration });
  toastTimer.current = window.setTimeout(() => {
    setToast(t => ({ ...t, visible: false }));
    if (after) after();
  }, duration);
}



  // Preencher respostas caso edição
  useEffect(() => {
    if (existingResponse) {
      const initial: Record<string, any> = {};
      const initialOthers: Record<string, string> = {};
      Object.entries(existingResponse)
        .filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k))
        .forEach(([k, v]) => {
          const field =
            (form.fields as EnhancedFormField[]).find(f => String(f.id) === k || f.label === k);
          if (!field) return;
          const fieldId = String(field.id);
          if (
            (field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') &&
            field.allowOther
          ) {
            if (typeof v === 'string' && v && field.options && !field.options.includes(v)) {
              initial[fieldId] = '___OTHER___';
              initialOthers[fieldId] = v;
            } else if (Array.isArray(v)) {
              const normal = v.filter(opt => field.options?.includes(opt));
              const other = v.find(opt => !(field.options ?? []).includes(opt));
              if (other) initialOthers[fieldId] = other;
              if (normal.length > 0)
                initial[fieldId] = [...normal, ...(other ? ['___OTHER___'] : [])];
            } else {
              initial[fieldId] = v;
            }
          } else {
            initial[fieldId] = v;
          }
        });
      setResponses(initial);
      setOtherInputValues(initialOthers);
    }
  }, [existingResponse, form.fields]);

  // Assinatura canvas
  useEffect(() => {
    Object.entries(signaturePads.current).forEach(([fieldId, canvas]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      let drawing = false;
      let lastX = 0, lastY = 0;
      const getPos = (e: MouseEvent | TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        if ('touches' in e && e.touches.length > 0) {
          return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top,
          };
        } else if ('changedTouches' in e && e.changedTouches.length > 0) {
          return {
            x: e.changedTouches[0].clientX - rect.left,
            y: e.changedTouches[0].clientY - rect.top,
          };
        } else if ('clientX' in e) {
          return {
            x: (e as MouseEvent).clientX - rect.left,
            y: (e as MouseEvent).clientY - rect.top,
          };
        }
        return null;
      };
      const startDraw = (e: MouseEvent | TouchEvent) => {
        e.preventDefault();
        const pos = getPos(e);
        if (!pos) return;
        drawing = true;
        lastX = pos.x;
        lastY = pos.y;
      };
      const draw = (e: MouseEvent | TouchEvent) => {
        if (!drawing) return;
        e.preventDefault();
        const pos = getPos(e);
        if (!pos) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
      };
      const stopDraw = () => {
        drawing = false;
        if (canvas.dataset.fieldId) {
          handleInputChange(canvas.dataset.fieldId, canvas.toDataURL('image/png'));
        }
      };
      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDraw);
      canvas.addEventListener('mouseleave', stopDraw);
      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', stopDraw, { passive: false });
      canvas.addEventListener('touchcancel', stopDraw, { passive: false });
      return () => {
        canvas.removeEventListener('mousedown', startDraw);
        canvas.removeEventListener('mousemove', draw);
        canvas.removeEventListener('mouseup', stopDraw);
        canvas.removeEventListener('mouseleave', stopDraw);
        canvas.removeEventListener('touchstart', startDraw);
        canvas.removeEventListener('touchmove', draw);
        canvas.removeEventListener('touchend', stopDraw);
        canvas.removeEventListener('touchcancel', stopDraw);
      };
    });
  }, [form.fields]);

  useEffect(() => {
    Object.entries(signaturePads.current).forEach(([fieldId, canvas]) => {
      if (canvas && responses[fieldId]?.startsWith?.('data:image')) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const img = new window.Image();
        img.src = responses[fieldId];
        img.onload = () => ctx.drawImage(img, 0, 0);
      }
    });
  }, [responses]);

  // Handlers
  const handleInputChange = (fieldId: string, value: any) => {
  setResponses(prev => {
    const next = { ...prev, [fieldId]: value };
    return next;
  });
  // revalida só este campo
  const field = (form.fields as EnhancedFormField[]).find(f => String(f.id) === fieldId);
  if (field?.required) {
    const err = validateRequiredField(field);
    setInvalid(prev => {
      const copy = { ...prev };
      if (err) copy[fieldId] = err; else delete copy[fieldId];
      return copy;
    });
  }
};

  const handleOtherInputChange = (fieldId: string, text: string) => {
  setOtherInputValues(prev => ({ ...prev, [fieldId]: text }));
  // revalida se for “Outros”
  const field = (form.fields as EnhancedFormField[]).find(f => String(f.id) === fieldId);
  if (field?.required) {
    const err = validateRequiredField(field);
    setInvalid(prev => {
      const copy = { ...prev };
      if (err) copy[fieldId] = err; else delete copy[fieldId];
      return copy;
    });
  }
};

  const handleTableInputChange = (
  fieldId: string,
  rowId: string,
  colId: string,
  value: any
) => {
  setResponses(prev => ({
    ...prev,
    [fieldId]: {
      ...(prev[fieldId] || {}),
      [rowId]: {
        ...(prev[fieldId]?.[rowId] || {}),
        [colId]: value,
      },
    },
  }));
  // revalida tabela
  const field = (form.fields as EnhancedFormField[]).find(f => String(f.id) === fieldId);
  if (field?.required) {
    const err = validateRequiredField(field);
    setInvalid(prev => {
      const copy = { ...prev };
      if (err) copy[fieldId] = err; else delete copy[fieldId];
      return copy;
    });
  }
};

  const handleFileChange = (fieldId: string, files: FileList | null) => {
    if (files && files.length > 0) {
      const newFiles = Array.from(files).map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      handleInputChange(fieldId, [...(responses[fieldId] || []), ...newFiles]);
    }
  };

  const removeFile = (fieldId: string, index: number) => {
    const files = responses[fieldId] || [];
    handleInputChange(fieldId, files.filter((_: any, idx: number) => idx !== index));
  };

  const clearSignature = (fieldId: string) => {
    const canvas = signaturePads.current[fieldId];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      handleInputChange(fieldId, '');
    }
  };

  // SUBMIT
  const handleSubmit = async () => {
  setIsSubmitting(true);
  setTriedSubmit(true);

  // valida obrigatórios de todos os campos
  const newInvalid: Record<string, string> = {};
  (form.fields as EnhancedFormField[]).forEach(field => {
    const err = validateRequiredField(field);
    if (err) newInvalid[String(field.id)] = err;
  });

  if (Object.keys(newInvalid).length > 0) {
    setInvalid(newInvalid);
    // scroll no primeiro inválido
    const firstId = Object.keys(newInvalid)[0];
    const node = fieldRefs.current[firstId];
    if (node?.scrollIntoView) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    triggerToast('error', 'Preencha os campos obrigatórios.', 2800);
    setIsSubmitting(false);
    return;
  }

  setInvalid({});
  setError('');

  try {
    const flattened: Record<string, any> = {
      collaboratorId: collaborator.id,
      collaboratorUsername: collaborator.username,
      formId: form.id,
      formTitle: form.title,
      companyId: form.companyId,
      departmentId: form.departmentId,
      status: 'pending',
      submittedAt: serverTimestamp()
    };

    // por label
    (form.fields as EnhancedFormField[]).forEach(field => {
      const fieldIdStr = String(field.id);
      let answerVal = responses[fieldIdStr];
      if (
        (field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') &&
        field.allowOther
      ) {
        const otherVal = otherInputValues[fieldIdStr] || '';
        if (Array.isArray(answerVal)) {
          answerVal = answerVal
            .map((v: string) => (v === '___OTHER___' ? (otherVal || '') : v))
            .filter(v => v !== '');
          if (answerVal.length === 1 && answerVal[0] === '') answerVal = '';
        } else if (answerVal === '___OTHER___') {
          answerVal = otherVal;
        }
      }
      flattened[field.label] = answerVal ?? '';
    });

    // por id
    const answers: Record<string, any> = {};
    (form.fields as EnhancedFormField[]).forEach(field => {
      const fieldIdStr = String(field.id);
      let answerVal = responses[fieldIdStr];
      if (
        (field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') &&
        field.allowOther
      ) {
        const otherVal = otherInputValues[fieldIdStr] || '';
        if (Array.isArray(answerVal)) {
          answerVal = answerVal
            .map((v: string) => (v === '___OTHER___' ? (otherVal || '') : v))
            .filter(v => v !== '');
          if (answerVal.length === 1 && answerVal[0] === '') answerVal = '';
        } else if (answerVal === '___OTHER___') {
          answerVal = otherVal;
        }
      }
      answers[fieldIdStr] = answerVal ?? '';
    });
    flattened.answers = answers;

    if (existingResponse?.id) {
      await updateDoc(
        doc(db, 'forms', form.id, 'responses', existingResponse.id),
        { ...flattened, updatedAt: serverTimestamp() }
      );
    } else {
      await addDoc(collection(db, 'forms', form.id, 'responses'), flattened);
    }

    triggerToast('success', 'Resposta enviada com sucesso!', 1800, onClose);
  } catch (err) {
    triggerToast('error', 'Não foi possível enviar a resposta.', 3000);
  } finally {
    setIsSubmitting(false);
  }
};


  // --- Render tabela fiel ao tema do form
  const renderTableCell = (
  field: EnhancedFormField,
  row: { id: string; label: string },
  col: { id: string; label: string; type: string; options?: string[] }
) => {
  const fieldId = String(field.id);
  const rowId = String(row.id);
  const colId = String(col.id);
  const value =
    responses[fieldId]?.[rowId]?.[colId] !== undefined
      ? responses[fieldId][rowId][colId]
      : '';
  const disabled = !canEdit && !!existingResponse;

  // dentro de renderTableCell()
const base = {
  width: '100%',
  background: theme.inputBgColor,
  color: autoInputText,            // << aqui
  caretColor: autoInputText,       // << aqui
  border: `1px solid ${theme.tableBorderColor}`,
  borderRadius: theme.borderRadius,
  padding: '5px 10px',
  fontSize: 16,
  ...invalidize(fieldId),
} as React.CSSProperties;



  switch (col.type) {
    case 'text':
    case 'Texto':
      return (
        <input
          style={base}
          type="text"
          value={value}
          onChange={e => handleTableInputChange(fieldId, rowId, colId, e.target.value)}
          disabled={disabled}
        />
      );


  case 'number': {
  const onNumChange = (v: string) =>
    handleTableInputChange(fieldId, rowId, colId, v.replace(/\D+/g, ''));
  return (
    <input
      style={base}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={e => onNumChange(e.target.value)}
      disabled={disabled}
    />
  );
}

case 'Número':
case 'number': {
  const v = String(responses[fieldId] ?? '');
  return (
    <input
      value={v}
      onChange={e => handleInputChange(fieldId, e.target.value.replace(/\D+/g, ''))}
      placeholder={field.placeholder || ''}
      disabled={disabled}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      style={controlBase}
    />
  );
}

    case 'date':
    case 'Data':
      return (
        <input
          style={base}
          type="date"
          value={value}
          onChange={e => handleTableInputChange(fieldId, rowId, colId, e.target.value)}
          disabled={disabled}
        />
      );
    case 'select':
      return (
        <select
          style={{ ...base }}
          value={value}
          onChange={e => handleTableInputChange(fieldId, rowId, colId, e.target.value)}
          disabled={disabled}
        >
          <option value="">Selecionar</option>
          {col.options?.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    default:
      return (
        <input
          style={base}
          type="text"
          value={value}
          onChange={e => handleTableInputChange(fieldId, rowId, colId, e.target.value)}
          disabled={disabled}
        />
      );
  }
};


  // Campo fiel ao preview
  const renderField = (field: EnhancedFormField, index: number) => {
    const fieldId = String(field.id);
    const disabled = !canEdit && !!existingResponse;
    const otherVal = '___OTHER___';
    switch (field.type) {
     case 'Cabeçalho':
  return (
    <div
      style={{
        background: theme.sectionHeaderBg,
        color: theme.sectionHeaderFont,
        fontWeight: 600,                  // antes: 'bold'
        fontSize: 'clamp(13px, 1.2vw, 16px)', // antes: 20
        lineHeight: 1.35,
        borderRadius: theme.borderRadius,
        padding: '10px 16px',
        marginBottom: 12,
        marginTop: index > 0 ? 28 : 0,
      }}
    >
      {field.label}
    </div>
  );

      case 'Tabela':
  return (
   <div style={{ overflowX: 'auto', marginBottom: 16, WebkitOverflowScrolling: 'touch' }}>
  <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: `1.5px solid ${theme.tableBorderColor}`,
          borderRadius: theme.borderRadius,
          fontSize: 16,
          background: theme.bgColor,
          color: theme.tableCellFont,
          overflow: 'hidden',
        }}
      >
        {/* controla a largura das colunas */}
       <colgroup>
    <col style={{ width: '68%' }} />
    {(field.columns || []).map((_, i) => (
      <col key={i} style={{ width: `${Math.floor(32 / (field.columns?.length || 1))}%` }} />
    ))}
  </colgroup>



        <thead>
          <tr>
            <th
              style={{
                background: theme.tableHeaderBg,
                color: theme.tableHeaderFont,
                border: `1.5px solid ${theme.tableBorderColor}`,
                borderTopLeftRadius: theme.borderRadius,
                padding: 8,
                fontWeight: 'bold',
                fontSize: 16,
              }}
            />
            {field.columns?.map((col: any) => (
              <th
                key={col.id}
                style={{
                  background: theme.tableHeaderBg,
                  color: theme.tableHeaderFont,
                  border: `1.5px solid ${theme.tableBorderColor}`,
                  padding: 8,
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {field.rows?.map((row: any, ridx: number) => (
            <tr
              key={row.id}
              style={{
                background: ridx % 2 === 0 ? theme.tableOddRowBg : theme.tableEvenRowBg,
                color: theme.tableCellFont,
              }}
            >
              <td
                style={{
                  fontWeight: 500,
                  border: `1.5px solid ${theme.tableBorderColor}`,
                  background: theme.tableHeaderBg,
                  color: theme.tableHeaderFont,
                  padding: 7,
                }}
              >
                {row.label}
              </td>

              {field.columns?.map((col: any) => (
                <td
                  key={col.id}
                  style={{
                    border: `1.5px solid ${theme.tableBorderColor}`,
                    padding: 4,
                  }}
                >
                  {renderTableCell(field, row, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

      case 'Anexo':
        return (
          <div style={{ marginBottom: 6 }}>
            <input
              type="file"
              onChange={e => handleFileChange(fieldId, e.target.files)}
              disabled={disabled}
              multiple
              style={{
                background: theme.inputBgColor,
                color: theme.inputFontColor,
                borderRadius: theme.borderRadius,
                border: `1px solid ${theme.tableBorderColor}`,
                padding: '8px 12px',
                marginBottom: 4,
                 minHeight: 36,       // 👈 toque confortável
                 fontSize: 16         // 👈 evita zoom no iOS
              }}
            />
            {Array.isArray(responses[fieldId]) &&
              responses[fieldId].map((file: any, i: number) => (
                <div key={i} style={{ fontSize: 14 }}>
                  <span>{file.name}</span>
                  <button
                    style={{
                      marginLeft: 6,
                      color: theme.accentColor,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                    onClick={() => removeFile(fieldId, i)}
                    type="button"
                  >
                    Remover
                  </button>
                </div>
              ))}
          </div>
        );
      case 'Assinatura':
        return (
          <div style={{ marginBottom: 12 }}>
            <canvas
              ref={el => {
                signaturePads.current[fieldId] = el;
              }}
              data-field-id={fieldId}
              width={600}
              height={180}
              style={{
                width: '100%',
                border: `2px dashed ${theme.accentColor}`,
                background: theme.inputBgColor,
                borderRadius: theme.borderRadius,
                marginBottom: 6
              }}
            ></canvas>
            <button
              onClick={() => clearSignature(fieldId)}
              type="button"
              style={{
                background: theme.buttonBg,
                color: theme.buttonFont,
                border: 'none',
                borderRadius: theme.borderRadius,
                padding: '4px 14px',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <Eraser size={15} /> Limpar
            </button>
          </div>
        );
      case 'Caixa de Seleção':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
            {field.options?.map((opt: string) => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: theme.inputFontColor }}>
                <input
                  type="checkbox"
                  checked={(responses[fieldId] || []).includes(opt)}
                  onChange={e => {
                    const current = responses[fieldId] || [];
                    handleInputChange(
                      fieldId,
                      e.target.checked
                        ? [...current, opt]
                        : current.filter((v: string) => v !== opt)
                    );
                  }}
                  disabled={disabled}
                  style={controlBase}
                />
                <span>{opt}</span>
              </label>
            ))}
            {field.allowOther && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: theme.inputFontColor }}>
                  <input
                    type="checkbox"
                    checked={(responses[fieldId] || []).includes(otherVal)}
                    onChange={e => {
                      const current = responses[fieldId] || [];
                      handleInputChange(
                        fieldId,
                        e.target.checked
                          ? [...current, otherVal]
                          : current.filter((v: string) => v !== otherVal)
                      );
                    }}
                    disabled={disabled}
                    style={{
                      accentColor: theme.accentColor
                    }}
                  />
                  <span>Outros</span>
                </label>
                {(responses[fieldId] || []).includes(otherVal) && (
                  <input
                    value={otherInputValues[fieldId] || ''}
                    onChange={e => handleOtherInputChange(fieldId, e.target.value)}
                    placeholder="Por favor, especifique"
                    disabled={disabled}
                    style={controlBase}
                  />
                )}
              </>
            )}
          </div>
        );
      case 'Múltipla Escolha':
        if (field.displayAs === 'dropdown') {
          return (
            <select
              value={responses[fieldId] || ''}
              onChange={e => handleInputChange(fieldId, e.target.value)}
              disabled={disabled}
              style={controlBase}
            >
              <option value="">Selecione</option>
              {field.options?.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              {field.allowOther && <option value="___OTHER___">Outros</option>}
            </select>
          );
        }
        // Versão radio
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
            {field.options?.map((opt: string) => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: theme.inputFontColor }}>
                <input
                  type="radio"
                  name={`field_${field.id}`}
                  checked={responses[fieldId] === opt}
                  onChange={() => handleInputChange(fieldId, opt)}
                  disabled={disabled}
                  style={{
                    accentColor: theme.accentColor
                  }}
                />
                <span>{opt}</span>
              </label>
            ))}
            {field.allowOther && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: theme.inputFontColor }}>
                  <input
                    type="radio"
                    name={`field_${field.id}`}
                    checked={responses[fieldId] === '___OTHER___'}
                    onChange={() => handleInputChange(fieldId, '___OTHER___')}
                    disabled={disabled}
                    style={{
                      accentColor: theme.accentColor
                    }}
                  />
                  <span>Outros</span>
                </label>
                {responses[fieldId] === '___OTHER___' && (
                  <input
                    value={otherInputValues[fieldId] || ''}
                    onChange={e => handleOtherInputChange(fieldId, e.target.value)}
                    placeholder="Por favor, especifique"
                    disabled={disabled}
                    style={{
                      background: theme.inputBgColor,
                      color: theme.inputFontColor,
                      border: `1.5px solid ${theme.accentColor}`,
                      borderRadius: theme.borderRadius,
                      padding: '8px 12px',
                      fontSize: 16,
                      marginTop: 3,
                    }}
                  />
                )}
              </>
            )}
          </div>
        );
      case 'Texto':
        return (
          <textarea
            value={responses[fieldId] || ''}
            onChange={e => handleInputChange(fieldId, e.target.value)}
            disabled={disabled}
            style={controlBase}
          />
        );
      case 'Data':
        return (
          <input
            type="date"
            value={responses[fieldId] || ''}
            onChange={e => handleInputChange(fieldId, e.target.value)}
            disabled={disabled}
            style={{...controlBase}}
          />
        );
      default:
        return (
          <input
            value={responses[fieldId] || ''}
            onChange={e => handleInputChange(fieldId, e.target.value)}
            placeholder={field.placeholder || ''}
            disabled={disabled}
              style={controlBase}

          />
        );
    }
  };

const controlBase = {
  background: theme.inputBgColor,
  color: autoInputText,            // << aqui
  caretColor: autoInputText,       // << facilita enxergar o cursor
  border: `1.5px solid ${theme.accentColor}`,
  borderRadius: theme.borderRadius,
  padding: '10px 12px',
  fontSize: 16,
  minHeight: 42,
} as const;




  // --------------- RENDER ---------------

  return (


    
    <div
  style={{
    background: theme.bgColor + 'E5',
    color: theme.fontColor,
    position: 'fixed',
    zIndex: 222,
    inset: 0,
    width: '100vw',
    height: '100dvh',                   // <— usa a altura dinâmica do viewport (mobile)
    paddingLeft: 'max(8px, env(safe-area-inset-left))',
    paddingRight: 'max(8px, env(safe-area-inset-right))',
    paddingTop: 'max(8px, env(safe-area-inset-top))',
    paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
>

       <div
  style={{
    background: theme.bgColor,
    color: theme.fontColor,
    borderRadius: theme.borderRadius,
    boxShadow: `0 10px 48px #000a`,
    border: `2.5px solid ${theme.accentColor}`,

    // largura fluida com gutters automáticos
    width: 'min(100%, 1100px)',
    maxWidth: '96vw',
    minWidth: 'min(360px, 96vw)',

    // controla altura total do cartão e delega o scroll ao corpo
    maxHeight: '92dvh',
    overflow: 'hidden',

    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
  }}
>


        {/* HEADER */}
      <div
  style={{
    background: theme.accentColor,
    color: '#fff',
    borderTopLeftRadius: theme.borderRadius,
    borderTopRightRadius: theme.borderRadius,
    padding: 'clamp(12px, 2.6vw, 22px)',        // <— responsivo
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }}
>
  <h3 style={{ fontSize: 'clamp(16px, 2.2vw, 24px)', fontWeight: 700, margin: 0 }}>
    {form.title}
  </h3>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: "#fff",
            fontSize: 22,
            cursor: 'pointer'
          }}>
            <X />
          </button>
        </div>

        {/* LOGO */}
        {form.logo?.url && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent:
                form.logo.align === 'left'
                  ? 'flex-start'
                  : form.logo.align === 'right'
                    ? 'flex-end'
                    : 'center',
              margin: '16px 0 2px 0'
            }}
          >
            <img
              src={form.logo.url}
              alt={form.logo.name || 'Logo'}
              style={{
                width: form.logo.size ? `${form.logo.size}%` : '38%',
                maxWidth: 240,
                objectFit: 'contain'
              }}
            />
          </div>
        )}

        {/* DESCRIPTION */}
        {form.description && (
          <div style={{ color: theme.fontColor, margin: '0 0 18px 0', fontSize: 16, fontWeight: 400, padding: '0 24px', textAlign: 'center' }}>
            {form.description}
          </div>
        )}

        {/* FIELDS */}
       <div
  style={{
    padding: '0 clamp(12px, 3vw, 28px) clamp(12px, 2vw, 18px)',
    overflowY: 'auto',
    flex: '1 1 auto',
    marginBottom: 0,
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    scrollbarGutter: 'stable',
  }}
>
{(form.fields as EnhancedFormField[]).map((field, idx) => (
  <div
    key={field.id}
    ref={(el) => {                      
      fieldRefs.current[String(field.id)] = el;
    }}
    style={{ marginBottom: 18 }}
  >
              {field.type !== 'Cabeçalho' && (
                <label
                  style={{
                    color: theme.fontColor,
                    fontWeight: 500,
                    fontSize: 16,
                    display: 'block',
                    marginBottom: 7,
                  }}
                >
                  {field.label}
                  {field.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
                </label>
              )}
              {/* Render dinâmico fiel ao preview */}
              {renderField(field, idx)}
              {invalid[String(field.id)] && (
  <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
    {invalid[String(field.id)]}
  </div>
)}
              {field.description && (
                <div style={{ color: theme.sectionHeaderFont, fontSize: 13, marginTop: 3 }}>
                  {field.description}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* FOOTER */}
       <div
  style={{
    background: theme.footerBg,
    color: theme.footerFont,
    borderBottomLeftRadius: theme.borderRadius,
    borderBottomRightRadius: theme.borderRadius,
    padding: 'clamp(12px, 2.6vw, 24px)',
    marginTop: 'auto'
  }}
>

          {error && <div style={{ color: "#ef4444", fontWeight: 600, fontSize: 16, marginBottom: 5 }}>{error}</div>}
          {canEdit || !existingResponse ? (
            <button
              onClick={handleSubmit}
              style={{
                background: theme.accentColor,
                color: "#fff",
                borderRadius: theme.borderRadius,
                boxShadow: `0 2px 8px ${theme.accentColor}33`,
                border: 'none',
                padding: '10px 25px',
                fontSize: 17,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              disabled={isSubmitting}
            >
              <Send size={19} />
              <span>
                {isSubmitting
                  ? 'A Enviar...'
                  : existingResponse
                    ? 'Atualizar Resposta'
                    : 'Submeter Resposta'}
              </span>
            </button>
          ) : null}
        </div>
      </div>
        {/* TOAST (CENTRO DA TELA) */}
{/* TOAST (CENTRO + ANIMAÇÕES) */}
{toast.visible && (
  <>
    <style>{`
      @keyframes toast-pop-in {
        0%   { transform: translate(-50%, -50%) scale(.92); opacity: 0; filter: blur(2px); }
        60%  { transform: translate(-50%, -50%) scale(1.02); opacity: 1; filter: blur(0); }
        100% { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
      }
      @keyframes toast-progress {
        from { width: 100%; }
        to   { width: 0%; }
      }
      @keyframes toast-glow {
        0%,100% { box-shadow: 0 18px 50px #0007, 0 0 0px rgba(255,255,255,0); }
        50%     { box-shadow: 0 18px 50px #0007, 0 0 16px rgba(255,255,255,.25); }
      }
      @keyframes toast-backdrop-in {
        from { opacity: 0; }
        to   { opacity: .15; }
      }
      @keyframes toast-shake {
        0%,100%{ transform: translate(-50%, -50%) }
        20%{    transform: translate(calc(-50% - 5px), -50%) }
        40%{    transform: translate(calc(-50% + 5px), -50%) }
        60%{    transform: translate(calc(-50% - 4px), -50%) }
        80%{    transform: translate(calc(-50% + 4px), -50%) }
      }
    `}</style>

    {/* backdrop */}
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        opacity: 0.15,
        animation: 'toast-backdrop-in 160ms ease-out',
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    />

    {/* wrapper do toast */}
    <div role="status" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: toast.type === 'success' ? '#16a34a' : '#b91c1c',
          color: '#fff',
          border: `2px solid ${toast.type === 'success' ? '#22c55e' : '#ef4444'}`,
          borderRadius: 14,
          padding: '12px 16px',
          minWidth: 280,
          maxWidth: 'min(92vw, 560px)',
          pointerEvents: 'auto',
          animation: `
            ${toast.type === 'error' ? 'toast-shake 440ms ease-in-out' : 'toast-pop-in 220ms ease-out'}
          `,
          // brilho pulsante contínuo
          boxShadow: '0 18px 50px #0007',
          animationDelay: '0s, 0s',
          // pulso separado para não interferir no pop/shake
          // (aplicado via style below porque precisa compor animações)
        }}
      >
        {/* ícone */}
        {toast.type === 'success'
          ? <CheckCircle2 size={22} />
          : <AlertTriangle size={22} />}

        {/* mensagem */}
        <div style={{ fontWeight: 600, lineHeight: 1.25, flex: 1 }}>{toast.message}</div>

        {/* fechar */}
        <button
          onClick={() => setToast(t => ({ ...t, visible: false }))}
          aria-label="Fechar"
          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.9 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* barra de progresso */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 'calc(50% + 38px)',
          transform: 'translateX(-50%)',
          width: 'min(92vw, 560px)',
          height: 3,
          background: '#ffffff66',
          borderRadius: 999,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            background: '#fff',
            animation: `toast-progress ${toast.duration}ms linear forwards, toast-glow 1600ms ease-in-out infinite`,
          }}
        />
      </div>
    </div>
  </>
)}


    </div>
  );
}