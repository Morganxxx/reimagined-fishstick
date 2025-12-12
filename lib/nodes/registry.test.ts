/**
 * Registry Tests
 * 
 * Unit tests for node registration and execution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { NodeExecutionConfig } from '@/lib/nodes/registry';
import {
  registerNode,
  getNodeExecutor,
  isNodeTypeRegistered,
  getRegisteredNodeTypes,
} from '@/lib/nodes/registry';

// ============================================================================
// Registry Tests
// ============================================================================

describe('Node Registry', () => {
  beforeEach(() => {
    // Clear registry and re-register built-in nodes
    // Note: This is a simplified approach since we're testing the registration mechanism
  });

  it('should register a new node type', () => {
    const executor = async () => ({ result: 'test' });
    registerNode('custom', executor, 'Custom node for testing');

    expect(isNodeTypeRegistered('custom')).toBe(true);
  });

  it('should retrieve registered executor', async () => {
    const expectedOutput = { result: 'custom-result' };
    const executor = async () => expectedOutput;
    registerNode('mynode', executor);

    const retrieved = getNodeExecutor('mynode');
    expect(retrieved).toBeDefined();
    expect(retrieved).toBe(executor);
  });

  it('should return null for unregistered node type', () => {
    const executor = getNodeExecutor('nonexistent-type');
    expect(executor).toBeNull();
  });

  it('should list registered node types', () => {
    const types = getRegisteredNodeTypes();
    expect(Array.isArray(types)).toBe(true);
    // Built-in types should be registered
    expect(types).toContain('text');
    expect(types).toContain('image');
    expect(types).toContain('video');
  });

  it('should execute registered node', async () => {
    registerNode(
      'test-executor',
      async (config, inputs) => {
        return {
          nodeId: config.nodeId,
          inputs,
          processed: true,
        };
      }
    );

    const executor = getNodeExecutor('test-executor');
    expect(executor).not.toBeNull();

    const config: NodeExecutionConfig = {
      nodeId: 'node1',
      nodeType: 'test-executor',
      nodeData: { label: 'Test Node' },
    };

    const result = await executor!(config, { input1: 'value1' });
    expect(result.nodeId).toBe('node1');
    expect(result.processed).toBe(true);
  });

  it('should handle executor that transforms inputs', async () => {
    registerNode(
      'transformer',
      async (config, inputs) => {
        return {
          transformed: true,
          inputKeys: Object.keys(inputs),
          nodeData: config.nodeData,
        };
      }
    );

    const executor = getNodeExecutor('transformer');
    const config: NodeExecutionConfig = {
      nodeId: 'node1',
      nodeType: 'transformer',
      nodeData: { label: 'Transformer', value: 42 },
    };

    const result = await executor!(config, { key1: 'val1', key2: 'val2' });
    expect(result.transformed).toBe(true);
    expect(result.inputKeys).toContain('key1');
    expect(result.inputKeys).toContain('key2');
  });

  it('should provide error information from executor', async () => {
    registerNode(
      'error-node',
      async () => {
        throw new Error('Custom executor error');
      }
    );

    const executor = getNodeExecutor('error-node');
    const config: NodeExecutionConfig = {
      nodeId: 'node1',
      nodeType: 'error-node',
      nodeData: { label: 'Error Node' },
    };

    await expect(executor!(config, {})).rejects.toThrow('Custom executor error');
  });

  it('should allow overriding node type', async () => {
    const executor1 = async () => ({ version: 1 });
    const executor2 = async () => ({ version: 2 });

    registerNode('override-test', executor1);
    let result = await getNodeExecutor('override-test')!(
      {
        nodeId: 'n',
        nodeType: 'override-test',
        nodeData: {},
      },
      {}
    );
    expect(result.version).toBe(1);

    registerNode('override-test', executor2);
    result = await getNodeExecutor('override-test')!(
      {
        nodeId: 'n',
        nodeType: 'override-test',
        nodeData: {},
      },
      {}
    );
    expect(result.version).toBe(2);
  });

  it('should handle text node built-in executor', async () => {
    const executor = getNodeExecutor('text');
    expect(executor).not.toBeNull();

    const config: NodeExecutionConfig = {
      nodeId: 'text-node-1',
      nodeType: 'text',
      nodeData: {
        label: 'My Text',
        content: 'Hello World',
      },
    };

    const result = await executor!(config, {});
    expect(result.content).toBe('Hello World');
    expect(result.label).toBe('My Text');
  });

  it('should handle image node built-in executor', async () => {
    const executor = getNodeExecutor('image');
    expect(executor).not.toBeNull();

    const config: NodeExecutionConfig = {
      nodeId: 'image-node-1',
      nodeType: 'image',
      nodeData: {
        label: 'My Image',
        url: 'https://example.com/image.jpg',
        alt: 'Example image',
        width: 800,
        height: 600,
      },
    };

    const result = await executor!(config, {});
    expect(result.url).toBe('https://example.com/image.jpg');
    expect(result.alt).toBe('Example image');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('should handle video node built-in executor', async () => {
    const executor = getNodeExecutor('video');
    expect(executor).not.toBeNull();

    const config: NodeExecutionConfig = {
      nodeId: 'video-node-1',
      nodeType: 'video',
      nodeData: {
        label: 'My Video',
        url: 'https://example.com/video.mp4',
        format: 'mp4',
        duration: 120,
      },
    };

    const result = await executor!(config, {});
    expect(result.url).toBe('https://example.com/video.mp4');
    expect(result.format).toBe('mp4');
    expect(result.duration).toBe(120);
  });

  it('should merge inputs with node data', async () => {
    registerNode(
      'merger',
      async (config, inputs) => {
        return {
          ...config.nodeData,
          ...inputs,
        };
      }
    );

    const executor = getNodeExecutor('merger');
    const config: NodeExecutionConfig = {
      nodeId: 'node1',
      nodeType: 'merger',
      nodeData: { label: 'Merger', field1: 'from-data' },
    };

    const result = await executor!(config, { field2: 'from-inputs' });
    expect(result.label).toBe('Merger');
    expect(result.field1).toBe('from-data');
    expect(result.field2).toBe('from-inputs');
  });
});
