'use client';

/**
 * WorkflowPresetPicker
 *
 * Modal de seleção de preset técnico de workflow.
 * Mostra cada preset como um card detalhado com:
 *   • Nome curto + ícone visual
 *   • Descrição técnica do que o preset faz
 *   • Lista de etapas que serão criadas (em ordem)
 *   • Tags para busca
 *
 * Ao confirmar, retorna o array de WorkflowStage gerado pelo preset.
 */
import React, { useState, useMemo } from 'react';
import { X, Search, Sparkles, ArrowRight } from 'lucide-react';
import {
  WORKFLOW_PRESETS,
  PRESET_CATEGORIES,
  WorkflowPreset,
} from '@/utils/workflowPresets';
import { getStageTypeDefinition } from '@/utils/stageTypes';
import type { WorkflowStage } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (stages: WorkflowStage[]) => void;
  /** Se true, avisa que vai sobrescrever as etapas existentes */
  willOverwrite?: boolean;
}

export default function WorkflowPresetPicker({ isOpen, onClose, onSelect, willOverwrite }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<WorkflowPreset['category'] | 'todos'>('todos');
  const [previewing, setPreviewing] = useState<WorkflowPreset | null>(null);

  const filtered = useMemo(() => {
    let list = WORKFLOW_PRESETS;
    if (activeCategory !== 'todos') {
      list = list.filter(p => p.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.label.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [search, activeCategory]);

  if (!isOpen) return null;

  const handleApply = (preset: WorkflowPreset) => {
    const stages = preset.buildStages();
    onSelect(stages);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 1100,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, #EFF6FF 0%, #F0F9FF 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Sparkles size={22} color="#3B82F6" />
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                Biblioteca de Presets Técnicos
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
                Templates prontos com etapas pré-configuradas. A primeira etapa do preset é sempre a inicial.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, color: '#6B7280' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Aviso de sobrescrita */}
        {willOverwrite && (
          <div style={{
            padding: '0.75rem 1.5rem',
            background: '#FEF3C7',
            borderBottom: '1px solid #FDE68A',
            color: '#92400E',
            fontSize: 13,
            fontWeight: 500,
          }}>
            ⚠️ Aplicar um preset substituirá todas as etapas atuais do canvas.
          </div>
        )}

        {/* Filtros */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, descrição ou tag (ex: aprovação, retirada, sla)"
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                border: '1px solid #D1D5DB',
                borderRadius: 8,
                fontSize: 13,
                color: '#111827',
                background: '#fff',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid',
                  borderColor: activeCategory === cat.id ? '#3B82F6' : '#E5E7EB',
                  background: activeCategory === cat.id ? '#EFF6FF' : '#fff',
                  color: activeCategory === cat.id ? '#1E40AF' : '#374151',
                  fontWeight: activeCategory === cat.id ? 600 : 500,
                  borderRadius: 999,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{cat.icon}</span> {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body — Grid de presets + Preview */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Lista */}
          <div style={{ flex: previewing ? 1.4 : 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#9CA3AF' }}>
                Nenhum preset encontrado.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}>
                {filtered.map((preset) => {
                  const isPreview = previewing?.id === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => setPreviewing(preset)}
                      style={{
                        background: isPreview ? '#EFF6FF' : '#fff',
                        border: `2px solid ${isPreview ? preset.color : '#E5E7EB'}`,
                        borderRadius: 10,
                        padding: '0.875rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => { if (!isPreview) e.currentTarget.style.borderColor = '#9CA3AF'; }}
                      onMouseLeave={(e) => { if (!isPreview) e.currentTarget.style.borderColor = '#E5E7EB'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 22,
                          background: `${preset.color}20`,
                          padding: '6px 8px',
                          borderRadius: 8,
                        }}>{preset.icon}</span>
                        <strong style={{ fontSize: 14, color: '#111827', flex: 1 }}>
                          {preset.label}
                        </strong>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>
                        {preset.description}
                      </p>
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#F3F4F6',
                          color: '#374151',
                        }}>
                          {preset.buildStages().length} etapa{preset.buildStages().length !== 1 ? 's' : ''}
                        </span>
                        {preset.tags.slice(0, 2).map(tag => (
                          <span key={tag} style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: `${preset.color}15`,
                            color: preset.color,
                            fontWeight: 500,
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview lateral */}
          {previewing && (
            <div style={{
              width: 380,
              borderLeft: '1px solid #E5E7EB',
              background: '#F9FAFB',
              padding: '1.25rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 28,
                  background: `${previewing.color}20`,
                  padding: '8px 10px',
                  borderRadius: 10,
                }}>{previewing.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                    {previewing.label}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
                    {previewing.description}
                  </p>
                </div>
              </div>

              <div style={{
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '0.75rem',
                fontSize: 12,
                color: '#374151',
                lineHeight: 1.5,
              }}>
                <strong style={{ display: 'block', marginBottom: 4, color: '#111827', fontSize: 12 }}>
                  📐 O que este preset faz:
                </strong>
                {previewing.technicalSummary}
              </div>

              <div>
                <strong style={{ display: 'block', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Etapas geradas (em ordem)
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {previewing.buildStages().map((stage, idx) => {
                    const def = getStageTypeDefinition(stage.stageType);
                    return (
                      <div key={stage.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        background: '#fff',
                        border: '1px solid #E5E7EB',
                        borderLeft: `4px solid ${stage.color}`,
                        borderRadius: 6,
                        fontSize: 12,
                      }}>
                        <span style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: idx === 0 ? '#10B981' : '#6B7280',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>{idx + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>{def.icon}</span> {stage.name}
                            {idx === 0 && (
                              <span style={{ background: '#D1FAE5', color: '#065F46', fontSize: 9, padding: '1px 6px', borderRadius: 999, fontWeight: 700 }}>
                                INÍCIO
                              </span>
                            )}
                            {stage.isFinalStage && (
                              <span style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: 9, padding: '1px 6px', borderRadius: 999, fontWeight: 700 }}>
                                FIM
                              </span>
                            )}
                          </div>
                          <div style={{ color: '#6B7280', fontSize: 11 }}>{def.label}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => handleApply(previewing)}
                style={{
                  marginTop: 'auto',
                  padding: '12px 16px',
                  background: previewing.color,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                Aplicar este preset <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
