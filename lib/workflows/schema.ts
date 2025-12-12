/**
 * Workflow Schema Helpers
 * 
 * Helpers for creating/updating nodes, validating DAG constraints,
 * and computing inbound/outbound ports.
 */

import type {
  WorkflowNode,
  WorkflowEdge,
  PortDefinition,
  NodeType,
  TextNode,
  ImageNode,
  VideoNode,
} from '@/types/workflow';

// ============================================================================
// Node Creation Helpers
// ============================================================================

export function createNode(
  type: NodeType,
  position: { x: number; y: number },
  overrides?: Partial<WorkflowNode['data']>
): WorkflowNode {
  const id = generateId();
  const baseNode = {
    id,
    position,
  };

  switch (type) {
    case 'text':
      return {
        ...baseNode,
        type: 'text',
        data: {
          label: 'Text Node',
          content: '',
          ...overrides,
        },
      } as TextNode;

    case 'image':
      return {
        ...baseNode,
        type: 'image',
        data: {
          label: 'Image Node',
          url: '',
          alt: '',
          ...overrides,
        },
      } as ImageNode;

    case 'video':
      return {
        ...baseNode,
        type: 'video',
        data: {
          label: 'Video Node',
          url: '',
          format: 'mp4',
          ...overrides,
        },
      } as VideoNode;

    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

export function updateNode(
  node: WorkflowNode,
  updates: Partial<WorkflowNode>
): WorkflowNode {
  return {
    ...node,
    ...updates,
    data: {
      ...node.data,
      ...(updates.data || {}),
    },
  } as WorkflowNode;
}

// ============================================================================
// Port Management
// ============================================================================

export function createPort(
  nodeId: string,
  type: 'input' | 'output',
  label: string,
  dataType: string,
  required = false
): PortDefinition {
  return {
    id: generateId(),
    nodeId,
    type,
    label,
    dataType,
    required,
  };
}

export function getNodePorts(
  nodeId: string,
  ports: PortDefinition[]
): { inputs: PortDefinition[]; outputs: PortDefinition[] } {
  const nodePorts = ports.filter(port => port.nodeId === nodeId);
  return {
    inputs: nodePorts.filter(port => port.type === 'input'),
    outputs: nodePorts.filter(port => port.type === 'output'),
  };
}

export function getInboundPorts(
  nodeId: string,
  ports: PortDefinition[]
): PortDefinition[] {
  return ports.filter(port => port.nodeId === nodeId && port.type === 'input');
}

export function getOutboundPorts(
  nodeId: string,
  ports: PortDefinition[]
): PortDefinition[] {
  return ports.filter(port => port.nodeId === nodeId && port.type === 'output');
}

// ============================================================================
// Edge Management
// ============================================================================

export function createEdge(
  source: string,
  target: string,
  sourcePort?: string,
  targetPort?: string,
  label?: string
): WorkflowEdge {
  return {
    id: generateId(),
    source,
    target,
    sourcePort,
    targetPort,
    label,
  };
}

export function getNodeEdges(
  nodeId: string,
  edges: WorkflowEdge[]
): { incoming: WorkflowEdge[]; outgoing: WorkflowEdge[] } {
  return {
    incoming: edges.filter(edge => edge.target === nodeId),
    outgoing: edges.filter(edge => edge.source === nodeId),
  };
}

// ============================================================================
// DAG Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateWorkflowDAG(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for cycles
  const hasCycle = detectCycle(nodes, edges);
  if (hasCycle) {
    errors.push('Workflow contains a cycle - workflows must be acyclic (DAG)');
  }

  // Check for orphaned edges
  const nodeIds = new Set(nodes.map(n => n.id));
  edges.forEach(edge => {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${edge.id} references non-existent source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id} references non-existent target node: ${edge.target}`);
    }
  });

  // Check for isolated nodes
  const connectedNodes = new Set<string>();
  edges.forEach(edge => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });
  
  nodes.forEach(node => {
    if (!connectedNodes.has(node.id) && nodes.length > 1) {
      warnings.push(`Node ${node.id} (${node.data.label}) is not connected to any other nodes`);
    }
  });

  // Check for multiple edges between same nodes
  const edgeMap = new Map<string, number>();
  edges.forEach(edge => {
    const key = `${edge.source}->${edge.target}`;
    edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
  });
  
  edgeMap.forEach((count, key) => {
    if (count > 1) {
      warnings.push(`Multiple edges exist between the same nodes: ${key}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function detectCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
  const adjacency = buildAdjacencyList(nodes, edges);
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycleUtil(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (hasCycleUtil(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (hasCycleUtil(node.id)) {
      return true;
    }
  }

  return false;
}

export function buildAdjacencyList(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  
  nodes.forEach(node => {
    adjacency.set(node.id, []);
  });

  edges.forEach(edge => {
    const neighbors = adjacency.get(edge.source) || [];
    neighbors.push(edge.target);
    adjacency.set(edge.source, neighbors);
  });

  return adjacency;
}

// ============================================================================
// Topological Sort (for execution order)
// ============================================================================

export function topologicalSort(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] | null {
  const adjacency = buildAdjacencyList(nodes, edges);
  const inDegree = new Map<string, number>();
  
  nodes.forEach(node => {
    inDegree.set(node.id, 0);
  });

  edges.forEach(edge => {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  const queue: string[] = [];
  nodes.forEach(node => {
    if (inDegree.get(node.id) === 0) {
      queue.push(node.id);
    }
  });

  const result: WorkflowNode[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) {
      result.push(node);
    }

    const neighbors = adjacency.get(nodeId) || [];
    neighbors.forEach(neighbor => {
      const degree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, degree);
      if (degree === 0) {
        queue.push(neighbor);
      }
    });
  }

  return result.length === nodes.length ? result : null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export { generateId };
