/** API contracts — mirrors backend Pydantic schemas. */

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'creator' | 'viewer';
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Project {
  id: string;
  name: string;
  niche: string;
  audience: string;
  description: string;
  creator_profile_id?: string | null;
  created_at: string;
}

export type VoiceProvider = 'macos_say' | 'kokoro' | 'elevenlabs';
export type AvatarProvider = 'none' | 'heygen' | 'heygen_photo';

export interface CreatorProfile {
  id: string;
  name: string;
  voice_provider: VoiceProvider;
  voice_id: string | null;
  avatar_provider: AvatarProvider;
  avatar_id: string | null;
  avatar_required: boolean;
  is_default: boolean;
  created_at: string;
}

export type CreatorProfileDraft = Omit<CreatorProfile, 'id' | 'created_at'>;

export interface AvatarCatalogItem {
  avatar_id: string;
  name: string | null;
  gender: string | null;
  preview_image_url: string | null;
  premium: boolean;
}

export interface VoiceCatalogItem {
  voice_id: string;
  name: string | null;
  category: string | null;
}

export interface TrainingResult {
  kind: 'voice' | 'avatar';
  provider_id: string;
  message: string;
}

export interface TrainingSession {
  id: string;
  kind: 'voice' | 'avatar_photo' | 'avatar_video';
  file_path: string;
  provider_id: string | null;
  notes: string;
  created_at: string;
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'failed'
  | 'cancelled';

export interface Job {
  id: string;
  project_id: string;
  topic: string;
  status: JobStatus;
  current_agent: string | null;
  error: string | null;
  result: JobResult | null;
  created_at: string;
}

export interface JobResult {
  title?: string;
  score?: number;
  duration_seconds?: number;
  metadata?: Record<string, unknown>;
  seo?: { best_title?: string; description?: string; tags?: string[] };
}

export interface AgentRun {
  id: string;
  agent_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  output: Record<string, unknown> | null;
  error: string | null;
}

export interface Asset {
  id: string;
  kind: 'audio' | 'video' | 'avatar_video' | 'thumbnail' | 'captions' | 'script';
  media_type: string;
  meta: Record<string, unknown> | null;
}

export interface ScriptSection {
  heading: string;
  narration: string;
}

export interface ScriptContent {
  title: string;
  hook: string;
  sections: ScriptSection[];
  cta: string;
}

export interface ScriptVersion {
  id: string;
  version: number;
  content: ScriptContent;
  source: string;
  created_at: string;
}

export interface JobDetail extends Job {
  runs: AgentRun[];
  assets: Asset[];
  script_versions: ScriptVersion[];
}

export interface JobEvent {
  id: number;
  job_id: string;
  agent: string | null;
  type: string;
  message: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentInfo {
  name: string;
  description: string;
  order: number;
}

export interface Prompt {
  id: string;
  agent_name: string;
  version: number;
  system_prompt: string;
  user_template: string;
  is_active: boolean;
  notes: string;
  updated_at: string;
}
