/**
 * Workflow Builder Hook
 * 
 * Manages builder state (nodes, edges, selection, dirty tracking)
 * and exposes actions for add/remove/connect/configure.
 */

'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  PortDefinition,
  NodeType,
  WorkflowMetadata,
} from '@/types/workflow';
import {
  createNode,
  updateNode,
  createEdge,
  createPort,
  validateWorkflowDAG,
  type ValidationResult,
} from '@/lib/workflows/schema';
import { saveWorkflow, loadWorkflow } from '@/lib/workflows/storage';

export interface WorkflowBuilderState {
  workflow: Workflow | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ports: PortDefinition[];
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  isDirty: boolean;
}

export interface WorkflowBuilderActions {
  // Workflow management
  createNewWorkflow: (name: string) => void;
  loadExistingWorkflow: (workflowId: string) => boolean;
  saveCurrentWorkflow: () => void;
  updateMetadata: (updates: Partial<WorkflowMetadata>) => void;

  // Node operations
  addNode: (type: NodeType, position: { x: number; y: number }) => WorkflowNode;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNode['data']>) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  duplicateNode: (nodeId: string) => WorkflowNode | null;

  // Edge operations
  addEdge: (source: string, target: string, sourcePort?: string, targetPort?: string) => WorkflowEdge | null;
  removeEdge: (edgeId: string) => void;
  updateEdge: (edgeId: string, updates: Partial<WorkflowEdge>) => void;

  // Port operations
  addPort: (nodeId: string, type: 'input' | 'output', label: string, dataType: string) => PortDefinition;
  removePort: (portId: string) => void;

  // Selection
  selectNode: (nodeId: string, multi?: boolean) => void;
  selectEdge: (edgeId: string, multi?: boolean) => void;
  clearSelection: () => void;
  deleteSelected: () => void;

  // Validation
  validate: () => ValidationResult;

  // Reset
  reset: () => void;
}

const initialState: WorkflowBuilderState = {
  workflow: null,
  nodes: [],
  edges: [],
  ports: [],
  selectedNodeIds: new Set(),
  selectedEdgeIds: new Set(),
  isDirty: false,
};

