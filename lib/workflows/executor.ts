/**
 * Workflow Executor
 * 
 * Core execution engine that traverses node graphs, detects cycles,
 * builds execution contexts, and resolves inputs/outputs across edges.
 */

import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  PortDefinition,
} from '@/types/workflow';
import {
  detectCycle,
  topologicalSort,
  buildAdjacencyList,
} from './schema';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionContext {
  nodeId: string;
  node: WorkflowNode;
  inputs: Record<string, unknown>;
  dependencies: string[];
}

export interface ExecutionPlan {
  nodes: ExecutionContext[];
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Cycle Detection
// ============================================================================

export function checkForCycles(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): { hasCycle: boolean; cycle?: string[] } {
  const hasCycle = detectCycle(nodes, edges);

  if (hasCycle) {
    const cycle = findCycle(nodes, edges);
    return { hasCycle: true, cycle };
  }

  return { hasCycle: false };
}

function findCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const adjacency = buildAdjacencyList(nodes, edges);
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): string[] | null {
    if (recursionStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart !== -1) {
        return path.slice(cycleStart).concat([nodeId]);
      }
      return [nodeId];
    }

    if (visited.has(nodeId)) {
      return null;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const cycle = dfs(neighbor);
      if (cycle) {
        return cycle;
      }
    }

    recursionStack.delete(nodeId);
    path.pop();
    return null;
  }

  for (const node of nodes) {
    const cycle = dfs(node.id);
    if (cycle) {
      return cycle;
    }
  }

  return [];
}

// ============================================================================
// Execution Context Building
// ============================================================================

export function buildExecutionPlan(workflow: Workflow): ExecutionPlan {
  const { nodes, edges } = workflow;
  const errors: string[] = [];

  // Check for cycles
  const { hasCycle, cycle } = checkForCycles(nodes, edges);
  if (hasCycle) {
    errors.push(
      `Workflow contains a cycle: ${cycle?.join(' -> ') || 'unknown'}`
    );
    return {
      nodes: [],
      valid: false,
      errors,
    };
  }

  // Topologically sort nodes
  const sortedNodes = topologicalSort(nodes, edges);
  if (!sortedNodes) {
    errors.push('Failed to topologically sort nodes (possible cycle)');
    return {
      nodes: [],
      valid: false,
      errors,
    };
  }

  // Build execution contexts
  const contexts: ExecutionContext[] = [];
  const dependencyMap = buildDependencyMap(edges);

  for (const node of sortedNodes) {
    const dependencies = dependencyMap.get(node.id) || [];
    contexts.push({
      nodeId: node.id,
      node,
      inputs: {},
      dependencies,
    });
  }

  return {
    nodes: contexts,
    valid: true,
    errors: [],
  };
}

function buildDependencyMap(edges: WorkflowEdge[]): Map<string, string[]> {
  const dependencyMap = new Map<string, string[]>();

  edges.forEach(edge => {
    const deps = dependencyMap.get(edge.target) || [];
    if (!deps.includes(edge.source)) {
      deps.push(edge.source);
    }
    dependencyMap.set(edge.target, deps);
  });

  return dependencyMap;
}

// ============================================================================
// Input/Output Resolution
// ============================================================================

export interface NodeOutput {
  nodeId: string;
  output: Record<string, unknown>;
}

export function resolveNodeInputs(
  context: ExecutionContext,
  completedNodes: NodeOutput[],
  edges: WorkflowEdge[],
  ports: PortDefinition[]
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};

  // Get incoming edges for this node
  const incomingEdges = edges.filter(edge => edge.target === context.nodeId);

  for (const edge of incomingEdges) {
    const sourceNode = completedNodes.find(n => n.nodeId === edge.source);

    if (sourceNode) {
      const targetPortId = edge.targetPort;

      if (targetPortId) {
        // Map specific port outputs
        const port = ports.find(p => p.id === targetPortId);
        if (port && port.label) {
          inputs[port.label] = sourceNode.output[port.label] ?? null;
        }
      } else {
        // Use all outputs from source node
        Object.assign(inputs, sourceNode.output);
      }
    }
  }

  return inputs;
}

export function getNodeDependencies(
  nodeId: string,
  edges: WorkflowEdge[]
): string[] {
  return edges
    .filter(edge => edge.target === nodeId)
    .map(edge => edge.source);
}

export function getNodeDependents(
  nodeId: string,
  edges: WorkflowEdge[]
): string[] {
  return edges
    .filter(edge => edge.source === nodeId)
    .map(edge => edge.target);
}
