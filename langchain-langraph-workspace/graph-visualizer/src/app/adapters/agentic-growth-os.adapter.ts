import { VisualizerAdapter } from '../models/visualizer.models';
import { AGENTIC_GROWTH_OS_NODES } from './agentic-growth-os.nodes';
import { AGENTIC_GROWTH_OS_ENDPOINT_CONFIGS } from './agentic-growth-os.endpoints';

export const AgenticGrowthOSAdapter: VisualizerAdapter = {
  productName:    'AI with Rav',
  productTagline: 'Agentic Growth OS — AI-powered ad campaign pipeline',
  accentWord:     'Growth',
  accentColor:    '#10b981',
  topBadges:      ['Agentic Growth OS', 'LangGraph • 5 Nodes', 'Python • FastAPI', 'Self-Learning AI'],
  presenterName:  'Chandan Kumar',
  presenterRole:  'AI Systems Engineer',

  backendUrl: 'http://localhost:8000',

  flowNodes: AGENTIC_GROWTH_OS_NODES,
  endpoints: AGENTIC_GROWTH_OS_ENDPOINT_CONFIGS,
};
