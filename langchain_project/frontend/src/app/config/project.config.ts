// ── Generic Project Configuration ─────────────────────────────────────────────
// Swap this file to plug the visualizer into ANY backend project.
// Only this file + endpoints.data.ts + mock-steps.data.ts need to change.

export const PROJECT_CONFIG = {
  // Branding
  name:       'AI with Rav Engine',
  accent:     'Engine',                         // colored word in top-bar title
  subtitle:   'AI system execution & debugging',

  // Left-panel header
  panelTitle:    'LangChain Visualizer',
  panelSubtitle: 'Select an API, run it, watch the flow',

  // Top-bar badge labels
  badge1: 'AI Engineer',
  badge2: 'LLM • RAG • Agents',
  badge3: 'Python • FastAPI • Kafka',
  badge4: 'Built for Scale',

  // Presenter
  presenterName: 'Chandan Kumar',
  presenterRole: 'AI Systems Engineer',

  // Backend
  backendUrl: 'http://localhost:8000',

  // Primary accent color (CSS)
  accentColor: '#6366f1',
} as const;
