// ── Generic Project Configuration ─────────────────────────────────────────────
// Swap this file to plug the visualizer into ANY backend project.
// Only this file + endpoints.data.ts + mock-steps.data.ts need to change.

export const PROJECT_CONFIG = {
  // Branding
  name:       'LangGraph Visualizer',
  accent:     'Engine',                         // colored word in top-bar title
  subtitle:   'Banking AI Platform — graph execution & debugging',

  // Left-panel header
  panelTitle:    'LangGraph Visualizer',
  panelSubtitle: 'Select an API, run it, watch the graph',

  // Top-bar badge labels
  badge1: 'Banking AI',
  badge2: 'LangGraph • Agents • RAG',
  badge3: 'Python • FastAPI • Redis',
  badge4: 'Production Ready',

  // Presenter
  presenterName: 'Chandan Kumar',
  presenterRole: 'AI Systems Engineer',

  // Backend
  backendUrl: 'http://localhost:8001',

  // Primary accent color (CSS)
  accentColor: '#6366f1',
} as const;
