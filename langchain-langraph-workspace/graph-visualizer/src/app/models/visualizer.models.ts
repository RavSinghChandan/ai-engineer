// ── Core model types for the Graph Visualizer ─────────────────────────────
// These are the ONLY contracts adapters must satisfy.
// No framework-specific imports — pure TypeScript.

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface FlowNode {
  id: string;
  label: string;
  icon: string;       // single char or emoji
  status: StepStatus;
  color: string;      // hex — used for active/done accent
}

export interface ExecutionStep {
  id: number;
  name: string;
  description: string;
  file: string;
  functionName: string;
  code: string;
  highlightLine: number;
  nodeId: string;           // must match a FlowNode.id
  status: StepStatus;
  badge?: string;
  lineOutputs?: Record<number, string>;  // line → hover tooltip
  breakpoints?: number[];                // pre-set breakpoint lines
  callStack?: CallFrame[];               // simulated call stack
}

export interface CallFrame {
  file: string;
  fn: string;
  line: number;
}

// ── Form field definition ─────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'toggle' | 'file';

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  default?: any;
  options?: string[];
  accept?: string;
}

// ── Endpoint definition ───────────────────────────────────────────────────

export interface EndpointDef {
  id: string;
  label: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  emoji: string;
  tagline: string;
  color: string;
  fields: FormField[];
  buildSteps(form: Record<string, any>): ExecutionStep[];
  buildBody(form: Record<string, any>): any;
}

// ── Adapter config — the ONLY thing a project needs to provide ────────────

export interface VisualizerAdapter {
  // Branding
  productName: string;       // e.g. "LangGraph Visualizer"
  productTagline: string;    // e.g. "Banking AI Platform"
  accentWord: string;        // colored word in product name
  accentColor: string;       // hex
  topBadges: string[];       // up to 4 badge labels
  presenterName?: string;
  presenterRole?: string;
  presenterAvatar?: string;  // URL or base64

  // Backend
  backendUrl: string;        // e.g. "http://localhost:8001"

  // Flow definition
  flowNodes: FlowNode[];
  endpoints: EndpointDef[];
}
