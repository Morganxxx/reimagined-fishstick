/**
 * Workflow Execution API Route
 * 
 * Receives a serialized workflow, validates it, calls the runner,
 * and streams or returns progress/results.
 */

import type { Workflow } from '@/types/workflow';
import { runWorkflow } from '@/lib/workflows/runner';
import { validateWorkflowDAG } from '@/lib/workflows/schema';

// ============================================================================
// Environment Validation
// ============================================================================

function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required environment variables
  // Add any required env vars here
  // For now, we'll have no required vars but the pattern is in place

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const limitData = rateLimitStore[identifier];

  if (!limitData || now > limitData.resetTime) {
    rateLimitStore[identifier] = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (limitData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  limitData.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - limitData.count };
}

// ============================================================================
// Request Validation
// ============================================================================

function isValidWorkflow(data: unknown): data is Workflow {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const workflow = data as Record<string, unknown>;

  // Check basic structure
  if (!workflow.metadata || typeof workflow.metadata !== 'object') {
    return false;
  }

  if (!Array.isArray(workflow.nodes)) {
    return false;
  }

  if (!Array.isArray(workflow.edges)) {
    return false;
  }

  if (!Array.isArray(workflow.ports)) {
    return false;
  }

  return true;
}

// ============================================================================
// Response Types
// ============================================================================

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}

interface SuccessResponse {
  success: true;
  data: {
    executionId: string;
    workflowId: string;
    status: string;
    results: unknown[];
    startedAt: string;
    completedAt?: string;
  };
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: Request): Promise<Response> {
  try {
    // Validate environment
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      const response: ErrorResponse = {
        success: false,
        error: {
          message: 'Server configuration error',
          code: 'ENV_ERROR',
          details: envValidation.errors,
        },
      };
      return new Response(JSON.stringify(response), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get client identifier for rate limiting
    const clientId = request.headers.get('x-forwarded-for') ||
      request.headers.get('user-agent') ||
      'anonymous';

    // Check rate limit
    const rateLimitCheck = checkRateLimit(clientId);
    if (!rateLimitCheck.allowed) {
      const response: ErrorResponse = {
        success: false,
        error: {
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        },
      };
      return new Response(JSON.stringify(response), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        },
      });
    }

    // Parse request body
    let workflow: unknown;
    try {
      workflow = await request.json();
    } catch {
      const response: ErrorResponse = {
        success: false,
        error: {
          message: 'Invalid JSON in request body',
          code: 'INVALID_JSON',
        },
      };
      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate workflow structure
    if (!isValidWorkflow(workflow)) {
      const response: ErrorResponse = {
        success: false,
        error: {
          message: 'Invalid workflow structure',
          code: 'INVALID_WORKFLOW',
        },
      };
      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate DAG structure
    const validation = validateWorkflowDAG(workflow.nodes, workflow.edges);
    if (!validation.valid) {
      const response: ErrorResponse = {
        success: false,
        error: {
          message: 'Workflow validation failed',
          code: 'INVALID_WORKFLOW_DAG',
          details: validation.errors,
        },
      };
      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Run the workflow
    const execution = await runWorkflow(workflow);

    const response: SuccessResponse = {
      success: true,
      data: {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        status: execution.status,
        results: execution.results,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(rateLimitCheck.remaining),
      },
    });
  } catch (error) {
    const response: ErrorResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.stack : undefined,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============================================================================
// GET Handler (Status/Info)
// ============================================================================

export async function GET(): Promise<Response> {
  const response = {
    status: 'ok',
    message: 'Workflow execution API',
    endpoints: {
      post: 'POST /api/workflows/run - Execute a workflow',
      get: 'GET /api/workflows/run - Get API info',
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
