export interface RunbookStep {
  step_number: number;
  title: string;
  description: string;
  commands: string[];
  expected_output: string;
  depends_on: number[];
  is_optional: boolean;
  timeout_seconds: number;
}

export interface Runbook {
  id: number;
  title: string;
  description: string;
  category: string;
  severity: string;
  tags: string[];
  prerequisites: string[];
  estimated_duration_minutes: number;
  step_count: number;
  source_pdf: string;
  created_at: string;
  steps?: RunbookStep[];
  rollback_steps?: RunbookStep[];
}

export interface RunbookStats {
  total_runbooks: number;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
}

export interface IngestJob {
  job_id: number;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  runbook_id?: number;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  phase: number;
  description: string;
}

export interface GraphAnalysis {
  runbook_id: number;
  total_steps: number;
  critical_path: number[];
  parallel_groups: number[][];
  bottleneck_steps: number[];
  has_cycle: boolean;
  estimated_parallel_duration_minutes: number;
}

export interface QueryResult {
  incident: string;
  runbook_id: number;
  runbook_title: string;
  category: string;
  severity: string;
  match_confidence: string;
  triage_summary: string;
  execution_order: number[];
  steps: RunbookStep[];
  critical_path: number[];
  parallel_groups: number[][];
  estimated_duration_minutes: number;
  commands_source: string;
}

export interface ConflictResult {
  runbook_ids: number[];
  total_conflicts: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  safe_to_run_together: boolean;
  conflicts: ConflictItem[];
  recommendation: string;
}

export interface ConflictItem {
  conflict_type: string;
  severity: string;
  description: string;
  runbook_a: { id: number; title: string; step_number: number; command: string };
  runbook_b: { id: number; title: string; step_number: number; command: string };
  recommendation: string;
}

export interface MergeResult {
  total_runbooks: number;
  total_steps: number;
  has_conflicts: boolean;
  conflict_count: number;
  execution_strategy: string;
  composite_steps: CompositeStep[];
  conflicts: ConflictItem[];
  parallel_opportunities: ParallelOpportunity[];
  rollback_sequence: CompositeStep[];
}

export interface CompositeStep {
  global_step: number;
  runbook_id: number;
  runbook_title: string;
  runbook_category: string;
  step_number: number;
  title: string;
  commands: string[];
  has_conflict: boolean;
}

export interface ParallelOpportunity {
  runbook_a_id: number;
  runbook_a_title: string;
  runbook_b_id: number;
  runbook_b_title: string;
  safe_to_parallelize: boolean;
}

export interface CompoundResult {
  is_compound: boolean;
  total_domains: number;
  decomposition_reasoning: string;
  matched_per_domain: DomainMatch[];
  selected_runbook_ids: number[];
  composite_plan: MergeResult | null;
  message?: string;
}

export interface DomainMatch {
  domain: string;
  severity: string;
  description: string;
  execution_order: number;
  matched_runbooks: Runbook[];
}

export interface SimilarRunbooks {
  runbook_id: number;
  runbook_title: string;
  similar_runbooks: Runbook[];
  total: number;
}
