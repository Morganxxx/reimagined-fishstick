/**
 * Node Registry
 * 
 * Provider-agnostic interfaces for node execution.
 * Each node type exposes an execute function that the engine can call.
 */

import type { WorkflowNode } from '@/types/workflow';

// ============================================================================
// Node Execution Interface
// ============================================================================

export interface NodeExecutionInput {
  [key: string]: unknown;
}

export interface NodeExecutionOutput {
  [key: string]: unknown;
}

export interface NodeExecutionConfig {
  nodeId: string;
  nodeType: string;
  nodeData: WorkflowNode['data'];
}

export type NodeExecutor = (
  config: NodeExecutionConfig,
  inputs: NodeExecutionInput
) => Promise<NodeExecutionOutput>;

// ============================================================================
// Node Registry
// ============================================================================

interface RegisteredNode {
  type: string;
  executor: NodeExecutor;
  description?: string;
}

const nodeRegistry = new Map<string, RegisteredNode>();

export function registerNode(
  nodeType: string,
  executor: NodeExecutor,
  description?: string
): void {
  nodeRegistry.set(nodeType, {
    type: nodeType,
    executor,
    description,
  });
}

export function getNodeExecutor(nodeType: string): NodeExecutor | null {
  const registered = nodeRegistry.get(nodeType);
  return registered?.executor ?? null;
}

export function isNodeTypeRegistered(nodeType: string): boolean {
  return nodeRegistry.has(nodeType);
}

export function getRegisteredNodeTypes(): string[] {
  return Array.from(nodeRegistry.keys());
}

// ============================================================================
// Built-in Node Executors
// ============================================================================

// Text node executor - passes through input and configuration
registerNode(
  'text',
  async (config, inputs) => {
    const { nodeData } = config;
    return {
      content: nodeData.content || '',
      label: nodeData.label || 'Text Node',
      ...inputs,
    };
  },
  'Text node that processes and returns text content'
);

// Image node executor - passes through image metadata
registerNode(
  'image',
  async (config, inputs) => {
    const { nodeData } = config;
    return {
      url: nodeData.url || '',
      alt: nodeData.alt || '',
      width: nodeData.width,
      height: nodeData.height,
      label: nodeData.label || 'Image Node',
      ...inputs,
    };
  },
  'Image node that handles image metadata'
);

// Video node executor - passes through video metadata
registerNode(
  'video',
  async (config, inputs) => {
    const { nodeData } = config;
    return {
      url: nodeData.url || '',
      format: nodeData.format || 'mp4',
      duration: nodeData.duration,
      label: nodeData.label || 'Video Node',
      ...inputs,
    };
  },
  'Video node that handles video metadata'
);
