/**
 * Executor Tests
 * 
 * Unit tests for cycle detection, execution planning, and input/output resolution
 */

import { describe, it, expect } from 'vitest';
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
} from '@/types/workflow';
import {
  checkForCycles,
  buildExecutionPlan,
  resolveNodeInputs,
  getNodeDependencies,
  getNodeDependents,
} from './executor';

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
  target: string,
  id?: string
): WorkflowEdge {
  return {
    id: id || `${source}->${target}`,
    source,
    target,
  };
}

function createTestWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
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
// Cycle Detection Tests
// ============================================================================

describe('Cycle Detection', () => {
  it('should detect no cycle in empty graph', () => {
    const workflow = createTestWorkflow([], []);
    const result = checkForCycles(workflow.nodes, workflow.edges);
    expect(result.hasCycle).toBe(false);
  });

  it('should detect no cycle in single node', () => {
    const nodes = [createTestNode('node1')];
    const workflow = createTestWorkflow(nodes, []);
    const result = checkForCycles(workflow.nodes, workflow.edges);
    expect(result.hasCycle).toBe(false);
  });

  it('should detect no cycle in linear graph', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node2', 'node3'),
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const result = checkForCycles(workflow.nodes, workflow.edges);
    expect(result.hasCycle).toBe(false);
  });

  it('should detect cycle in self-loop', () => {
    const nodes = [createTestNode('node1')];
    const edges = [createTestEdge('node1', 'node1')];
    const workflow = createTestWorkflow(nodes, edges);
    const result = checkForCycles(workflow.nodes, workflow.edges);
    expect(result.hasCycle).toBe(true);
    expect(result.cycle).toContain('node1');
  });

  it('should detect cycle in 2-node cycle', () => {
    const nodes = [createTestNode('node1'), createTestNode('node2')];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node2', 'node1'),
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const result = checkForCycles(workflow.nodes, workflow.edges);
    expect(result.hasCycle).toBe(true);
  });

  it('should detect cycle in larger graph', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
      createTestNode('node4'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node2', 'node3'),
      createTestEdge('node3', 'node4'),
      createTestEdge('node4', 'node2'), // Creates cycle: 2 -> 3 -> 4 -> 2
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const result = checkForCycles(workflow.nodes, workflow.edges);
    expect(result.hasCycle).toBe(true);
  });
});

// ============================================================================
// Execution Plan Tests
// ============================================================================

describe('Execution Plan', () => {
  it('should create valid plan for single node', () => {
    const nodes = [createTestNode('node1')];
    const workflow = createTestWorkflow(nodes, []);
    const plan = buildExecutionPlan(workflow);
    expect(plan.valid).toBe(true);
    expect(plan.errors).toHaveLength(0);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].nodeId).toBe('node1');
  });

  it('should create valid plan for linear graph', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node2', 'node3'),
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const plan = buildExecutionPlan(workflow);
    expect(plan.valid).toBe(true);
    expect(plan.nodes).toHaveLength(3);
    // Check topological order
    expect(plan.nodes[0].nodeId).toBe('node1');
    expect(plan.nodes[1].nodeId).toBe('node2');
    expect(plan.nodes[2].nodeId).toBe('node3');
  });

  it('should set correct dependencies', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node1', 'node3'),
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const plan = buildExecutionPlan(workflow);
    expect(plan.valid).toBe(true);
    const node2Context = plan.nodes.find(c => c.nodeId === 'node2');
    const node3Context = plan.nodes.find(c => c.nodeId === 'node3');
    expect(node2Context?.dependencies).toContain('node1');
    expect(node3Context?.dependencies).toContain('node1');
  });

  it('should reject workflow with cycle', () => {
    const nodes = [createTestNode('node1'), createTestNode('node2')];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node2', 'node1'),
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const plan = buildExecutionPlan(workflow);
    expect(plan.valid).toBe(false);
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.errors[0]).toContain('cycle');
  });

  it('should handle branching execution paths', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
      createTestNode('node4'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node1', 'node3'),
      createTestEdge('node2', 'node4'),
      createTestEdge('node3', 'node4'),
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const plan = buildExecutionPlan(workflow);
    expect(plan.valid).toBe(true);
    expect(plan.nodes).toHaveLength(4);
    // Verify node1 is first
    expect(plan.nodes[0].nodeId).toBe('node1');
    // Verify node4 is last
    expect(plan.nodes[3].nodeId).toBe('node4');
  });
});

