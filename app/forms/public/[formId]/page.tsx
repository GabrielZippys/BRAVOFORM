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
  logoUrl?: string | null;
  logoSize?: number;
  logoAlignment?: string;
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
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Cores do tema
  const theme = {
    bgColor: form?.theme?.bgColor || "#ffffff",
    accentColor: form?.theme?.accentColor || "#3b82f6",
    titleColor: form?.theme?.titleColor || form?.theme?.accentColor || "#1f2937",
    descriptionColor: form?.theme?.descriptionColor || form?.theme?.fontColor || "#6b7280",
    fontColor: form?.theme?.fontColor || "#1f2937",
    inputBgColor: form?.theme?.inputBgColor || "#f3f4f6",
    inputFontColor: form?.theme?.inputFontColor || "#1f2937",
    sectionHeaderBg: form?.theme?.sectionHeaderBg || "#f1f5f9",
    sectionHeaderFont: form?.theme?.sectionHeaderFont || "#1f2937",
    buttonBg: form?.theme?.buttonBg || "#3b82f6",
    buttonFont: form?.theme?.buttonFont || "#fff",
    footerBg: form?.theme?.footerBg || "#f8fafc",
    footerFont: form?.theme?.footerFont || "#6b7280",
    borderRadius: form?.theme?.borderRadius ?? 8,
    tableHeaderBg: form?.theme?.tableHeaderBg || "#f1f5f9",
    tableHeaderFont: form?.theme?.tableHeaderFont || "#374151",
    tableBorderColor: form?.theme?.tableBorderColor || "#e5e7eb",
    tableOddRowBg: form?.theme?.tableOddRowBg || "#ffffff",
    tableEvenRowBg: form?.theme?.tableEvenRowBg || "#f9fafb",
    tableCellFont: form?.theme?.tableCellFont || "#374151",
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
        // Aguarda um pouco para a splash ser vista, depois faz fade out
        setTimeout(() => {
          setSplashFading(true);
          setTimeout(() => setShowSplash(false), 600);
        }, 1800);
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
    const black = {r:0,g:0,b:0}, white = {r:255,g:255,b:255};
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

  // Contraste para radio/checkbox - detecta fundo e calcula cor inversa
  const bgLuminance = (() => {
    const c = parseColor(theme.bgColor);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  })();
  const isDarkBg = bgLuminance < 0.5;
  const tickBorderColor = isDarkBg ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)';
  const tickBgUnchecked = isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

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
              {field.options?.map(option => {
                const isChecked = value === option;
                return (
                  <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', padding: '0.25rem 0' }}
                    onClick={() => { if (!disabled) handleInputChange(fieldId, option); }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${isChecked ? theme.accentColor : tickBorderColor}`,
                      background: isChecked ? theme.accentColor : tickBgUnchecked,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}>
                      {isChecked && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                    </span>
                    <span style={{ color: theme.fontColor }}>{option}</span>
                  </label>
                );
              })}
              {field.allowOther && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', padding: '0.25rem 0' }}
                  onClick={() => { if (!disabled) handleInputChange(fieldId, '___OTHER___'); }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${value === '___OTHER___' ? theme.accentColor : tickBorderColor}`,
                    background: value === '___OTHER___' ? theme.accentColor : tickBgUnchecked,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}>
                    {value === '___OTHER___' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </span>
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
              {field.options?.map(option => {
                const isChecked = Array.isArray(value) && value.includes(option);
                return (
                  <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', padding: '0.25rem 0' }}
                    onClick={() => {
                      if (disabled) return;
                      const current = Array.isArray(value) ? value : [];
                      if (isChecked) handleInputChange(fieldId, current.filter(item => item !== option));
                      else handleInputChange(fieldId, [...current, option]);
                    }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${isChecked ? theme.accentColor : tickBorderColor}`,
                      background: isChecked ? theme.accentColor : tickBgUnchecked,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}>
                      {isChecked && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span style={{ color: theme.fontColor }}>{option}</span>
                  </label>
                );
              })}
              {field.allowOther && (() => {
                const isOtherChecked = Array.isArray(value) && value.includes('___OTHER___');
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', padding: '0.25rem 0' }}
                      onClick={() => {
                        if (disabled) return;
                        const current = Array.isArray(value) ? value : [];
                        if (isOtherChecked) handleInputChange(fieldId, current.filter(item => item !== '___OTHER___'));
                        else handleInputChange(fieldId, [...current, '___OTHER___']);
                      }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${isOtherChecked ? theme.accentColor : tickBorderColor}`,
                        background: isOtherChecked ? theme.accentColor : tickBgUnchecked,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}>
                        {isOtherChecked && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      <span style={{ color: theme.fontColor }}>Outro:</span>
                    </label>
                    <input
                      type="text"
                      value={otherInputValues[fieldId] || ''}
                      onChange={(e) => handleOtherInputChange(fieldId, e.target.value)}
                      placeholder="Especifique..."
                      disabled={disabled || !isOtherChecked}
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
                );
              })()}
            </div>
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );

      case 'Tabela':
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: `1.5px solid ${theme.tableBorderColor}`,
                borderRadius: theme.borderRadius,
                fontSize: 16,
                background: theme.bgColor,
                color: theme.tableCellFont,
                overflow: 'hidden',
              }}>
                <colgroup>
                  <col style={{ width: '40%' }} />
                  {(field.columns || []).map((_, i) => (
                    <col key={i} style={{ width: `${Math.floor(60 / (field.columns?.length || 1))}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{
                      background: theme.tableHeaderBg,
                      color: theme.tableHeaderFont,
                      border: `1.5px solid ${theme.tableBorderColor}`,
                      padding: 8, fontWeight: 'bold', fontSize: 16,
                    }} />
                    {field.columns?.map((col: any) => (
                      <th key={col.id} style={{
                        background: theme.tableHeaderBg,
                        color: theme.tableHeaderFont,
                        border: `1.5px solid ${theme.tableBorderColor}`,
                        padding: 8, fontWeight: 600, fontSize: 16,
                      }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {field.rows?.map((row: any, ridx: number) => (
                    <tr key={row.id} style={{
                      background: ridx % 2 === 0 ? theme.tableOddRowBg : theme.tableEvenRowBg,
                      color: theme.tableCellFont,
                    }}>
                      <td style={{
                        fontWeight: 500,
                        border: `1.5px solid ${theme.tableBorderColor}`,
                        background: theme.tableHeaderBg,
                        color: theme.tableHeaderFont,
                        padding: 7,
                      }}>
                        {row.label}
                      </td>
                      {field.columns?.map((col: any) => {
                        const cellValue = responses[fieldId]?.[String(row.id)]?.[String(col.id)] ?? '';
                        const cellBase: React.CSSProperties = {
                          width: '100%',
                          background: theme.inputBgColor,
                          color: autoInputText,
                          caretColor: autoInputText,
                          borderWidth: 1.5, borderStyle: 'solid',
                          borderColor: theme.tableBorderColor,
                          borderRadius: theme.borderRadius,
                          padding: '5px 10px', fontSize: 16,
                        };
                        let cellContent: React.ReactNode;
                        if (col.type === 'select') {
                          cellContent = (
                            <select
                              style={cellBase}
                              value={cellValue}
                              onChange={e => handleTableInputChange(fieldId, String(row.id), String(col.id), e.target.value)}
                              disabled={disabled}
                            >
                              <option value="">Selecionar</option>
                              {col.options?.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          );
                        } else if (col.type === 'date' || col.type === 'Data') {
                          cellContent = (
                            <input
                              style={cellBase}
                              type="datetime-local"
                              value={cellValue}
                              onChange={e => handleTableInputChange(fieldId, String(row.id), String(col.id), e.target.value)}
                              disabled={disabled}
                            />
                          );
                        } else if (col.type === 'number') {
                          cellContent = (
                            <input
                              style={cellBase}
                              type="text"
                              inputMode="decimal"
                              value={cellValue}
                              onChange={e => handleTableInputChange(fieldId, String(row.id), String(col.id), e.target.value)}
                              disabled={disabled}
                              placeholder="0"
                            />
                          );
                        } else {
                          cellContent = (
                            <input
                              style={cellBase}
                              type="text"
                              value={cellValue}
                              onChange={e => handleTableInputChange(fieldId, String(row.id), String(col.id), e.target.value)}
                              disabled={disabled}
                            />
                          );
                        }
                        return (
                          <td key={col.id} style={{
                            border: `1.5px solid ${theme.tableBorderColor}`,
                            padding: 4,
                          }}>
                            {cellContent}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );

      case 'Anexo':
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <input
              type="file"
              onChange={e => handleFileChange(fieldId, e.target.files)}
              disabled={disabled}
              multiple
              style={{
                background: theme.inputBgColor,
                color: autoInputText,
                borderRadius: theme.borderRadius,
                border: `1.5px solid ${borderColor}`,
                padding: '8px 12px',
                marginBottom: 4,
                minHeight: 36, fontSize: 16,
              }}
            />
            {Array.isArray(responses[fieldId]) && responses[fieldId].map((file: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 14, color: theme.fontColor, marginTop: 4 }}>
                {file.preview && (
                  <img src={file.preview} alt={file.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                )}
                <span>{file.name}</span>
                <button
                  onClick={() => removeFile(fieldId, i)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                >✕</button>
              </div>
            ))}
            {invalid[fieldId] && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {invalid[fieldId]}
              </p>
            )}
          </div>
        );

      case 'Assinatura':
        return (
          <div key={field.id} ref={(el) => { fieldRefs.current[fieldId] = el; }} style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.fontColor, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <div style={{
              border: `2px solid ${borderColor}`,
              borderRadius: theme.borderRadius,
              background: '#fff',
              padding: 4,
              position: 'relative',
            }}>
              <canvas
                ref={(el) => {
                  if (el) setSignaturePads(prev => ({ ...prev, [fieldId]: el }));
                }}
                width={600} height={150}
                style={{ width: '100%', height: 150, cursor: 'crosshair', touchAction: 'none' }}
                onMouseDown={(e) => {
                  const canvas = signaturePads[fieldId];
                  if (!canvas) return;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return;
                  const rect = canvas.getBoundingClientRect();
                  ctx.beginPath();
                  ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                  const onMove = (ev: MouseEvent) => {
                    ctx.lineTo(ev.clientX - rect.left, ev.clientY - rect.top);
                    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
                  };
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    handleInputChange(fieldId, canvas.toDataURL());
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              />
              <button
                onClick={() => clearSignature(fieldId)}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(0,0,0,0.1)', border: 'none',
                  borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                  fontSize: 12, color: '#666',
                }}
              >Limpar</button>
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

  // Fundo externo da página (diferente do card)
  const pageBg = isDarkBg
    ? `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)`
    : `linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #f8fafc 100%)`;

  // ── Splash screen ──────────────────────────────────────────
  const SplashScreen = () => (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #060d1f 0%, #0d1a35 50%, #080e20 100%)',
      opacity: splashFading ? 0 : 1,
      transition: 'opacity 0.7s cubic-bezier(0.4,0,0.2,1)',
      pointerEvents: splashFading ? 'none' : 'all',
      overflow: 'hidden',
    }}>
      {/* Partículas de fundo */}
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: i % 2 === 0 ? 3 : 2,
          height: i % 2 === 0 ? 3 : 2,
          borderRadius: '50%',
          background: i % 3 === 0 ? '#38bdf8' : i % 3 === 1 ? '#818cf8' : '#34d399',
          opacity: 0.4,
          left: `${10 + i * 15}%`,
          top: `${20 + (i * 11) % 60}%`,
          animation: `splashFloat ${2.5 + i * 0.4}s ease-in-out ${i * 0.3}s infinite alternate`,
        }} />
      ))}

      {/* Anéis girando */}
      <div style={{
        position: 'absolute',
        width: 380, height: 380, borderRadius: '50%',
        border: '1.5px solid rgba(56,189,248,0.13)',
        animation: 'splashSpin 10s linear infinite',
      }} />
      <div style={{
        position: 'absolute',
        width: 300, height: 300, borderRadius: '50%',
        border: '1px solid rgba(129,140,248,0.1)',
        animation: 'splashSpin 7s linear infinite reverse',
      }} />
      <div style={{
        position: 'absolute',
        width: 220, height: 220, borderRadius: '50%',
        border: '1px dashed rgba(52,211,153,0.08)',
        animation: 'splashSpin 5s linear infinite',
      }} />

      {/* Glow central */}
      <div style={{
        position: 'absolute', width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(56,189,248,0.1) 0%, rgba(129,140,248,0.05) 40%, transparent 70%)',
        animation: 'splashPulse 2.5s ease-in-out infinite',
      }} />

      {/* Shield logo */}
      <div style={{
        position: 'relative', marginBottom: 32, zIndex: 1,
        animation: 'splashDrop 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards',
      }}>
        <div style={{
          position: 'absolute', inset: -32, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)',
          animation: 'splashPulse 2s ease-in-out 0.3s infinite',
        }} />
        <img
          src="/bravoform-br-shield-256.png"
          alt="BravoForm"
          style={{
            width: 160, height: 160,
            filter: 'drop-shadow(0 0 32px rgba(56,189,248,0.7)) drop-shadow(0 0 60px rgba(56,189,248,0.25))',
            position: 'relative', zIndex: 1,
          }}
        />
      </div>

      {/* Nome BravoForm */}
      <div style={{
        zIndex: 1, animation: 'splashFadeUp 0.5s ease 0.5s both',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        marginBottom: 52,
      }}>
        <img
          src="/formbravo-logo.png"
          alt="BravoForm"
          style={{ height: 44, filter: 'brightness(0) invert(1)', opacity: 0.95 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ height: 1, width: 36, background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.5))' }} />
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            Form Platform
          </span>
          <div style={{ height: 1, width: 36, background: 'linear-gradient(90deg, rgba(56,189,248,0.5), transparent)' }} />
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ zIndex: 1, width: 240, animation: 'splashFadeUp 0.4s ease 0.7s both' }}>
        <div style={{
          height: 4, borderRadius: 99,
          background: 'rgba(255,255,255,0.07)',
          overflow: 'hidden', marginBottom: 12,
        }}>
          <div style={{
            height: '100%', borderRadius: 99,
            background: 'linear-gradient(90deg, #38bdf8, #818cf8, #34d399)',
            animation: 'splashBar 1.8s cubic-bezier(0.25,0.46,0.45,0.94) 0.4s forwards',
            width: '0%',
          }} />
        </div>
        <p style={{
          textAlign: 'center', fontSize: 11,
          color: 'rgba(148,163,184,0.5)',
          letterSpacing: '0.12em', margin: 0,
          animation: 'splashBlink 1.2s ease-in-out 0.8s infinite alternate',
        }}>
          Carregando seu formulário...
        </p>
      </div>
    </div>
  );

  const StateWrapper = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: pageBg,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      gap: '1.5rem',
    }}>
      {children}
      <p style={{ color: isDarkBg ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)', fontSize: '0.75rem', marginTop: '2rem' }}>
        Powered by BravoForm
      </p>
    </div>
  );

  if (loading) {
    return <SplashScreen />;
  }

  if (error) {
    return (
      <StateWrapper>
        <div style={{
          background: isDarkBg ? 'rgba(255,255,255,0.06)' : '#fff',
          borderRadius: 16,
          padding: '3rem 4rem',
          boxShadow: isDarkBg ? '0 8px 40px rgba(0,0,0,0.5)' : '0 8px 40px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          maxWidth: 480,
          textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(239,68,68,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={32} color="#ef4444" />
          </div>
          <h2 style={{ margin: 0, color: isDarkBg ? '#fff' : '#1e293b', fontSize: '1.25rem' }}>
            Erro ao Carregar Formulário
          </h2>
          <p style={{ margin: 0, color: isDarkBg ? 'rgba(255,255,255,0.6)' : '#64748b' }}>{error}</p>
        </div>
      </StateWrapper>
    );
  }

  if (showSuccess) {
    return (
      <StateWrapper>
        <div style={{
          background: isDarkBg ? 'rgba(255,255,255,0.06)' : '#fff',
          borderRadius: 16,
          padding: '3rem 4rem',
          boxShadow: isDarkBg ? '0 8px 40px rgba(0,0,0,0.5)' : '0 8px 40px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          maxWidth: 480,
          textAlign: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={36} color="#22c55e" />
          </div>
          <h2 style={{ margin: 0, color: isDarkBg ? '#fff' : '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>
            Resposta Enviada!
          </h2>
          <p style={{ margin: 0, color: isDarkBg ? 'rgba(255,255,255,0.6)' : '#64748b', fontSize: '0.95rem' }}>
            Sua resposta foi registrada com sucesso. Obrigado!
          </p>
        </div>
      </StateWrapper>
    );
  }

  if (!form) {
    return (
      <StateWrapper>
        <div style={{
          background: isDarkBg ? 'rgba(255,255,255,0.06)' : '#fff',
          borderRadius: 16,
          padding: '3rem 4rem',
          boxShadow: isDarkBg ? '0 8px 40px rgba(0,0,0,0.5)' : '0 8px 40px rgba(0,0,0,0.12)',
          textAlign: 'center',
        }}>
          <p style={{ color: isDarkBg ? 'rgba(255,255,255,0.6)' : '#64748b', margin: 0 }}>
            Formulário não encontrado
          </p>
        </div>
      </StateWrapper>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: pageBg,
      color: theme.fontColor,
      padding: '2.5rem 1rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {showSplash && <SplashScreen />}
      <div style={{
        maxWidth: '820px',
        margin: '0 auto',
      }}>
        {/* Card principal */}
        <div style={{
          background: theme.bgColor,
          borderRadius: Math.max(theme.borderRadius as number, 12),
          boxShadow: isDarkBg ? '0 8px 48px rgba(0,0,0,0.55)' : '0 8px 48px rgba(0,0,0,0.13)',
          border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'}`,
          overflow: 'hidden',
        }}>
          {/* Header com logo e título */}
          <header style={{
            padding: '2.5rem 2.5rem 2rem',
            borderBottom: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`,
            textAlign: (form.logoAlignment === 'Direita' || form.logoAlignment === 'right') ? 'right' : (form.logoAlignment === 'Esquerda' || form.logoAlignment === 'left') ? 'left' : 'center',
          }}>
            {form.logoUrl && (
              <div style={{ marginBottom: '1.25rem' }}>
                <img
                  src={form.logoUrl}
                  alt="Logo"
                  style={{
                    maxWidth: `${form.logoSize || 40}%`,
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}
            <h1 style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
              color: theme.titleColor,
              lineHeight: 1.2,
            }}>
              {form.title}
            </h1>
            {form.description && (
              <p style={{ color: theme.descriptionColor, margin: 0, fontSize: '0.95rem' }}>
                {form.description}
              </p>
            )}
          </header>

          {/* Campos do formulário */}
          <div style={{ padding: '2rem 2.5rem' }}>
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
              {form.fields.map(renderField)}

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '0.8rem 2.5rem',
                    background: theme.buttonBg,
                    color: theme.buttonFont,
                    border: 'none',
                    borderRadius: theme.borderRadius,
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: isSubmitting ? 'none' : `0 4px 14px ${withAlpha(theme.buttonBg, 0.4)}`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <div style={{ width: '16px', height: '16px', border: '2px solid currentColor', borderTop: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
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
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingBottom: '1rem' }}>
          <p style={{ color: isDarkBg ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)', fontSize: '0.75rem', margin: 0 }}>
            Powered by BravoForm
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes splashDrop {
          from { opacity: 0; transform: translateY(-30px) scale(0.8); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes splashFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes splashPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.15); opacity: 1; }
        }
        @keyframes splashRing {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes splashFloat {
          from { transform: translateY(0px) translateX(0px); }
          to   { transform: translateY(-18px) translateX(8px); }
        }
        @keyframes splashSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes splashBlink {
          from { opacity: 0.4; }
          to   { opacity: 0.8; }
        }
        input::placeholder, textarea::placeholder {
          color: ${autoPlaceholder} !important;
          opacity: 1;
        }
        input[type="date"], input[type="datetime-local"] {
          color-scheme: ${isDarkBg ? 'dark' : 'light'};
        }
        select {
          color-scheme: ${isDarkBg ? 'dark' : 'light'};
        }
      `}</style>
    </div>
  );
}
