export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience_years: number;
  roles: string[];
  projects: { name: string; description: string; technologies: string[] }[];
  education: string;
  _prompt_version?: string;
}

export interface UploadCvResponse {
  user_id: string;
  profile: UserProfile;
  request_id?: string;
}

export interface RoleMapping {
  role: string;
  match_percentage: number;
  matched_skills: string[];
  missing_skills: string[];
  experience_gap: number;
  recommendation: string;
  // v3.0 enterprise fields
  faithfulness_score?: number;
  prompt_version?: string;
  retrieval_method?: string;
  readiness_level?: string;
  role_metadata?: Record<string, any>;
  _faithfulness_warning?: string;
  _cache_hit?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  hours: number;
  skill: string;
  resource: string;
}

export interface DayPlan {
  day: number;
  theme: string;
  tasks: Task[];
}

export interface Plan {
  role: string;
  total_days: number;
  focus_skills: string[];
  plan: DayPlan[];
}

export interface TrackingResult {
  readiness_score: number;
  status: string;
  message: string;
  completed_count: number;
  total_count: number;
  covered_skills: string[];
  pending_skills: string[];
  next_suggested_task: string;
}

export interface Role {
  id: string;
  title: string;
  description: string;
}

// Flat row model used by AG Grid
export interface TaskRow {
  id: string;
  day: number;
  theme: string;
  title: string;
  description: string;
  skill: string;
  hours: number;
  done: boolean;
  resource: string;
}

// ── Enterprise v3.0 types ────────────────────────────────────────────────────

export interface StreamEvent {
  event: 'start' | 'day' | 'done' | 'error';
  day?: DayPlan;
  total_days?: number;
  role?: string;
  focus_skills?: string[];
  error?: string;
}

export interface JudgeScores {
  relevance: number;
  completeness: number;
  accuracy: number;
  actionability: number;
  avg_score: number;
  passed: boolean;
  reasoning?: string;
  request_id?: string;
}

export interface CacheStats {
  l1_hits: number;
  l1_misses: number;
  l2_hits: number;
  l2_misses: number;
  l1_hit_rate: number;
  l2_hit_rate: number;
}

export interface LatencyPercentiles {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  count: number;
}

export interface MetricsData {
  total_requests: number;
  total_llm_calls: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  error_rate: number;
  cache_stats: CacheStats;
  latency_percentiles: Record<string, LatencyPercentiles>;
  recent_requests: Array<{
    request_id: string;
    path: string;
    status_code: number;
    latency_ms: number;
    timestamp: string;
  }>;
  prompts: Record<string, string>;
  memory_stats: {
    users_with_episodic_memory: number;
    users_with_long_term_facts: number;
    total_session_records: number;
  };
}

export interface HealthReady {
  status: string;
  vector_store: boolean;
  hybrid_retrieval: boolean;
  circuit_breakers: Record<string, string>;
  active_prompts: Record<string, string>;
  db: string;
}
