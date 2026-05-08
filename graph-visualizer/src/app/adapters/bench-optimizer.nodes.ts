import { FlowNode } from '../models/visualizer.models';

export const BENCH_OPTIMIZER_NODES: FlowNode[] = [
  { id: 'user',      label: 'User',      icon: 'U',  status: 'pending', color: '#0071e3' },
  { id: 'routes',    label: 'Routes',    icon: 'R',  status: 'pending', color: '#5e5ce6' },
  { id: 'llm',       label: 'DeepSeek',  icon: 'L',  status: 'pending', color: '#ff9f0a' },
  { id: 'cv-agent',  label: 'CV Agent',  icon: 'C',  status: 'pending', color: '#bf5af2' },
  { id: 'rag',       label: 'RAG',       icon: '⟳',  status: 'pending', color: '#ff375f' },
  { id: 'plan',      label: 'Planner',   icon: 'P',  status: 'pending', color: '#0a84ff' },
  { id: 'storage',   label: 'Storage',   icon: 'S',  status: 'pending', color: '#64d2ff' },
  { id: 'response',  label: 'Done',      icon: '✓',  status: 'pending', color: '#34c759' },
];
