import { VisualizerAdapter } from '../models/visualizer.models';
import { LANGCHAIN_FLOW_NODES } from './langchain.nodes';
import { LANGCHAIN_ENDPOINT_CONFIGS } from './langchain.endpoints';

export const LangChainAdapter: VisualizerAdapter = {
  productName:    'AI with Rav',
  productTagline: 'LangChain AI Service — chains, agents, RAG & memory',
  accentWord:     'Chain',
  accentColor:    '#f59e0b',
  topBadges:      ['LangChain', 'Agents • RAG • Memory', 'Python • FastAPI', 'OpenAI • DeepSeek'],
  presenterName:  'Chandan Kumar',
  presenterRole:  'AI Systems Engineer',

  backendUrl: 'http://localhost:8000',

  flowNodes: LANGCHAIN_FLOW_NODES,
  endpoints: LANGCHAIN_ENDPOINT_CONFIGS,
};
