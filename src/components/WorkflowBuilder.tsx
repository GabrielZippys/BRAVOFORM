'use client';

import React from 'react';
import type { WorkflowStage } from '@/types';
import WorkflowCanvas from './WorkflowCanvas';

interface WorkflowBuilderProps {
  formId: string;
  initialStages?: WorkflowStage[];
  onSave: (stages: WorkflowStage[]) => Promise<void>;
  workflowCompanies?: string[];
  workflowDepartments?: string[];
  workflowName?: string;
  workflowDescription?: string;
}

export default function WorkflowBuilder({ 
  formId, 
  initialStages = [], 
  onSave,
  workflowCompanies = [],
  workflowDepartments = [],
  workflowName = 'Workflow de Teste',
  workflowDescription = 'Descrição do workflow'
}: WorkflowBuilderProps) {
  return (
    <WorkflowCanvas 
      initialStages={initialStages} 
      onSave={onSave}
      workflowCompanies={workflowCompanies}
      workflowDepartments={workflowDepartments}
      workflowName={workflowName}
      workflowDescription={workflowDescription}
    />
  );
}
