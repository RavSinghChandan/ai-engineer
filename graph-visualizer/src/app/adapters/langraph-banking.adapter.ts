import { VisualizerAdapter } from '../models/visualizer.models';
import { FLOW_NODES } from './langraph-banking.nodes';
import { ENDPOINT_CONFIGS } from './langraph-banking.endpoints';

export const LangraphBankingAdapter: VisualizerAdapter = {
  productName:    'AI with Rav',
  productTagline: 'Banking AI Platform — graph execution & debugging',
  accentWord:     'Engine',
  accentColor:    '#6366f1',
  topBadges:      ['Banking AI', 'LangGraph • Agents • RAG', 'Python • FastAPI', 'Production Ready'],
  presenterName:  'Chandan Kumar',
  presenterRole:  'AI Systems Engineer',

  backendUrl: 'http://localhost:8001',

  flowNodes: FLOW_NODES,
  endpoints: ENDPOINT_CONFIGS,
};
