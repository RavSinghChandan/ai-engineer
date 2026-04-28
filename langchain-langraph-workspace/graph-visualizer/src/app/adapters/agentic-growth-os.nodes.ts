import { FlowNode } from '../models/visualizer.models';

export const AGENTIC_GROWTH_OS_NODES: FlowNode[] = [
  { id: 'user',        label: 'User',        icon: 'U',  status: 'pending', color: '#0071e3' },
  { id: 'routes',      label: 'Routes',      icon: 'R',  status: 'pending', color: '#5e5ce6' },
  { id: 'memory',      label: 'Memory',      icon: 'M',  status: 'pending', color: '#30d158' },
  { id: 'audience',    label: 'Audience',    icon: 'A',  status: 'pending', color: '#ff9f0a' },
  { id: 'ad-copy',     label: 'Ad Copy',     icon: '✍',  status: 'pending', color: '#bf5af2' },
  { id: 'budget',      label: 'Budget',      icon: '₹',  status: 'pending', color: '#ff375f' },
  { id: 'campaign',    label: 'Campaign',    icon: '📢',  status: 'pending', color: '#0a84ff' },
  { id: 'performance', label: 'Performance', icon: '📈',  status: 'pending', color: '#64d2ff' },
  { id: 'response',    label: 'Done',        icon: '✓',  status: 'pending', color: '#34c759' },
];
