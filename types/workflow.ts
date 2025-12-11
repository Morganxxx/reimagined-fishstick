/**
 * Workflow Core Type Definitions
 * 
 * Discriminated unions for node types, port definitions, edge objects,
 * workflow metadata, node parameter schema, and run result envelopes.
 */

// ============================================================================
// Node Types (Discriminated Union)
// ============================================================================

export type NodeType = 'text' | 'image' | 'video';

export interface BaseNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface TextNode extends BaseNode {
  type: 'text';
  data: {
    label: string;
    content?: string;
    maxLength?: number;
    [key: string]: unknown;
  };
}

export interface ImageNode extends BaseNode {
  type: 'image';
  data: {
    label: string;
    url?: string;
    alt?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
}

export interface VideoNode extends BaseNode {
  type: 'video';
  data: {
    label: string;
    url?: string;
    duration?: number;
    format?: string;
    [key: string]: unknown;
  };
}

export type WorkflowNode = TextNode | ImageNode | VideoNode;

// ============================================================================
// Port Definitions
// ============================================================================

export type PortType = 'input' | 'output';

export interface PortDefinition {
  id: string;
  nodeId: string;
  type: PortType;
  label: string;
  dataType: string;
  required?: boolean;
}

// ============================================================================
// Edge Objects
// ============================================================================

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  label?: string;
}

// ============================================================================
// Workflow Metadata
// ============================================================================

export interface WorkflowMetadata {
  id: string;
  name: string;
  description?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  tags?: string[];
}

// ============================================================================
// Node Parameter Schema
// ============================================================================

export type ParameterType = 'string' | 'number' | 'boolean' | 'select' | 'file' | 'array';

export interface BaseParameterSchema {
  name: string;
  label: string;
  type: ParameterType;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
}

export interface StringParameterSchema extends BaseParameterSchema {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface NumberParameterSchema extends BaseParameterSchema {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanParameterSchema extends BaseParameterSchema {
  type: 'boolean';
}

export interface SelectParameterSchema extends BaseParameterSchema {
  type: 'select';
  options: Array<{ label: string; value: string | number }>;
}

export interface FileParameterSchema extends BaseParameterSchema {
  type: 'file';
  accept?: string[];
  maxSize?: number;
}

export interface ArrayParameterSchema extends BaseParameterSchema {
  type: 'array';
  itemType: ParameterType;
  minItems?: number;
  maxItems?: number;
}

export type ParameterSchema =
  | StringParameterSchema
  | NumberParameterSchema
  | BooleanParameterSchema
  | SelectParameterSchema
  | FileParameterSchema
  | ArrayParameterSchema;

export interface NodeParameterDefinition {
  nodeType: NodeType;
  parameters: ParameterSchema[];
}

// ============================================================================
// Run Result Envelopes
// ============================================================================

export type RunStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface RunResultBase {
  nodeId: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

export interface PendingResult extends RunResultBase {
  status: 'pending';
}

export interface RunningResult extends RunResultBase {
  status: 'running';
  progress?: number;
}

export interface SuccessResult extends RunResultBase {
  status: 'success';
  output: unknown;
  metrics?: Record<string, number | string>;
}

export interface ErrorResult extends RunResultBase {
  status: 'error';
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export interface CancelledResult extends RunResultBase {
  status: 'cancelled';
  reason?: string;
}

export type RunResult =
  | PendingResult
  | RunningResult
  | SuccessResult
  | ErrorResult
  | CancelledResult;

// ============================================================================
// Complete Workflow Definition
// ============================================================================

export interface Workflow {
  metadata: WorkflowMetadata;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ports: PortDefinition[];
}

// ============================================================================
// Workflow Execution Context
// ============================================================================

export interface WorkflowExecution {
  workflowId: string;
  executionId: string;
  status: RunStatus;
  results: RunResult[];
  startedAt: string;
  completedAt?: string;
}
