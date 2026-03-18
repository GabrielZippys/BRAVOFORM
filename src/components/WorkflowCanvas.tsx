'use client';

import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  Panel,
  EdgeProps,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus, Save, Settings, Trash2, GitBranch, Eye, Power, PowerOff } from 'lucide-react';
import type { WorkflowStage, RoutingCondition, ActivationSettings, ActivationMode } from '@/types';
import { WorkflowService } from '@/services/workflowService';
import { useAuth } from '@/hooks/useAuth';
import StageNode from './StageNode';
import StageConfigPanel from './StageConfigPanel';
import ConfirmModal from './ConfirmModal';
import RoutingConditionModal from './RoutingConditionModal';
import CustomEdge from './CustomEdge';
import ActivationSettingsModal from './ActivationSettingsModal';
import { useConfirm } from '@/hooks/useConfirm';
import styles from '../../app/styles/WorkflowCanvas.module.css';

interface WorkflowCanvasProps {
  initialStages: WorkflowStage[];
  onSave: (stages: WorkflowStage[]) => Promise<void>;
  workflowCompanies?: string[];
  workflowDepartments?: string[];
  workflowName?: string;
  workflowDescription?: string;
  workflowId?: string;  // ID do workflow se já existe
  initialIsActive?: boolean;
  initialActivationSettings?: ActivationSettings;
}

