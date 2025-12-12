/**
 * Runner Tests
 * 
 * Unit tests for workflow execution, error propagation, and event handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Workflow, WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { WorkflowRunner, type ExecutionEvent } from './runner';
import { registerNode } from '@/lib/nodes/registry';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestNode(id: string, type: string = 'text'): WorkflowNode {
  return {
    id,
    type: type as 'text' | 'image' | 'video',
    position: { x: 0, y: 0 },
    data: {
      label: `Node ${id}`,
    },
  };
}

function createTestEdge(
  source: string,
  target: string
): WorkflowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
  };
}

function createTestWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[] = []
): Workflow {
  return {
    metadata: {
      id: 'test-workflow',
      name: 'Test Workflow',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    nodes,
    edges,
    ports: [],
  };
}

// ============================================================================
// Runner Tests
// ============================================================================

describe('WorkflowRunner', () => {
  beforeEach(() => {
    // Register test executors
    registerNode(
      'test',
      async (config, inputs) => {
        return {
          nodeId: config.nodeId,
          input: inputs,
          output: 'test-result',
        };
      }
    );

    registerNode(
      'failing',
      async () => {
        throw new Error('Deliberate test error');
      }
    );

    registerNode(
      'slow',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: 'slow-result' };
      }
    );
  });

  it('should execute simple workflow', async () => {
    const nodes = [createTestNode('node1', 'text')];
    const workflow = createTestWorkflow(nodes);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    expect(execution.status).toBe('success');
    expect(execution.results).toHaveLength(1);
    expect(execution.results[0].nodeId).toBe('node1');
    expect(execution.results[0].status).toBe('success');
  });

  it('should execute workflow with multiple nodes in order', async () => {
    const nodes = [
      createTestNode('node1', 'text'),
      createTestNode('node2', 'text'),
      createTestNode('node3', 'text'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node2', 'node3'),
    ];
    const workflow = createTestWorkflow(nodes, edges);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    expect(execution.status).toBe('success');
    expect(execution.results).toHaveLength(3);
    // Verify execution order
    const times: { [key: string]: number } = {};
    execution.results.forEach((result, index) => {
      times[result.nodeId] = index;
    });
    expect(times['node1']).toBeLessThan(times['node2']);
    expect(times['node2']).toBeLessThan(times['node3']);
  });

  it('should handle error in node execution', async () => {
    const nodes = [createTestNode('node1', 'failing')];
    const workflow = createTestWorkflow(nodes);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    expect(execution.status).toBe('error');
    expect(execution.results).toHaveLength(1);
    expect(execution.results[0].status).toBe('error');
    expect(execution.results[0].error?.message).toContain('Deliberate test error');
  });

  it('should handle error propagation in workflow', async () => {
    const nodes = [
      createTestNode('node1', 'failing'),
      createTestNode('node2', 'text'),
    ];
    const edges = [createTestEdge('node1', 'node2')];
    const workflow = createTestWorkflow(nodes, edges);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    expect(execution.status).toBe('error');
    // node1 should fail
    const node1Result = execution.results.find(r => r.nodeId === 'node1');
    expect(node1Result?.status).toBe('error');
  });

  it('should emit execution events', async () => {
    const nodes = [createTestNode('node1', 'text')];
    const workflow = createTestWorkflow(nodes);

    const events: ExecutionEvent[] = [];
    const runner = new WorkflowRunner(workflow, {
      onEvent: (event) => {
        events.push(event);
      },
    });

    await runner.run();

    // Should have queued and running events
    const nodeIds = events.map(e => e.nodeId);
    expect(nodeIds).toContain('node1');
    const statuses = events.map(e => e.status);
    expect(statuses).toContain('queued');
    expect(statuses).toContain('running');
    expect(statuses).toContain('succeeded');
  });

  it('should track execution duration', async () => {
    const nodes = [createTestNode('node1', 'slow')];
    const workflow = createTestWorkflow(nodes);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    const result = execution.results[0];
    expect(result.duration).toBeDefined();
    expect(result.duration).toBeGreaterThanOrEqual(100);
  });

  it('should handle timeout for slow nodes', async () => {
    const nodes = [createTestNode('node1', 'slow')];
    const workflow = createTestWorkflow(nodes);

    const runner = new WorkflowRunner(workflow, {
      timeoutMs: 50, // Very short timeout
    });

    const execution = await runner.run();

    expect(execution.status).toBe('error');
    const result = execution.results.find(r => r.nodeId === 'node1');
    expect(result?.status).toBe('error');
    expect(result?.error?.message).toContain('timeout');
  });

  it('should generate unique execution IDs', () => {
    const workflow = createTestWorkflow([createTestNode('node1', 'text')]);

    const runner1 = new WorkflowRunner(workflow);
    const runner2 = new WorkflowRunner(workflow);

    expect(runner1.getExecutionId()).not.toBe(runner2.getExecutionId());
  });

  it('should handle workflow with no edges', async () => {
    const nodes = [
      createTestNode('node1', 'text'),
      createTestNode('node2', 'text'),
    ];
    const workflow = createTestWorkflow(nodes, []);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    expect(execution.status).toBe('success');
    expect(execution.results).toHaveLength(2);
  });

  it('should handle branching execution paths', async () => {
    const nodes = [
      createTestNode('node1', 'text'),
      createTestNode('node2', 'text'),
      createTestNode('node3', 'text'),
      createTestNode('node4', 'text'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node1', 'node3'),
      createTestEdge('node2', 'node4'),
      createTestEdge('node3', 'node4'),
    ];
    const workflow = createTestWorkflow(nodes, edges);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    expect(execution.status).toBe('success');
    expect(execution.results).toHaveLength(4);
    // All nodes should have succeeded
    expect(execution.results.every(r => r.status === 'success')).toBe(true);
  });

  it('should include node execution startedAt and completedAt times', async () => {
    const nodes = [createTestNode('node1', 'text')];
    const workflow = createTestWorkflow(nodes);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    const result = execution.results[0];
    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    
    // Verify the dates are valid ISO strings
    expect(new Date(result.startedAt!).getTime()).toBeGreaterThan(0);
    expect(new Date(result.completedAt!).getTime()).toBeGreaterThan(0);
  });

  it('should propagate error details', async () => {
    const nodes = [createTestNode('node1', 'failing')];
    const workflow = createTestWorkflow(nodes);

    const runner = new WorkflowRunner(workflow);
    const execution = await runner.run();

    const result = execution.results[0];
    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBeDefined();
    expect(result.error?.code).toBe('EXECUTION_ERROR');
  });
});
