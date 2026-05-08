export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface ExecutionStep {
  id: number;
  name: string;
  description: string;
  file: string;
  functionName: string;
  code: string;
  highlightLine: number;
  nodeId: string;
  status: StepStatus;
  toolUsed?: string;
  badge?: string;
  lineOutputs?: Record<number, string>; // line number → hover output value
}

export interface FlowNode {
  id: string;
  label: string;
  icon: string;
  status: StepStatus;
  color: string;
}
