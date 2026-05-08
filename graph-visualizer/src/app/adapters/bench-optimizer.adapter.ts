import { VisualizerAdapter } from '../models/visualizer.models';
import { BENCH_OPTIMIZER_NODES } from './bench-optimizer.nodes';
import { BENCH_OPTIMIZER_ENDPOINT_CONFIGS } from './bench-optimizer.endpoints';

export const BenchOptimizerAdapter: VisualizerAdapter = {
  productName:    'AI with Rav',
  productTagline: 'Bench Resource Optimizer — AI-powered skills gap & upskilling',
  accentWord:     'Bench',
  accentColor:    '#0ea5e9',
  topBadges:      ['Bench Optimizer', 'DeepSeek • FAISS • RAG', 'Python • FastAPI', 'Async Planner'],
  presenterName:  'Chandan Kumar',
  presenterRole:  'AI Systems Engineer',

  backendUrl: 'http://localhost:8003',

  flowNodes: BENCH_OPTIMIZER_NODES,
  endpoints: BENCH_OPTIMIZER_ENDPOINT_CONFIGS,
};
