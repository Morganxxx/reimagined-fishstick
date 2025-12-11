This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Workflow Architecture

This application includes a comprehensive workflow system with the following components:

### Type System (`types/workflow.ts`)

Defines the core workflow domain types including:
- **Node Types**: Discriminated unions for text, image, and video nodes
- **Port Definitions**: Input/output port specifications with data types
- **Edge Objects**: Connections between nodes with source/target references
- **Workflow Metadata**: Versioning, timestamps, and workflow information
- **Parameter Schema**: Typed parameter definitions for node configuration
- **Run Result Envelopes**: Status tracking and execution results

### Schema Helpers (`lib/workflows/schema.ts`)

Provides utilities for workflow manipulation:
- **Node Creation**: Factory functions for creating typed nodes
- **DAG Validation**: Ensures workflows remain acyclic (no circular dependencies)
- **Port Management**: Computing inbound/outbound ports for nodes
- **Topological Sort**: Determines execution order for workflow runs
- **Edge Management**: Creating and validating connections between nodes

### Storage Layer (`lib/workflows/storage.ts`)

Handles persistence with automatic fallbacks:
- **localStorage Backend**: Browser-based persistence for client-side workflows
- **SSR Fallback**: In-memory store when localStorage is unavailable
- **JSON Schema Guards**: Type-safe serialization/deserialization
- **CRUD Operations**: Load, save, delete, and list workflows
- **Import/Export**: JSON-based workflow sharing

### State Management

#### Workflow Builder Hook (`hooks/useWorkflowBuilder.ts`)
- **Builder State**: Tracks nodes, edges, ports, selection, and dirty state
- **Actions**: Add/remove/connect/configure operations
- **Auto-save**: Automatic persistence with debouncing
- **Validation**: Real-time DAG constraint checking
- **Selection Management**: Multi-select support for nodes and edges

#### Workflow Provider (`context/WorkflowProvider.tsx`)
- **React Context**: Exposes workflow builder to component tree
- **Type Safety**: Fully typed context API
- **Error Handling**: Validates provider usage

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     WorkflowProvider                         │
│                  (React Context Layer)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  useWorkflowBuilder Hook                     │
│  • State Management (nodes, edges, ports, selection)        │
│  • Actions (add, remove, connect, configure)                │
│  • Auto-save with debouncing                                │
│  • Real-time validation                                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
    ┌─────────────────────┐ ┌─────────────────────┐
    │  Schema Helpers     │ │  Storage Layer      │
    │  • createNode()     │ │  • saveWorkflow()   │
    │  • validateDAG()    │ │  • loadWorkflow()   │
    │  • createEdge()     │ │  • localStorage     │
    │  • topologicalSort()│ │  • in-memory store  │
    └─────────────────────┘ └─────────────────────┘
                │                       │
                └───────────┬───────────┘
                            ▼
                ┌─────────────────────┐
                │  Type Definitions   │
                │  • WorkflowNode     │
                │  • WorkflowEdge     │
                │  • PortDefinition   │
                │  • Workflow         │
                └─────────────────────┘
```

### Persistence Notes

- **Automatic Saving**: Changes are auto-saved 2 seconds after the last modification
- **Storage Location**: Browser localStorage (client-side) with SSR-safe fallback
- **Data Format**: JSON with schema validation
- **Versioning**: Workflow metadata includes version tracking
- **Timestamps**: Created/updated timestamps for all workflows

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
