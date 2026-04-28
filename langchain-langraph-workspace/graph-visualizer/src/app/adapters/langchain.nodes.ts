import { FlowNode } from '../models/visualizer.models';

export const LANGCHAIN_FLOW_NODES: FlowNode[] = [
  { id: 'user',       label: 'User',       icon: 'U',  status: 'pending', color: '#0071e3' },
  { id: 'routes',     label: 'Routes',     icon: 'R',  status: 'pending', color: '#5e5ce6' },
  { id: 'llm-router', label: 'LLM Router', icon: '⇌',  status: 'pending', color: '#ff9f0a' },
  { id: 'chain',      label: 'Chain',      icon: '⛓',  status: 'pending', color: '#bf5af2' },
  { id: 'tool',       label: 'Tool',       icon: 'T',  status: 'pending', color: '#64d2ff' },
  { id: 'rag',        label: 'RAG',        icon: '⟳',  status: 'pending', color: '#ff375f' },
  { id: 'memory',     label: 'Memory',     icon: 'M',  status: 'pending', color: '#30d158' },
  { id: 'response',   label: 'Done',       icon: '✓',  status: 'pending', color: '#34c759' },
];