const nodeTypes = {
  stageNode: StageNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

export default function WorkflowCanvas({ 
  initialStages = [], 
  onSave,
  workflowCompanies = [],
  workflowDepartments = [],
  workflowName = 'Workflow de Teste',
  workflowDescription = 'Descrição do workflow',
  workflowId,
  initialIsActive = true,
  initialActivationSettings
}: WorkflowCanvasProps) {
  const { user } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isActive, setIsActive] = useState(initialIsActive);

  // Atualizar isActive quando initialIsActive mudar (ao carregar workflow para edição)
  useEffect(() => {
    setIsActive(initialIsActive);
  }, [initialIsActive]);
  const [activationSettings, setActivationSettings] = useState<ActivationSettings>(
    initialActivationSettings || {
      mode: 'manual' as ActivationMode,
      requestApprovalRequired: false
    }
  );
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState(false);
  const [selectedSourceStage, setSelectedSourceStage] = useState<string | null>(null);
  const [stageCounter, setStageCounter] = useState(1);
  const [showActivationSettings, setShowActivationSettings] = useState(false);
  const { confirm, alert, confirmState } = useConfirm();

  // Inicializar com stages existentes
  useEffect(() => {
    if (initialStages.length > 0) {
      const initialNodes: Node[] = initialStages.map((stage, index) => ({
        id: stage.id,
        type: 'stageNode',
        position: { x: 100 + (index * 250), y: 100 },
        data: { 
          stage,
          onDelete: handleDeleteNode,
          onEdit: handleEditNode
        },
      }));

      // Criar edges baseado na ordem
      const initialEdges: Edge[] = [];
      
      // Primeiro, criar todas as edges
      for (let i = 0; i < initialStages.length - 1; i++) {
        initialEdges.push({
          id: `e${initialStages[i].id}-${initialStages[i + 1].id}`,
          source: initialStages[i].id,
          target: initialStages[i + 1].id,
          type: 'custom',
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#3B82F6',
          },
          style: {
            strokeWidth: 2,
            stroke: '#3B82F6',
          },
          data: {
            hasMultiplePaths: false,
            onConfigureRouting: () => handleConfigureRouting(initialStages[i].id)
          }
        });
      }
      
      // Depois, verificar quais sources têm múltiplas conexões
      const edgesWithMultiplePaths = initialEdges.map((edge, index) => {
        const sourceEdgesCount = initialEdges.filter(e => e.source === edge.source).length;
        const isFirstEdgeFromSource = initialEdges.findIndex(e => e.source === edge.source) === index;
        
        return {
          ...edge,
          data: {
            ...edge.data,
            // Mostrar emoji apenas na primeira edge quando há múltiplos caminhos
            hasMultiplePaths: sourceEdgesCount >= 2 && isFirstEdgeFromSource
          }
        };
      });

      setNodes(initialNodes);
      setEdges(edgesWithMultiplePaths);
      setStageCounter(initialStages.length + 1);
    }
  }, []);

  const handleDeleteNode = useCallback(async (nodeId: string, stageName: string) => {
    const confirmed = await confirm({
      title: 'Excluir Etapa',
      message: `Tem certeza que deseja excluir a etapa "${stageName}"?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      isDanger: true
    });

    if (confirmed) {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
      }
    }
  }, [selectedNode, confirm]);

  const handleEditNode = useCallback((nodeId: string) => {
    console.log('handleEditNode called with:', nodeId);
    setNodes((currentNodes) => {
      const node = currentNodes.find(n => n.id === nodeId);
      console.log('Found node:', node);
      if (node) {
        setSelectedNode(node);
        console.log('Selected node set');
      }
      return currentNodes; // Não modifica os nodes, apenas usa para buscar
    });
  }, []);

  // Detectar se uma etapa tem múltiplos caminhos de saída
  const getOutgoingEdges = useCallback((nodeId: string) => {
    return edges.filter(edge => edge.source === nodeId);
  }, [edges]);

  const handleConfigureRouting = useCallback((sourceStageId: string) => {
    setSelectedSourceStage(sourceStageId);
    setIsRoutingModalOpen(true);
  }, []);

  // Atualizar marcação de etapa final e múltiplos caminhos sempre que nodes mudarem
  useEffect(() => {
    if (nodes.length > 0) {
      setNodes((currentNodes) => 
        currentNodes.map((node) => {
          const outgoingEdges = edges.filter(e => e.source === node.id);
          const hasMultiplePaths = outgoingEdges.length > 1;
          
          // Etapa é final se não tem conexões de saída (é uma folha)
          const isFinalStage = outgoingEdges.length === 0;
          
          return {
            ...node,
            data: {
              ...node.data,
              stage: {
                ...node.data.stage,
                isFinalStage
              },
              hasMultiplePaths,
              onConfigureRouting: () => handleConfigureRouting(node.id)
            }
          };
        })
      );
    }
  }, [nodes.length, edges.length, handleConfigureRouting]);

  const handleAddStage = useCallback(() => {
    // Encontrar o maior número de etapa existente
    const maxStageNumber = nodes.reduce((max, node) => {
      const match = node.data.stage.name.match(/Etapa (\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);
    
    const newStage: WorkflowStage = {
      id: crypto.randomUUID(),
      name: `Etapa ${maxStageNumber + 1}`,
      stageType: nodes.length === 0 ? 'start' : 'custom',
      color: nodes.length === 0 ? '#10B981' : '#3B82F6',
      allowedRoles: [],
      allowedUsers: [],
      requireComment: false,
      requireAttachments: false,
      autoNotifications: {
        email: false,
        whatsapp: false,
        recipients: [],
        message: '',
        emailRecipients: [],
        whatsappNumbers: []
      },
      order: nodes.length,
      isFinalStage: false,
      isInitialStage: nodes.length === 0
    };

    const newNode: Node = {
      id: newStage.id,
      type: 'stageNode',
      position: { 
        x: 100 + (nodes.length * 250), 
        y: 100 + Math.floor(nodes.length / 4) * 150
      },
      data: { 
        stage: newStage,
        onDelete: handleDeleteNode,
        onEdit: handleEditNode
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, handleDeleteNode, handleEditNode]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      
      const sourceId = params.source;
      const outgoingEdges = edges.filter(e => e.source === sourceId);
      // Após adicionar esta conexão, teremos outgoingEdges.length + 1 conexões
      const willHaveMultiplePaths = outgoingEdges.length + 1 >= 2;

      const newEdge: Edge = {
        ...params,
        source: params.source,
        target: params.target,
        id: `e${params.source}-${params.target}`,
        type: 'custom',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#3B82F6',
        },
        style: {
          strokeWidth: 2,
          stroke: '#3B82F6',
        },
        data: {
          hasMultiplePaths: willHaveMultiplePaths,
          onConfigureRouting: () => handleConfigureRouting(sourceId)
        }
      };
      
      setEdges((eds) => {
        const newEdges = addEdge(newEdge, eds);
        const sourceEdgesCount = newEdges.filter(e => e.source === sourceId).length;
        const hasMultiplePaths = sourceEdgesCount >= 2;
        
        // Atualizar todas as edges da mesma origem
        return newEdges.map((edge, index) => {
          if (edge.source === sourceId) {
            const isFirstEdgeFromSource = newEdges.findIndex(e => e.source === sourceId) === index;
            
            return {
              ...edge,
              data: {
                ...edge.data,
                // Mostrar emoji apenas na primeira edge
                hasMultiplePaths: hasMultiplePaths && isFirstEdgeFromSource,
                onConfigureRouting: () => handleConfigureRouting(sourceId!)
              }
            };
          }
          return edge;
        });
      });
    },
    [edges, handleConfigureRouting]
  );

  const handleUpdateStage = useCallback((updates: Partial<WorkflowStage>) => {
    if (!selectedNode) return;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          const updatedStage = { ...node.data.stage, ...updates };
          return {
            ...node,
            data: {
              ...node.data,
              stage: updatedStage,
            },
          };
        }
        return node;
      })
    );

    setSelectedNode((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        data: {
          ...prev.data,
          stage: { ...prev.data.stage, ...updates },
        },
      };
    });
  }, [selectedNode]);

  const handleSaveRoutingConditions = useCallback((conditions: RoutingCondition[]) => {
    if (!selectedSourceStage) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedSourceStage
          ? {
              ...node,
              data: {
                ...node.data,
                stage: {
                  ...node.data.stage,
                  routingConditions: conditions,
                },
              },
            }
          : node
      )
    );
  }, [selectedSourceStage, setNodes]);

  const handleSave = async () => {
    if (nodes.length === 0) {
      await alert('Aviso', 'Adicione pelo menos uma etapa antes de salvar.');
      return;
    }

    if (!user) {
      await alert('Erro', 'Usuário não autenticado.');
      return;
    }

    setIsSaving(true);
    try {
      const stages: WorkflowStage[] = nodes.map((node, index) => {
        // Verificar se esta etapa tem conexões de saída
        const hasOutgoingEdges = edges.some(e => e.source === node.id);
        
        return {
          ...node.data.stage,
          order: index,
          // Marcar como final se não tem conexões de saída (é folha)
          isFinalStage: !hasOutgoingEdges
        };
      });

      // Chamar callback onSave (a página pai é responsável por salvar no Firestore)
      await onSave(stages);
      
      await alert('Sucesso', workflowId ? 'Workflow atualizado com sucesso!' : 'Workflow criado com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar workflow:', error);
      await alert('Erro', 'Erro ao salvar workflow. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    const newStatus = !isActive;
    setIsActive(newStatus);
    
    // Se já existe um workflow salvo, atualizar no Firestore
    if (workflowId) {
      try {
        await WorkflowService.toggleWorkflowActive(workflowId, newStatus);
        await alert('Sucesso', `Workflow ${newStatus ? 'ativado' : 'desativado'} com sucesso!`);
      } catch (error) {
        console.error('Erro ao alterar status:', error);
        setIsActive(!newStatus); // Reverter em caso de erro
        await alert('Erro', 'Erro ao alterar status do workflow.');
      }
    }
  };

  const handleSaveActivationSettings = async (newSettings: ActivationSettings) => {
    setActivationSettings(newSettings);
    
    // Se já existe um workflow salvo, atualizar no Firestore
    if (workflowId) {
      try {
        await WorkflowService.updateActivationSettings(workflowId, newSettings);
        await alert('Sucesso', 'Configurações de ativação atualizadas com sucesso!');
      } catch (error) {
        console.error('Erro ao atualizar configurações:', error);
        await alert('Erro', 'Erro ao atualizar configurações de ativação.');
      }
    }
  };


  return (
    <div className={styles.container}>
      <div className={styles.canvasWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          minZoom={0.5}
          maxZoom={1.5}
          className={styles.reactFlow}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          
          <Panel position="top-left" className={styles.panel}>
            <button onClick={handleAddStage} className={styles.btnAdd}>
              <Plus size={20} />
              Adicionar Etapa
            </button>
            <button 
              onClick={handleSave} 
              disabled={isSaving || nodes.length === 0}
              className={styles.btnSave}
            >
              <Save size={20} />
              {isSaving ? 'Salvando...' : 'Salvar Workflow'}
            </button>
            <button 
              onClick={handleToggleActive}
              className={isActive ? styles.btnActive : styles.btnInactive}
              title={isActive ? 'Desativar Workflow' : 'Ativar Workflow'}
            >
              {isActive ? <Power size={20} /> : <PowerOff size={20} />}
              {isActive ? 'Ativo' : 'Inativo'}
            </button>
            <button 
              onClick={() => setShowActivationSettings(true)}
              className={styles.btnSettings}
              title="Configurações de Ativação"
            >
              <Settings size={20} />
              Configurações
            </button>
          </Panel>

          <Panel position="top-right" className={styles.infoPanel}>
            <div className={styles.info}>
              <span>{nodes.length} {nodes.length === 1 ? 'etapa' : 'etapas'}</span>
              <span>{edges.length} {edges.length === 1 ? 'conexão' : 'conexões'}</span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <>
          {console.log('Rendering StageConfigPanel for:', selectedNode.data.stage.name)}
          <StageConfigPanel
            stage={selectedNode.data.stage}
            onUpdate={handleUpdateStage}
            onClose={() => setSelectedNode(null)}
            workflowCompanies={workflowCompanies}
            workflowDepartments={workflowDepartments}
          />
        </>
      )}

      {isRoutingModalOpen && selectedSourceStage && (
        <RoutingConditionModal
          isOpen={isRoutingModalOpen}
          sourceStageId={selectedSourceStage}
          targetStages={getOutgoingEdges(selectedSourceStage).map(edge => {
            const targetNode = nodes.find(n => n.id === edge.target);
            return {
              id: edge.target,
              name: targetNode?.data.stage.name || 'Etapa'
            };
          })}
          existingConditions={
            nodes.find(n => n.id === selectedSourceStage)?.data.stage.routingConditions || []
          }
          onSave={handleSaveRoutingConditions}
          onClose={() => {
            setIsRoutingModalOpen(false);
            setSelectedSourceStage(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        onConfirm={confirmState.onConfirm}
        onCancel={confirmState.onCancel}
        isDanger={confirmState.isDanger}
      />


      {showActivationSettings && (
        <ActivationSettingsModal
          settings={activationSettings}
          onSave={handleSaveActivationSettings}
          onClose={() => setShowActivationSettings(false)}
        />
      )}
    </div>
  );
}
