export type CampaignType = 'real_estate' | 'coaching' | 'ecommerce' | 'custom';

export interface CampaignForm {
  name: string;
  campaign_type: CampaignType;
  product_name: string;
  budget: number;
  target_audience: string;
  key_benefit: string;
  platform: string;
  learning_mode: boolean;
}

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  color: string;
  icon: string;
  description: string;
  x: number;
  y: number;
  status: 'idle' | 'running' | 'done' | 'error';
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface PerformanceMetrics {
  ctr: number;
  conversion_rate: number;
  roi_score: number;
  roas: number;
  gross_margin_pct: number;
  revenue: number;
  gross_profit: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  lead_to_sale_rate: number;
  cost_per_click: number;
  cost_per_lead: number;
  cost_per_conversion: number;
}

export interface Provenance {
  model_version: string;
  kind: string;
  label: string;
  basis: string;
  deterministic: boolean;
  formula: string[];
}

export interface AgentLogEntry {
  agent: string;
  status: string;
  insights: string[];
}

export interface LearningSummary {
  message: string;
  type: 'baseline' | 'improved' | 'regressed' | 'flat';
  runs_analyzed: number;
  changes_applied: string[];
  improvement_percentage?: number;
}

export interface CampaignResult {
  campaign_id: string;
  campaign_name: string;
  run_number: number;
  learning_applied: boolean;
  similar_campaigns_found: number;
  improvement_percentage: number | null;
  metrics: PerformanceMetrics;
  performance_grade: string;
  low_volume: boolean;
  forecast_30_days: {
    projected_conversions: number;
    projected_revenue: number;
    projected_gross_profit: number;
    projected_ad_spend: number;
    projected_roi: number;
    projected_roas: number;
  };
  agent_log: AgentLogEntry[];
  agent_decisions: Record<string, unknown>;
  ai_insights: string[];
  learning_summary: LearningSummary;
  provenance: Provenance;
  copy_source: 'deepseek' | 'template';
}

export interface LearningInsight {
  campaign_type: string;
  runs: number;
  roi_improvement: number;
  ctr_improvement: number;
  best_tone: string;
  best_strategy: string;
  latest_roi: number;
  latest_ctr: number;
}

export interface AgentStep {
  key: string;
  label: string;
  detail: string;
  status: 'idle' | 'running' | 'done';
}

export interface AgentProgress {
  key: string;
  label: string;
  role: string;
  steps: AgentStep[];
  progress: number;
  status: 'idle' | 'running' | 'done';
}

export interface LiveStep {
  agentLabel: string;
  agentRole: string;
  stepLabel: string;
  stepDetail: string;
  stepIndex: number;
  stepTotal: number;
}

export interface WorkflowStepsResponse {
  agents: { key: string; label: string; role: string; steps: { key: string; label: string; detail: string }[] }[];
  estimated_real_ms: number;
  pace: number;
}
