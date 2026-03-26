'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { X, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import OrderGridFieldResponse from '@/components/OrderGridFieldResponse';

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

interface FormData {
  id: string;
  title: string;
  description?: string;
  fields: EnhancedFormField[];
  theme?: {
    bgColor?: string;
    accentColor?: string;
    fontColor?: string;
    inputBgColor?: string;
    inputFontColor?: string;
    sectionHeaderBg?: string;
    sectionHeaderFont?: string;
    buttonBg?: string;
    buttonFont?: string;
    footerBg?: string;
    footerFont?: string;
    borderRadius?: number;
    tableHeaderBg?: string;
    tableHeaderFont?: string;
    tableBorderColor?: string;
    tableOddRowBg?: string;
    tableEvenRowBg?: string;
    tableCellFont?: string;
    borderColor?: string;
  };
}

export default function PublicFormPage() {
  const params = useParams();
  const formId = params.formId as string;
  
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [otherInputValues, setOtherInputValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [signaturePads, setSignaturePads] = useState<Record<string, HTMLCanvasElement | null>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Cores do tema
  const theme = {
    bgColor: form?.theme?.bgColor || "#ffffff",
    accentColor: form?.theme?.accentColor || "#3b82f6",
    fontColor: form?.theme?.fontColor || "#1f2937",
    inputBgColor: form?.theme?.inputBgColor || "#171e2c",
    inputFontColor: form?.theme?.inputFontColor || "#e8f2ff",
    sectionHeaderBg: form?.theme?.sectionHeaderBg || "#19263b",
    sectionHeaderFont: form?.theme?.sectionHeaderFont || "#49cfff",
    buttonBg: form?.theme?.buttonBg || "#000",
    buttonFont: form?.theme?.buttonFont || "#fff",
    footerBg: form?.theme?.footerBg || "#182138",
    footerFont: form?.theme?.footerFont || "#fff",
    borderRadius: form?.theme?.borderRadius ?? 8,
    tableHeaderBg: form?.theme?.tableHeaderBg || "#1a2238",
    tableHeaderFont: form?.theme?.tableHeaderFont || "#49cfff",
    tableBorderColor: form?.theme?.tableBorderColor || "#19263b",
    tableOddRowBg: form?.theme?.tableOddRowBg || "#222c42",
    tableEvenRowBg: form?.theme?.tableEvenRowBg || "#171e2c",
    tableCellFont: form?.theme?.tableCellFont || "#e0e6f7",
    borderColor: form?.theme?.borderColor || "#e5e7eb"
  };

  // Carregar formulário
  useEffect(() => {
    if (!formId) return;
    
    const loadForm = async () => {
      try {
        const response = await fetch(`/api/forms/public/${formId}`);
        const result = await response.json();
        
        if (result.success) {
          setForm(result.data);
        } else {
          setError(result.error || 'Erro ao carregar formulário');
        }
      } catch (err) {
        setError('Erro ao carregar formulário');
      } finally {
        setLoading(false);
      }
    };

    loadForm();
  }, [formId]);

  // Utils de cor/contraste
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
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0,2),16);
        const g = parseInt(hex.slice(2,4),16);
        const b = parseInt(hex.slice(4,6),16);
        return { r, g, b, a: 1 };
      }
    }
    return { r: 0, g: 0, b: 0, a: 1 };
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

  function pickReadableTextColor(bgCss:string, preferredCss:string, min=4.5){
    const bg = parseColor(bgCss);
    const preferred = parseColor(preferredCss);
    const black = {r:0,g:0,b:0}, white = {r:255,g:255,g:255};
    const bgNoAlpha = {r:bg.r,g:bg.g,b:bg.b};
    const cPref = Math.abs((preferred.r + preferred.g + preferred.b) / 3 - (bgNoAlpha.r + bgNoAlpha.g + bgNoAlpha.b) / 3);
    if (cPref >= min * 50) return rgbToHex({r:preferred.r,g:preferred.g,b:preferred.b});
    const cBlack = Math.abs((0 + 0 + 0) / 3 - (bgNoAlpha.r + bgNoAlpha.g + bgNoAlpha.b) / 3);
    const cWhite = Math.abs((255 + 255 + 255) / 3 - (bgNoAlpha.r + bgNoAlpha.g + bgNoAlpha.b) / 3);
    return cBlack >= cWhite ? '#111111' : '#ffffff';
  }

  function withAlpha(hex:string, alpha=0.6){
    const {r,g,b} = parseColor(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  const resolvedInputBgRGB = blendOver(theme.inputBgColor, theme.bgColor);
  const resolvedInputBg = rgbToHex(resolvedInputBgRGB);
  const autoInputText = pickReadableTextColor(resolvedInputBg, theme.inputFontColor);
  const autoPlaceholder = withAlpha(autoInputText, 0.6);
  const borderColor = theme.borderColor || "#e5e7eb";

  // Validação
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

      case 'Grade de Pedidos': {
        const arr = Array.isArray(val) ? val : [];
        return arr.length === 0 ? 'Preencha a grade de pedidos' : '';
      }

      default:
        return isBlank(val) ? 'Campo obrigatório' : '';
    }
  }

  const invalidize = (fieldId: string): React.CSSProperties =>
    invalid[fieldId]
      ? { borderColor: '#ef4444', boxShadow: '0 0 0 2px rgba(239,68,68,.25)' }
      : {};

  // Handlers
  const handleInputChange = (fieldId: string, value: any) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
    
    const field = form?.fields.find(f => String(f.id) === fieldId);
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
    
    const field = form?.fields.find(f => String(f.id) === fieldId);
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
    
    const field = form?.fields.find(f => String(f.id) === fieldId);
    if (field?.required) {
      const err = validateRequiredField(field);
      setInvalid(prev => {
        const copy = { ...prev };
        if (err) copy[fieldId] = err; else delete copy[fieldId];
        return copy;
      });
    }
  };

  const handleFileChange = async (fieldId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const items = await Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<any>((resolve) => {
            if (file.type?.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({ name: file.name, size: file.size, type: file.type, file, preview: reader.result as string });
              reader.onerror = () => resolve({ name: file.name, size: file.size, type: file.type, file });
              reader.readAsDataURL(file);
            } else {
              resolve({ name: file.name, size: file.size, type: file.type, file });
            }
          })
      )
    );

    handleInputChange(fieldId, [ ...(responses[fieldId] || []), ...items ]);
  };

  const removeFile = (fieldId: string, index: number) => {
    const files = responses[fieldId] || [];
    handleInputChange(fieldId, files.filter((_: any, idx: number) => idx !== index));
  };

  const clearSignature = (fieldId: string) => {
    const canvas = signaturePads[fieldId];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      handleInputChange(fieldId, '');
    }
  };

  // Submit
  const handleSubmit = async () => {
    if (!form) return;
    
    setIsSubmitting(true);
    setTriedSubmit(true);

    // Validação
    const newInvalid: Record<string, string> = {};
    form.fields.forEach(field => {
      const err = validateRequiredField(field);
      if (err) newInvalid[String(field.id)] = err;
    });

    if (Object.keys(newInvalid).length > 0) {
      setInvalid(newInvalid);
      const firstId = Object.keys(newInvalid)[0];
      fieldRefs.current[firstId]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      setIsSubmitting(false);
      return;
    }

    setInvalid({});
    setError('');

    try {
      // Normalizar respostas
      const normalized: Record<string, any> = { ...responses };

      form.fields.forEach(field => {
        const fid = String(field.id);

        // "Outros"
        if ((field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') && field.allowOther) {
          let v = normalized[fid];
          const otherVal = (otherInputValues[fid] || '').trim();
          if (Array.isArray(v)) {
            v = v.map((opt: string) => (opt === '___OTHER___' ? otherVal : opt)).filter((x: string) => x !== '');
          } else if (v === '___OTHER___') {
            v = otherVal;
          }
          normalized[fid] = v;
        }
      });

      // Preparar field metadata
      const fieldMetadata: Record<string, any> = {};
      form.fields.forEach(field => {
        fieldMetadata[String(field.id)] = {
          label: field.label,
          type: field.type,
          ...(field.type === 'Tabela' && {
            rows: field.rows?.map((r: any) => ({ id: r.id, label: r.label })),
            columns: field.columns?.map((c: any) => ({ id: c.id, label: c.label, type: c.type }))
          })
        };
      });

      // Enviar resposta
      const response = await fetch(`/api/forms/public/${formId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answers: normalized,
          fieldMetadata,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setShowSuccess(true);
      } else {
        setError(result.error || 'Erro ao enviar resposta');
      }
    } catch (err) {
      setError('Erro ao enviar resposta');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render de campos
  const renderField = (field: EnhancedFormField) => {
    const fieldId = String(field.id);
    const value = responses[fieldId] || '';
    const disabled = isSubmitting;

    switch (field.type) {
      case 'Cabeçalho':
        return (
          <div key={field.id} style={{ marginBottom: '1.5rem' }}>
            <h3 style={{
              color: theme.sectionHeaderFont,
              background: theme.sectionHeaderBg,
              padding: '0.75rem',
              borderRadius: theme.borderRadius,
              marginBottom: '0.5rem'
            }}>
              {field.label}
            </h3>
            {field.description && (
              <p style={{ color: theme.fontColor, opacity: 0.8, fontSize: '0.9rem' }}>
                {field.description}
              </p>
            )}
          </div>
        );

      case 'Texto':
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder || ''}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `2px solid ${borderColor}`,
                borderRadius: theme.borderRadius,
                background: theme.inputBgColor,
                color: autoInputText,
                ...invalidize(fieldId)
              }}
            />
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );

      case 'Data':
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <input
              type="date"
              value={value}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              disabled={disabled}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `2px solid ${borderColor}`,
                borderRadius: theme.borderRadius,
                background: theme.inputBgColor,
                color: autoInputText,
                ...invalidize(fieldId)
              }}
            />
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );

      case 'Múltipla Escolha':
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {field.options?.map(option => (
                <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={fieldId}
                    value={option}
                    checked={value === option}
                    onChange={(e) => handleInputChange(fieldId, e.target.value)}
                    disabled={disabled}
                    style={{ accentColor: theme.accentColor }}
                  />
                  <span style={{ color: theme.fontColor }}>{option}</span>
                </label>
              ))}
              {field.allowOther && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={fieldId}
                    value="___OTHER___"
                    checked={value === '___OTHER___'}
                    onChange={(e) => handleInputChange(fieldId, e.target.value)}
                    disabled={disabled}
                    style={{ accentColor: theme.accentColor }}
                  />
                  <span style={{ color: theme.fontColor }}>Outro:</span>
                  <input
                    type="text"
                    value={otherInputValues[fieldId] || ''}
                    onChange={(e) => handleOtherInputChange(fieldId, e.target.value)}
                    placeholder="Especifique..."
                    disabled={disabled || value !== '___OTHER___'}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: `1px solid ${borderColor}`,
                      borderRadius: theme.borderRadius,
                      background: theme.inputBgColor,
                      color: autoInputText
                    }}
                  />
                </label>
              )}
            </div>
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );

      case 'Caixa de Seleção':
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {field.options?.map(option => (
                <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    value={option}
                    checked={Array.isArray(value) && value.includes(option)}
                    onChange={(e) => {
                      const current = Array.isArray(value) ? value : [];
                      if (e.target.checked) {
                        handleInputChange(fieldId, [...current, option]);
                      } else {
                        handleInputChange(fieldId, current.filter(item => item !== option));
                      }
                    }}
                    disabled={disabled}
                    style={{ accentColor: theme.accentColor }}
                  />
                  <span style={{ color: theme.fontColor }}>{option}</span>
                </label>
              ))}
              {field.allowOther && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      value="___OTHER___"
                      checked={Array.isArray(value) && value.includes('___OTHER___')}
                      onChange={(e) => {
                        const current = Array.isArray(value) ? value : [];
                        if (e.target.checked) {
                          handleInputChange(fieldId, [...current, '___OTHER___']);
                        } else {
                          handleInputChange(fieldId, current.filter(item => item !== '___OTHER___'));
                        }
                      }}
                      disabled={disabled}
                      style={{ accentColor: theme.accentColor }}
                    />
                    <span style={{ color: theme.fontColor }}>Outro:</span>
                  </label>
                  <input
                    type="text"
                    value={otherInputValues[fieldId] || ''}
                    onChange={(e) => handleOtherInputChange(fieldId, e.target.value)}
                    placeholder="Especifique..."
                    disabled={disabled || !(Array.isArray(value) && value.includes('___OTHER___'))}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: `1px solid ${borderColor}`,
                      borderRadius: theme.borderRadius,
                      background: theme.inputBgColor,
                      color: autoInputText
                    }}
                  />
                </div>
              )}
            </div>
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );

      default:
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder || ''}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `2px solid ${borderColor}`,
                borderRadius: theme.borderRadius,
                background: theme.inputBgColor,
                color: autoInputText,
                ...invalidize(fieldId)
              }}
            />
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bgColor,
        color: theme.fontColor
      }}>
        <p>Carregando formulário...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bgColor,
        color: theme.fontColor,
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <AlertTriangle size={48} color="#ef4444" />
        <div style={{ textAlign: 'center' }}>
          <h2>Erro ao Carregar Formulário</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bgColor,
        color: theme.fontColor,
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <CheckCircle2 size={48} color="#22c55e" />
        <div style={{ textAlign: 'center' }}>
          <h2>Resposta Enviada com Sucesso!</h2>
          <p>Sua resposta foi registrada e enviada com sucesso.</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bgColor,
        color: theme.fontColor
      }}>
        <p>Formulário não encontrado</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: theme.bgColor,
      color: theme.fontColor,
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: 'white',
        padding: '2rem',
        borderRadius: theme.borderRadius,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: theme.fontColor }}>
            {form.title}
          </h1>
          {form.description && (
            <p style={{ color: theme.fontColor, opacity: 0.8 }}>
              {form.description}
            </p>
          )}
        </header>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          {form.fields.map(renderField)}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '0.75rem 2rem',
                background: theme.buttonBg,
                color: theme.buttonFont,
                border: 'none',
                borderRadius: theme.borderRadius,
                fontSize: '1rem',
                fontWeight: 500,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {isSubmitting ? (
                <>
                  <div style={{ width: '16px', height: '16px', border: '2px solid currentColor', borderTop: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Enviar Resposta
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
