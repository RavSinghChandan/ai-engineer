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
  impressions: number;
  clicks: number;
  conversions: number;
  cost_per_click: number;
  cost_per_conversion: number;
}

export interface AgentLogEntry {
  agent: string;
  status: string;
  insights: string[];
}

export interface LearningSummary {
  message: string;
  type: 'baseline' | 'improved';
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
  forecast_30_days: { projected_conversions: number; projected_revenue: number; projected_roi: number };
  agent_log: AgentLogEntry[];
  agent_decisions: Record<string, unknown>;
  ai_insights: string[];
  learning_summary: LearningSummary;
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