// ============================================================================
// Input/Output Resolution Tests
// ============================================================================

describe('Input/Output Resolution', () => {
  it('should resolve inputs from single dependency', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
    ];
    const edges = [createTestEdge('node1', 'node2')];
    const workflow = createTestWorkflow(nodes, edges);
    const plan = buildExecutionPlan(workflow);

    const context = plan.nodes.find(c => c.nodeId === 'node2')!;
    const completedNodes = [
      {
        nodeId: 'node1',
        output: { result: 'test-value' },
      },
    ];

    const inputs = resolveNodeInputs(
      context,
      completedNodes,
      workflow.edges,
      workflow.ports
    );

    expect(inputs.result).toBe('test-value');
  });

  it('should resolve inputs from multiple dependencies', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
    ];
    const edges = [
      createTestEdge('node1', 'node3'),
      createTestEdge('node2', 'node3'),
    ];
    const workflow = createTestWorkflow(nodes, edges);
    const plan = buildExecutionPlan(workflow);

    const context = plan.nodes.find(c => c.nodeId === 'node3')!;
    const completedNodes = [
      {
        nodeId: 'node1',
        output: { value1: 'first' },
      },
      {
        nodeId: 'node2',
        output: { value2: 'second' },
      },
    ];

    const inputs = resolveNodeInputs(
      context,
      completedNodes,
      workflow.edges,
      workflow.ports
    );

    expect(inputs.value1).toBe('first');
    expect(inputs.value2).toBe('second');
  });

  it('should handle empty inputs for nodes without dependencies', () => {
    const nodes = [createTestNode('node1')];
    const workflow = createTestWorkflow(nodes, []);
    const plan = buildExecutionPlan(workflow);

    const context = plan.nodes[0];
    const inputs = resolveNodeInputs(
      context,
      [],
      workflow.edges,
      workflow.ports
    );

    expect(Object.keys(inputs)).toHaveLength(0);
  });

  it('should handle missing dependency outputs gracefully', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
    ];
    const edges = [createTestEdge('node1', 'node2')];
    const workflow = createTestWorkflow(nodes, edges);
    const plan = buildExecutionPlan(workflow);

    const context = plan.nodes.find(c => c.nodeId === 'node2')!;
    const completedNodes: Record<string, unknown>[] = []; // Missing node1

    const inputs = resolveNodeInputs(
      context,
      completedNodes,
      workflow.edges,
      workflow.ports
    );

    // Should return empty inputs or handle gracefully
    expect(inputs).toBeDefined();
  });
});

// ============================================================================
// Dependency Tracking Tests
// ============================================================================

describe('Dependency Tracking', () => {
  it('should get direct dependencies', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
    ];
    const edges = [
      createTestEdge('node1', 'node3'),
      createTestEdge('node2', 'node3'),
    ];
    const workflow = createTestWorkflow(nodes, edges);

    const deps = getNodeDependencies('node3', workflow.edges);
    expect(deps).toContain('node1');
    expect(deps).toContain('node2');
    expect(deps).toHaveLength(2);
  });

  it('should get node dependents', () => {
    const nodes = [
      createTestNode('node1'),
      createTestNode('node2'),
      createTestNode('node3'),
    ];
    const edges = [
      createTestEdge('node1', 'node2'),
      createTestEdge('node1', 'node3'),
    ];
    const workflow = createTestWorkflow(nodes, edges);

    const dependents = getNodeDependents('node1', workflow.edges);
    expect(dependents).toContain('node2');
    expect(dependents).toContain('node3');
    expect(dependents).toHaveLength(2);
  });

  it('should return empty for nodes with no dependencies', () => {
    const nodes = [createTestNode('node1')];
    const workflow = createTestWorkflow(nodes, []);

    const deps = getNodeDependencies('node1', workflow.edges);
    expect(deps).toHaveLength(0);
  });
});
