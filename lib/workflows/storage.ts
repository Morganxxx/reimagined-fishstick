/**
 * Workflow Storage
 * 
 * localStorage-backed load/save/delete with JSON schema guards,
 * plus fallbacks for SSR via in-memory store.
 */

import type { Workflow, WorkflowMetadata } from '@/types/workflow';

const STORAGE_KEY_PREFIX = 'workflow:';
const STORAGE_INDEX_KEY = 'workflow:index';

// In-memory fallback for SSR
const inMemoryStore = new Map<string, string>();

// ============================================================================
// Storage Abstraction
// ============================================================================

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function storageSetItem(key: string, value: string): void {
  if (isLocalStorageAvailable()) {
    localStorage.setItem(key, value);
  } else {
    inMemoryStore.set(key, value);
  }
}

function storageGetItem(key: string): string | null {
  if (isLocalStorageAvailable()) {
    return localStorage.getItem(key);
  } else {
    return inMemoryStore.get(key) || null;
  }
}

function storageRemoveItem(key: string): void {
  if (isLocalStorageAvailable()) {
    localStorage.removeItem(key);
  } else {
    inMemoryStore.delete(key);
  }
}

function storageKeys(): string[] {
  if (isLocalStorageAvailable()) {
    return Object.keys(localStorage);
  } else {
    return Array.from(inMemoryStore.keys());
  }
}

// ============================================================================
// JSON Schema Guards
// ============================================================================

function isValidWorkflow(data: unknown): data is Workflow {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const workflow = data as Record<string, unknown>;

  // Check metadata
  if (!workflow.metadata || typeof workflow.metadata !== 'object') {
    return false;
  }
  const metadata = workflow.metadata as Record<string, unknown>;
  if (
    typeof metadata.id !== 'string' ||
    typeof metadata.name !== 'string' ||
    typeof metadata.version !== 'string' ||
    typeof metadata.createdAt !== 'string' ||
    typeof metadata.updatedAt !== 'string'
  ) {
    return false;
  }

  // Check nodes
  if (!Array.isArray(workflow.nodes)) {
    return false;
  }

  // Check edges
  if (!Array.isArray(workflow.edges)) {
    return false;
  }

  // Check ports
  if (!Array.isArray(workflow.ports)) {
    return false;
  }

  return true;
}

// Reserved for future use - validates workflow metadata structure
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isValidWorkflowMetadata(data: unknown): data is WorkflowMetadata {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const metadata = data as Record<string, unknown>;
  return (
    typeof metadata.id === 'string' &&
    typeof metadata.name === 'string' &&
    typeof metadata.version === 'string' &&
    typeof metadata.createdAt === 'string' &&
    typeof metadata.updatedAt === 'string'
  );
}

// ============================================================================
// Workflow Index Management
// ============================================================================

interface WorkflowIndex {
  [workflowId: string]: WorkflowMetadata;
}

function getWorkflowIndex(): WorkflowIndex {
  const indexData = storageGetItem(STORAGE_INDEX_KEY);
  if (!indexData) {
    return {};
  }

  try {
    const parsed = JSON.parse(indexData);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as WorkflowIndex;
    }
  } catch {
    // Invalid JSON, return empty index
  }

  return {};
}

function updateWorkflowIndex(workflowId: string, metadata: WorkflowMetadata): void {
  const index = getWorkflowIndex();
  index[workflowId] = metadata;
  storageSetItem(STORAGE_INDEX_KEY, JSON.stringify(index));
}

function removeFromWorkflowIndex(workflowId: string): void {
  const index = getWorkflowIndex();
  delete index[workflowId];
  storageSetItem(STORAGE_INDEX_KEY, JSON.stringify(index));
}

// ============================================================================
// Public API
// ============================================================================

export function saveWorkflow(workflow: Workflow): void {
  if (!isValidWorkflow(workflow)) {
    throw new Error('Invalid workflow data');
  }

  const key = `${STORAGE_KEY_PREFIX}${workflow.metadata.id}`;
  const serialized = JSON.stringify(workflow);

  storageSetItem(key, serialized);
  updateWorkflowIndex(workflow.metadata.id, workflow.metadata);
}

export function loadWorkflow(workflowId: string): Workflow | null {
  const key = `${STORAGE_KEY_PREFIX}${workflowId}`;
  const data = storageGetItem(key);

  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    if (isValidWorkflow(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid JSON
  }

  return null;
}

export function deleteWorkflow(workflowId: string): void {
  const key = `${STORAGE_KEY_PREFIX}${workflowId}`;
  storageRemoveItem(key);
  removeFromWorkflowIndex(workflowId);
}

export function listWorkflows(): WorkflowMetadata[] {
  const index = getWorkflowIndex();
  return Object.values(index).sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function workflowExists(workflowId: string): boolean {
  const key = `${STORAGE_KEY_PREFIX}${workflowId}`;
  return storageGetItem(key) !== null;
}

export function clearAllWorkflows(): void {
  const keys = storageKeys();
  keys.forEach(key => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      storageRemoveItem(key);
    }
  });
  storageRemoveItem(STORAGE_INDEX_KEY);
}

export function exportWorkflow(workflowId: string): string | null {
  const workflow = loadWorkflow(workflowId);
  if (!workflow) {
    return null;
  }
  return JSON.stringify(workflow, null, 2);
}

export function importWorkflow(json: string): Workflow {
  try {
    const parsed = JSON.parse(json);
    if (!isValidWorkflow(parsed)) {
      throw new Error('Invalid workflow format');
    }

    // Update timestamps
    parsed.metadata.updatedAt = new Date().toISOString();

    saveWorkflow(parsed);
    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to import workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Storage Statistics
// ============================================================================

export interface StorageStats {
  totalWorkflows: number;
  storageType: 'localStorage' | 'inMemory';
  isAvailable: boolean;
}

export function getStorageStats(): StorageStats {
  const workflows = listWorkflows();
  return {
    totalWorkflows: workflows.length,
    storageType: isLocalStorageAvailable() ? 'localStorage' : 'inMemory',
    isAvailable: isLocalStorageAvailable() || true,
  };
}
