/**
 * Workflow Provider
 * 
 * Wraps the builder hook and exposes it via React context.
 */

'use client';

import React, { createContext, useContext, type ReactNode } from 'react';
import {
  useWorkflowBuilder,
  type WorkflowBuilderState,
  type WorkflowBuilderActions,
} from '@/hooks/useWorkflowBuilder';

type WorkflowContextType = WorkflowBuilderState & WorkflowBuilderActions;

const WorkflowContext = createContext<WorkflowContextType | null>(null);

export interface WorkflowProviderProps {
  children: ReactNode;
}

export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const workflowBuilder = useWorkflowBuilder();

  return (
    <WorkflowContext.Provider value={workflowBuilder}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow(): WorkflowContextType {
  const context = useContext(WorkflowContext);
  
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }

  return context;
}

export default WorkflowProvider;
