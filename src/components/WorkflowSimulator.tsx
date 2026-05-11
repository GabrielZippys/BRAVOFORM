'use client';

/**
 * WorkflowSimulator — Dry-run visual do workflow.
 *
 * Permite ao admin "testar" o workflow sem mutar nenhum dado.
 * Mostra etapa por etapa o caminho que uma instância tomaria, permite
 * escolher decisões em etapas de validação, e gera um TRACE audit-ready.
 *
 * Diferencial vs concorrentes:
 *   • Pipefy/Kissflow → não têm dry-run
 *   • Camunda → tem mas exige conhecimento BPMN
 *   • Aqui → 1-click "Simular", em pt-BR, com trace visual
 *
 * Uso:
 *   <WorkflowSimulator
 *     stages={stages}
 *     edges={edges}
 *     isOpen={...}
 *     onClose={...}
 *   />
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Play, ArrowRight, CheckCircle2, XCircle, Clock, AlertCircle, RotateCcw, Download, Sparkles,
} from 'lucide-react';
import type { WorkflowStage } from '@/types';
import { getStageTypeDefinition } from '@/utils/stageTypes';

interface SimEdge {
  id: string;
  source: string;
  target: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stages: WorkflowStage[];
  edges: SimEdge[];
  workflowName?: string;
}

interface TraceEvent {
  timestamp: number;       // ms desde início
  stageId: string;
  stageName: string;
  action: 'enter' | 'advance' | 'reject' | 'cancel' | 'wait' | 'notify' | 'complete';
  decision?: string;
  durationMs?: number;
  note?: string;
}

export default function WorkflowSimulator({
  isOpen, onClose, stages, edges, workflowName,
}: Props) {
  const [running, setRunning] = useState(false);
  const [currentStageIdx, setCurrentStageIdx] = useState<number | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [completed, setCompleted] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<{ stageIdx: number } | null>(null);

  // Ordena stages por ordem
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [stages]
  );

  // Reset ao abrir
  useEffect(() => {
    if (isOpen) {
      setRunning(false);
      setCurrentStageIdx(null);
      setTrace([]);
      setCompleted(false);
      setPendingDecision(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ─── Engine de simulação ──────────────────────────────────────────────
  const startSimulation = async () => {
    if (sortedStages.length === 0) {
      alert('Adicione etapas antes de simular.');
      return;
    }
    setRunning(true);
    setTrace([]);
    setCompleted(false);
    await simulateFromIdx(0, 0);
  };

  const simulateFromIdx = async (idx: number, elapsedMs: number) => {
    if (idx >= sortedStages.length) {
      setRunning(false);
      setCompleted(true);
      setCurrentStageIdx(null);
      return;
    }

    const stage = sortedStages[idx];
    setCurrentStageIdx(idx);

    // Adiciona evento "enter"
    setTrace((t) => [...t, {
      timestamp: elapsedMs,
      stageId: stage.id,
      stageName: stage.name,
      action: 'enter',
    }]);

    await sleep(800);

    // Comportamento por tipo
    switch (stage.stageType) {
      case 'waiting': {
        const value = stage.timer?.value;
        const type = stage.timer?.type || 'hours';
        const minutes = type === 'hours' ? Number(value || 1) * 60
                      : type === 'days'  ? Number(value || 1) * 1440
                      : 30;
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'wait',
          durationMs: minutes * 60_000,
          note: `Timer: ${value} ${type}`,
        }]);
        await sleep(800);
        return simulateFromIdx(idx + 1, elapsedMs + 1600 + minutes * 60_000);
      }

      case 'notification': {
        const channels = [];
        if (stage.autoNotifications?.email) channels.push('email');
        if (stage.autoNotifications?.whatsapp) channels.push('whatsapp');
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'notify',
          note: channels.length ? `Envio via ${channels.join(' + ')}` : 'Nenhum canal configurado',
        }]);
        await sleep(800);
        return simulateFromIdx(idx + 1, elapsedMs + 1600);
      }

      case 'validation': {
        // PAUSA — pede decisão do admin
        setPendingDecision({ stageIdx: idx });
        setRunning(false);
        return;
      }

      case 'identity-validation': {
        const cfgOk = !!(stage.lookupTable && stage.lookupSearchColumn && (stage.lookupDisplayColumns?.length ?? 0) > 0);
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'enter',
          decision: cfgOk
            ? `Aguarda colaborador digitar ID e confirmar identidade`
            : '⚠️ Etapa não configurada (falta tabela/coluna)',
          note: cfgOk
            ? `Tabela: ${stage.lookupTable} · Coluna: ${stage.lookupSearchColumn} · Exibe: ${stage.lookupDisplayColumns!.length} coluna(s)`
            : undefined,
        }]);
        await sleep(1000);
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 1800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'advance',
          decision: 'Identidade confirmada — avança',
        }]);
        await sleep(600);
        return simulateFromIdx(idx + 1, elapsedMs + 2400);
      }

      case 'parallel-fork': {
        // Conta paths de saída (edges com source = stage.id)
        const outgoing = edges.filter((e) => e.source === stage.id);
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'advance',
          decision: `Bifurca em ${outgoing.length} caminho(s) paralelo(s)`,
          note: outgoing.length === 0
            ? 'Sem conexões de saída — nenhum path bifurcado'
            : `Cada path executa simultaneamente. Aguarda Junção Paralela mais adiante.`,
        }]);
        await sleep(800);
        return simulateFromIdx(idx + 1, elapsedMs + 1600);
      }

      case 'parallel-join': {
        const minPaths = (stage as any).parallelMinPathsToComplete;
        const timeout = (stage as any).parallelTimeoutMinutes;
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'wait',
          decision: minPaths
            ? `Aguarda ${minPaths} path(s) completarem`
            : 'Aguarda TODOS os paths',
          note: timeout ? `Timeout: ${timeout}min` : 'Sem timeout — pode esperar indefinidamente',
        }]);
        await sleep(1200);
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 2000,
          stageId: stage.id,
          stageName: stage.name,
          action: 'advance',
          decision: 'Paths convergiram — avança',
        }]);
        await sleep(600);
        return simulateFromIdx(idx + 1, elapsedMs + 2600);
      }

      case 'sub-workflow': {
        const subId = (stage as any).subWorkflowId;
        const mode = (stage as any).subWorkflowMode || 'wait';
        if (!subId) {
          setTrace((t) => [...t, {
            timestamp: elapsedMs + 800,
            stageId: stage.id,
            stageName: stage.name,
            action: 'advance',
            decision: 'Sub-workflow não configurado — pulando',
          }]);
          await sleep(600);
          return simulateFromIdx(idx + 1, elapsedMs + 1400);
        }
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'notify',
          decision: `Spawnou sub-workflow ${subId.slice(0, 12)}…`,
          note: mode === 'wait'
            ? 'Modo wait: pai pausa até sub completar'
            : 'Modo fire-and-forget: continua imediatamente',
        }]);
        await sleep(1500);
        if (mode === 'wait') {
          setTrace((t) => [...t, {
            timestamp: elapsedMs + 2300,
            stageId: stage.id,
            stageName: stage.name,
            action: 'wait',
            note: 'Aguardando conclusão do sub-workflow…',
            durationMs: 5 * 60_000,  // simulado: 5min
          }]);
          await sleep(800);
          setTrace((t) => [...t, {
            timestamp: elapsedMs + 5 * 60_000 + 3100,
            stageId: stage.id,
            stageName: stage.name,
            action: 'advance',
            decision: 'Sub-workflow concluiu — pai retomado',
          }]);
          await sleep(600);
          return simulateFromIdx(idx + 1, elapsedMs + 5 * 60_000 + 3700);
        }
        await sleep(400);
        return simulateFromIdx(idx + 1, elapsedMs + 2700);
      }

      case 'documentation':
      case 'execution':
      case 'custom':
      default: {
        setTrace((t) => [...t, {
          timestamp: elapsedMs + 800,
          stageId: stage.id,
          stageName: stage.name,
          action: 'advance',
        }]);
        await sleep(600);
        return simulateFromIdx(idx + 1, elapsedMs + 1400);
      }
    }
  };

  const handleValidationDecision = async (decision: 'approve' | 'reject' | 'cancel') => {
    if (!pendingDecision) return;
    const { stageIdx } = pendingDecision;
    const stage = sortedStages[stageIdx];

    const lastTime = trace[trace.length - 1]?.timestamp ?? 0;

    setPendingDecision(null);
    setRunning(true);

    if (decision === 'cancel') {
      setTrace((t) => [...t, {
        timestamp: lastTime + 500,
        stageId: stage.id,
        stageName: stage.name,
        action: 'cancel',
        decision: 'Workflow cancelado pelo validador',
      }]);
      setRunning(false);
      setCompleted(true);
      setCurrentStageIdx(null);
      return;
    }

    if (decision === 'reject') {
      const prevIdx = stageIdx > 0 ? stageIdx - 1 : 0;
      setTrace((t) => [...t, {
        timestamp: lastTime + 500,
        stageId: stage.id,
        stageName: stage.name,
        action: 'reject',
        decision: stageIdx > 0 ? `Volta para "${sortedStages[prevIdx].name}"` : 'Workflow encerrado (sem etapa anterior)',
      }]);
      await sleep(600);
      if (stageIdx > 0) {
        return simulateFromIdx(prevIdx, lastTime + 1100);
      } else {
        setRunning(false);
        setCompleted(true);
        setCurrentStageIdx(null);
        return;
      }
    }

    // approve
    setTrace((t) => [...t, {
      timestamp: lastTime + 500,
      stageId: stage.id,
      stageName: stage.name,
      action: 'advance',
      decision: 'Aprovado',
    }]);
    await sleep(600);
    return simulateFromIdx(stageIdx + 1, lastTime + 1100);
  };

  const handleReset = () => {
    setRunning(false);
    setCurrentStageIdx(null);
    setTrace([]);
    setCompleted(false);
    setPendingDecision(null);
  };

  const handleExportTrace = () => {
    const exportData = {
      workflow: workflowName,
      simulatedAt: new Date().toISOString(),
      stagesCount: sortedStages.length,
      trace: trace.map((t) => ({
        ...t,
        timestampFormatted: formatDuration(t.timestamp),
      })),
      completed,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-simulation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sim-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface-overlay)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-2xl)',
          maxWidth: 1080,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        {/* Header */}
        <header style={{
          padding: 'var(--space-5) var(--space-6)',
          background: 'linear-gradient(135deg, #1F2937 0%, #4B5563 100%)',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={22} />
            </div>
            <div>
              <h2 id="sim-title" style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
                Simular Workflow (dry-run)
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-sm)', opacity: 0.8 }}>
                {workflowName ? `${workflowName} · ` : ''}{sortedStages.length} etapa{sortedStages.length !== 1 ? 's' : ''} · Nenhum dado real é alterado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)', padding: 'var(--space-2)',
            }}
          >
            <X size={22} />
          </button>
        </header>

        {/* Body — split: timeline + trace */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Coluna esquerda: timeline visual */}
          <div style={{
            flex: 1.2,
            padding: 'var(--space-6)',
            overflowY: 'auto',
            borderRight: '1px solid var(--color-border-subtle)',
            background: 'var(--surface-page)',
          }}>
            <h3 style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              margin: '0 0 var(--space-3)',
            }}>
              Caminho do workflow
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {sortedStages.map((stage, idx) => {
                const def = getStageTypeDefinition(stage.stageType);
                const isCurrent = currentStageIdx === idx;
                const visited = trace.some((t) => t.stageId === stage.id);
                const visitedAdvance = trace.some((t) => t.stageId === stage.id && t.action === 'advance');

                return (
                  <div
                    key={stage.id}
                    style={{
                      background: isCurrent
                        ? 'var(--color-brand-50)'
                        : visited
                        ? 'var(--surface-card)'
                        : 'var(--surface-card)',
                      border: isCurrent
                        ? `2px solid var(--color-brand-500)`
                        : '1px solid var(--color-border-subtle)',
                      borderLeft: `4px solid ${stage.color}`,
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3)',
                      opacity: !visited && currentStageIdx !== null ? 0.5 : 1,
                      transition: 'all var(--duration-fast)',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{
                        width: 24, height: 24,
                        borderRadius: '50%',
                        background: visitedAdvance ? 'var(--color-success-500)' : isCurrent ? 'var(--color-brand-500)' : 'var(--color-gray-400)',
                        color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {visitedAdvance ? <CheckCircle2 size={14} /> : isCurrent ? '•' : idx + 1}
                      </span>
                      <span style={{ fontSize: 18 }}>{def.icon}</span>
                      <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                        {stage.name}
                      </strong>
                      {isCurrent && (
                        <span style={{
                          marginLeft: 'auto',
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--color-brand-500)',
                          color: '#fff',
                          fontWeight: 700,
                          letterSpacing: 0.5,
                        }}>
                          AGORA
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-secondary)',
                      marginLeft: 32,
                      marginTop: 2,
                    }}>
                      {def.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Decisão pendente */}
            {pendingDecision && (
              <div style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-4)',
                background: 'var(--color-warning-50)',
                border: '2px solid var(--color-warning-500)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 700,
                  color: 'var(--color-warning-700)',
                  marginBottom: 'var(--space-2)',
                }}>
                  <AlertCircle size={16} />
                  Decisão necessária
                </div>
                <p style={{
                  margin: '0 0 var(--space-3)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-warning-700)',
                  lineHeight: 1.5,
                }}>
                  Etapa de validação: <strong>{sortedStages[pendingDecision.stageIdx].name}</strong>.
                  Como o validador decidiria nesta simulação?
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleValidationDecision('approve')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--color-success-500)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <CheckCircle2 size={14} /> Aprovar
                  </button>
                  <button
                    onClick={() => handleValidationDecision('reject')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--color-warning-500)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <XCircle size={14} /> Reprovar
                  </button>
                  <button
                    onClick={() => handleValidationDecision('cancel')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--color-danger-500)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <AlertCircle size={14} /> Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Workflow concluído */}
            {completed && (
              <div style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-4)',
                background: 'var(--color-success-50)',
                border: '2px solid var(--color-success-500)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}>
                <CheckCircle2 size={28} color="var(--color-success-600)" />
                <h3 style={{
                  margin: 'var(--space-2) 0 var(--space-1)',
                  color: 'var(--color-success-700)',
                  fontSize: 'var(--font-size-base)',
                }}>
                  Simulação concluída
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-success-700)',
                }}>
                  {trace.length} eventos rastreados · Tempo total: {formatDuration(trace[trace.length - 1]?.timestamp || 0)}
                </p>
              </div>
            )}
          </div>

          {/* Coluna direita: Trace log */}
          <div style={{
            flex: 1,
            padding: 'var(--space-6)',
            overflowY: 'auto',
            background: 'var(--surface-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            <header style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                margin: 0,
              }}>
                Trace de eventos {trace.length > 0 && `(${trace.length})`}
              </h3>
              {trace.length > 0 && (
                <button
                  onClick={handleExportTrace}
                  title="Exportar trace como JSON"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border-default)',
                    color: 'var(--color-text-secondary)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Download size={11} /> JSON
                </button>
              )}
            </header>

            {trace.length === 0 ? (
              <div style={{
                background: 'var(--surface-page)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-6)',
                textAlign: 'center',
                color: 'var(--color-text-tertiary)',
                fontSize: 'var(--font-size-sm)',
              }}>
                Clique em <strong>Iniciar simulação</strong> para ver os eventos.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {trace.map((t, i) => (
                  <TraceLine key={i} event={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer style={{
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--color-border-subtle)',
          display: 'flex',
          gap: 'var(--space-2)',
          background: 'var(--surface-page)',
        }}>
          {!running && !completed && trace.length === 0 && (
            <button
              onClick={startSimulation}
              disabled={sortedStages.length === 0}
              style={{
                flex: 1,
                padding: 'var(--space-3) var(--space-4)',
                background: 'linear-gradient(135deg, var(--color-brand-500) 0%, #8B5CF6 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <Play size={16} /> Iniciar simulação
            </button>
          )}
          {(running || completed || trace.length > 0) && (
            <button
              onClick={handleReset}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <RotateCcw size={16} /> Reiniciar
            </button>
          )}
          {(completed || (trace.length > 0 && !running)) && (
            <button
              onClick={onClose}
              style={{
                marginLeft: 'auto',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-text-primary)',
                color: 'var(--surface-card)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}min`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const ACTION_CONFIG: Record<TraceEvent['action'], { color: string; bg: string; icon: any; label: string }> = {
  enter:    { color: '#3b82f6', bg: '#dbeafe', icon: Play,         label: 'Entrou' },
  advance:  { color: '#10b981', bg: '#d1fae5', icon: ArrowRight,   label: 'Avançou' },
  reject:   { color: '#f59e0b', bg: '#fef3c7', icon: XCircle,      label: 'Reprovou' },
  cancel:   { color: '#ef4444', bg: '#fee2e2', icon: AlertCircle,  label: 'Cancelou' },
  wait:     { color: '#8b5cf6', bg: '#ede9fe', icon: Clock,        label: 'Aguardou' },
  notify:   { color: '#06b6d4', bg: '#cffafe', icon: Sparkles,     label: 'Notificou' },
  complete: { color: '#059669', bg: '#a7f3d0', icon: CheckCircle2, label: 'Completou' },
};

function TraceLine({ event }: { event: TraceEvent }) {
  const cfg = ACTION_CONFIG[event.action];
  const Icon = cfg.icon;
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-2)',
      padding: 'var(--space-2)',
      borderRadius: 'var(--radius-sm)',
      fontSize: 'var(--font-size-xs)',
      borderLeft: `3px solid ${cfg.color}`,
      background: 'var(--surface-page)',
    }}>
      <code style={{
        color: 'var(--color-text-tertiary)',
        fontFamily: 'monospace',
        minWidth: 60,
        fontSize: 10,
      }}>
        {formatDuration(event.timestamp)}
      </code>
      <span style={{
        background: cfg.bg,
        color: cfg.color,
        padding: '1px 6px',
        borderRadius: 'var(--radius-full)',
        fontSize: 10,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        height: 16,
      }}>
        <Icon size={10} /> {cfg.label}
      </span>
      <div style={{ flex: 1, color: 'var(--color-text-primary)' }}>
        <strong>{event.stageName}</strong>
        {event.decision && (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontStyle: 'italic' }}>
            → {event.decision}
          </div>
        )}
        {event.note && (
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>
            {event.note}
            {event.durationMs && ` (${formatDuration(event.durationMs)})`}
          </div>
        )}
      </div>
    </div>
  );
}
