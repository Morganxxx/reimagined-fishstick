/**
 * Workflow Runner
 * 
 * Orchestrates async node execution, emits status events,
 * aggregates logs, and normalizes outputs into WorkflowRunResult shape.
 */

import type {
  Workflow,
  RunResult,
  WorkflowExecution,
  RunStatus,
} from '@/types/workflow';
import {
  buildExecutionPlan,
  resolveNodeInputs,
  type NodeOutput,
  type ExecutionContext,
} from './executor';
import {
  getNodeExecutor,
  type NodeExecutor,
  type NodeExecutionConfig,
} from '@/lib/nodes/registry';

// ============================================================================
// Event Types
// ============================================================================

export type ExecutionEventType =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ExecutionEvent {
  nodeId: string;
  status: ExecutionEventType;
  timestamp: string;
  output?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
  duration?: number;
  logs?: string[];
}

export type ExecutionEventListener = (event: ExecutionEvent) => void;

// ============================================================================
// Runner Configuration
// ============================================================================

export interface RunnerConfig {
  timeoutMs?: number;
  onEvent?: ExecutionEventListener;
  concurrency?: number;
}

// ============================================================================
// Workflow Runner
// ============================================================================

export class WorkflowRunner {
  private workflow: Workflow;
  private config: RunnerConfig;
  private executionId: string;
  private startTime: Date = new Date();
  private completedNodes: NodeOutput[] = [];
  private results: Map<string, RunResult> = new Map();
  private logs: Map<string, string[]> = new Map();

  constructor(workflow: Workflow, config: RunnerConfig = {}) {
    this.workflow = workflow;
    this.config = {
      timeoutMs: 30000,
      concurrency: 1,
      ...config,
    };
    this.executionId = generateExecutionId();
  }

  getExecutionId(): string {
    return this.executionId;
  }

  async run(): Promise<WorkflowExecution> {
    const startedAt = new Date().toISOString();

    try {
      // Build execution plan
      const plan = buildExecutionPlan(this.workflow);

      if (!plan.valid) {
        return {
          workflowId: this.workflow.metadata.id,
          executionId: this.executionId,
          status: 'error',
          results: plan.errors.map((error, index) => ({
            nodeId: `error-${index}`,
            status: 'error' as const,
            startedAt,
            completedAt: new Date().toISOString(),
            error: {
              message: error,
              code: 'PLAN_ERROR',
            },
          })),
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      // Initialize results for all nodes
      for (const context of plan.nodes) {
        this.results.set(context.nodeId, {
          nodeId: context.nodeId,
          status: 'pending',
          startedAt,
        });
      }

      // Execute nodes in order
      for (const context of plan.nodes) {
        await this.executeNode(context.nodeId, context);
      }

      // Determine overall status
      const hasErrors = Array.from(this.results.values()).some(
        r => r.status === 'error'
      );
      const status: RunStatus = hasErrors ? 'error' : 'success';

      const completedAt = new Date().toISOString();

      return {
        workflowId: this.workflow.metadata.id,
        executionId: this.executionId,
        status,
        results: Array.from(this.results.values()),
        startedAt,
        completedAt,
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      return {
        workflowId: this.workflow.metadata.id,
        executionId: this.executionId,
        status: 'error',
        results: [
          {
            nodeId: 'runner',
            status: 'error',
            startedAt,
            completedAt,
            error: {
              message:
                error instanceof Error ? error.message : 'Unknown error',
              code: 'RUNNER_ERROR',
            },
          },
        ],
        startedAt,
        completedAt,
      };
    }
  }

  private async executeNode(
    nodeId: string,
    context: ExecutionContext
  ): Promise<void> {
    const node = this.workflow.nodes.find(n => n.id === nodeId);
    if (!node) {
      return;
    }

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      // Emit queued event
      this.emitEvent({
        nodeId,
        status: 'queued',
        timestamp: new Date().toISOString(),
      });

      // Update status to running
      const currentResult = this.results.get(nodeId) || {
        nodeId,
        status: 'pending' as const,
      };
      this.results.set(nodeId, {
        ...currentResult,
        status: 'running',
        startedAt,
      });

      // Emit running event
      this.emitEvent({
        nodeId,
        status: 'running',
        timestamp: new Date().toISOString(),
      });

      // Resolve inputs from dependencies
      const inputs = resolveNodeInputs(
        context,
        this.completedNodes,
        this.workflow.edges,
        this.workflow.ports
      );

      // Get executor for node type
      const executor = getNodeExecutor(node.type);
      if (!executor) {
        throw new Error(`No executor registered for node type: ${node.type}`);
      }

      // Execute node with timeout
      const config: NodeExecutionConfig = {
        nodeId,
        nodeType: node.type,
        nodeData: node.data,
      };
      const output = await this.executeWithTimeout(executor, config, inputs);

      const completedAt = new Date().toISOString();
      const duration = Date.now() - startTime;

      // Store completed node output
      this.completedNodes.push({
        nodeId,
        output,
      });

      // Update result
      this.results.set(nodeId, {
        nodeId,
        status: 'success',
        startedAt,
        completedAt,
        duration,
        output,
      });

      // Emit succeeded event
      this.emitEvent({
        nodeId,
        status: 'succeeded',
        timestamp: completedAt,
        output,
        duration,
        logs: this.logs.get(nodeId) || [],
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const duration = Date.now() - startTime;

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (() => {
        if (error instanceof Error && 'code' in error) {
          const code = (error as unknown as Record<string, unknown>).code;
          return typeof code === 'string' ? code : 'EXECUTION_ERROR';
        }
        return 'EXECUTION_ERROR';
      })();

      // Update result
      this.results.set(nodeId, {
        nodeId,
        status: 'error',
        startedAt,
        completedAt,
        duration,
        error: {
          message: errorMessage,
          code: errorCode,
          details: error instanceof Error ? error.stack : undefined,
        },
      });

      // Emit failed event
      this.emitEvent({
        nodeId,
        status: 'failed',
        timestamp: completedAt,
        error: {
          message: errorMessage,
          code: errorCode,
        },
        duration,
        logs: this.logs.get(nodeId) || [],
      });

      // Log the error
      this.addLog(nodeId, `Error: ${errorMessage}`);
    }
  }

  private async executeWithTimeout(
    executor: NodeExecutor,
    config: NodeExecutionConfig,
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const timeoutMs = this.config.timeoutMs || 30000;

    return Promise.race([
      executor(config, inputs),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Execution timeout after ${timeoutMs}ms`
              )
            ),
          timeoutMs
        )
      ),
    ]);
  }

  private emitEvent(event: ExecutionEvent): void {
    if (this.config.onEvent) {
      this.config.onEvent(event);
    }
  }

  private addLog(nodeId: string, message: string): void {
    if (!this.logs.has(nodeId)) {
      this.logs.set(nodeId, []);
    }
    this.logs.get(nodeId)!.push(message);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createRunner(
  workflow: Workflow,
  config?: RunnerConfig
): WorkflowRunner {
  return new WorkflowRunner(workflow, config);
}

export async function runWorkflow(
  workflow: Workflow,
  config?: RunnerConfig
): Promise<WorkflowExecution> {
  const runner = new WorkflowRunner(workflow, config);
  return runner.run();
}