export function useWorkflowBuilder(): WorkflowBuilderState & WorkflowBuilderActions & { validation: ValidationResult } {
  const [state, setState] = useState<WorkflowBuilderState>(initialState);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Compute validation with useMemo instead of storing in state
  const validation = useMemo(() => {
    return validateWorkflowDAG(state.nodes, state.edges);
  }, [state.nodes, state.edges]);

  // Define saveCurrentWorkflow before the auto-save effect
  const saveCurrentWorkflow = useCallback(() => {
    if (!state.workflow) return;

    const updatedWorkflow: Workflow = {
      metadata: {
        ...state.workflow.metadata,
        updatedAt: new Date().toISOString(),
      },
      nodes: state.nodes,
      edges: state.edges,
      ports: state.ports,
    };

    saveWorkflow(updatedWorkflow);
    setState(prev => ({
      ...prev,
      workflow: updatedWorkflow,
      isDirty: false,
    }));
  }, [state.workflow, state.nodes, state.edges, state.ports]);

  // Auto-save when dirty
  useEffect(() => {
    if (state.isDirty && state.workflow) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        saveCurrentWorkflow();
      }, 2000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [state.isDirty, state.workflow, saveCurrentWorkflow]);

  const createNewWorkflow = useCallback((name: string) => {
    const now = new Date().toISOString();
    const workflowId = `workflow-${Date.now()}`;

    const metadata: WorkflowMetadata = {
      id: workflowId,
      name,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      tags: [],
    };

    const workflow: Workflow = {
      metadata,
      nodes: [],
      edges: [],
      ports: [],
    };

    setState({
      ...initialState,
      workflow,
      nodes: [],
      edges: [],
      ports: [],
    });

    saveWorkflow(workflow);
  }, []);

  const loadExistingWorkflow = useCallback((workflowId: string): boolean => {
    const workflow = loadWorkflow(workflowId);
    if (!workflow) {
      return false;
    }

    setState({
      ...initialState,
      workflow,
      nodes: workflow.nodes,
      edges: workflow.edges,
      ports: workflow.ports,
    });

    return true;
  }, []);

  const updateMetadata = useCallback((updates: Partial<WorkflowMetadata>) => {
    setState(prev => {
      if (!prev.workflow) return prev;

      return {
        ...prev,
        workflow: {
          ...prev.workflow,
          metadata: {
            ...prev.workflow.metadata,
            ...updates,
            updatedAt: new Date().toISOString(),
          },
        },
        isDirty: true,
      };
    });
  }, []);

  const addNode = useCallback((type: NodeType, position: { x: number; y: number }): WorkflowNode => {
    const node = createNode(type, position);
    
    // Create default ports for the node
    const inputPort = createPort(node.id, 'input', 'Input', 'any');
    const outputPort = createPort(node.id, 'output', 'Output', 'any');

    setState(prev => ({
      ...prev,
      nodes: [...prev.nodes, node],
      ports: [...prev.ports, inputPort, outputPort],
      isDirty: true,
    }));

    return node;
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    setState(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      ports: prev.ports.filter(p => p.nodeId !== nodeId),
      selectedNodeIds: new Set(
        Array.from(prev.selectedNodeIds).filter(id => id !== nodeId)
      ),
      isDirty: true,
    }));
  }, []);

  const updateNodeData = useCallback((nodeId: string, data: Partial<WorkflowNode['data']>) => {
    setState(prev => ({
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === nodeId
          ? updateNode(node, { data: { ...node.data, ...data } })
          : node
      ),
      isDirty: true,
    }));
  }, []);

  const updateNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setState(prev => ({
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === nodeId ? { ...node, position } : node
      ),
      isDirty: true,
    }));
  }, []);

  const duplicateNode = useCallback((nodeId: string): WorkflowNode | null => {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    const newNode = createNode(node.type, {
      x: node.position.x + 50,
      y: node.position.y + 50,
    });
    
    newNode.data = { ...node.data };

    // Duplicate ports
    const nodePorts = state.ports.filter(p => p.nodeId === nodeId);
    const newPorts = nodePorts.map(port =>
      createPort(newNode.id, port.type, port.label, port.dataType, port.required)
    );

    setState(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      ports: [...prev.ports, ...newPorts],
      isDirty: true,
    }));

    return newNode;
  }, [state.nodes, state.ports]);

  const addEdge = useCallback(
    (source: string, target: string, sourcePort?: string, targetPort?: string): WorkflowEdge | null => {
      // Check if edge already exists
      const exists = state.edges.some(
        e => e.source === source && e.target === target
      );
      if (exists) {
        return null;
      }

      // Check if this would create a cycle
      const tempEdges = [...state.edges, createEdge(source, target, sourcePort, targetPort)];
      const validation = validateWorkflowDAG(state.nodes, tempEdges);
      if (!validation.valid) {
        return null;
      }

      const edge = createEdge(source, target, sourcePort, targetPort);
      setState(prev => ({
        ...prev,
        edges: [...prev.edges, edge],
        isDirty: true,
      }));

      return edge;
    },
    [state.nodes, state.edges]
  );

  const removeEdge = useCallback((edgeId: string) => {
    setState(prev => ({
      ...prev,
      edges: prev.edges.filter(e => e.id !== edgeId),
      selectedEdgeIds: new Set(
        Array.from(prev.selectedEdgeIds).filter(id => id !== edgeId)
      ),
      isDirty: true,
    }));
  }, []);

  const updateEdge = useCallback((edgeId: string, updates: Partial<WorkflowEdge>) => {
    setState(prev => ({
      ...prev,
      edges: prev.edges.map(edge =>
        edge.id === edgeId ? { ...edge, ...updates } : edge
      ),
      isDirty: true,
    }));
  }, []);

  const addPort = useCallback(
    (nodeId: string, type: 'input' | 'output', label: string, dataType: string): PortDefinition => {
      const port = createPort(nodeId, type, label, dataType);
      setState(prev => ({
        ...prev,
        ports: [...prev.ports, port],
        isDirty: true,
      }));
      return port;
    },
    []
  );

  const removePort = useCallback((portId: string) => {
    setState(prev => ({
      ...prev,
      ports: prev.ports.filter(p => p.id !== portId),
      edges: prev.edges.filter(
        e => e.sourcePort !== portId && e.targetPort !== portId
      ),
      isDirty: true,
    }));
  }, []);

  const selectNode = useCallback((nodeId: string, multi = false) => {
    setState(prev => {
      const newSelection = new Set(multi ? prev.selectedNodeIds : []);
      if (newSelection.has(nodeId)) {
        newSelection.delete(nodeId);
      } else {
        newSelection.add(nodeId);
      }
      return {
        ...prev,
        selectedNodeIds: newSelection,
        selectedEdgeIds: multi ? prev.selectedEdgeIds : new Set(),
      };
    });
  }, []);

  const selectEdge = useCallback((edgeId: string, multi = false) => {
    setState(prev => {
      const newSelection = new Set(multi ? prev.selectedEdgeIds : []);
      if (newSelection.has(edgeId)) {
        newSelection.delete(edgeId);
      } else {
        newSelection.add(edgeId);
      }
      return {
        ...prev,
        selectedEdgeIds: newSelection,
        selectedNodeIds: multi ? prev.selectedNodeIds : new Set(),
      };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
    }));
  }, []);

  const deleteSelected = useCallback(() => {
    setState(prev => {
      const nodeIds = Array.from(prev.selectedNodeIds);
      const edgeIds = Array.from(prev.selectedEdgeIds);

      return {
        ...prev,
        nodes: prev.nodes.filter(n => !nodeIds.includes(n.id)),
        edges: prev.edges.filter(
          e => !edgeIds.includes(e.id) && !nodeIds.includes(e.source) && !nodeIds.includes(e.target)
        ),
        ports: prev.ports.filter(p => !nodeIds.includes(p.nodeId)),
        selectedNodeIds: new Set(),
        selectedEdgeIds: new Set(),
        isDirty: true,
      };
    });
  }, []);

  const validate = useCallback((): ValidationResult => {
    return validateWorkflowDAG(state.nodes, state.edges);
  }, [state.nodes, state.edges]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    ...state,
    validation,
    createNewWorkflow,
    loadExistingWorkflow,
    saveCurrentWorkflow,
    updateMetadata,
    addNode,
    removeNode,
    updateNodeData,
    updateNodePosition,
    duplicateNode,
    addEdge,
    removeEdge,
    updateEdge,
    addPort,
    removePort,
    selectNode,
    selectEdge,
    clearSelection,
    deleteSelected,
    validate,
    reset,
  };
}
