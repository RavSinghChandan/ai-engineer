// ── Core domain models for 360° Astrology Intelligence System ─────────────

export type Module = 'astrology' | 'numerology' | 'palmistry' | 'tarot' | 'vastu';
export type Confidence = 'high' | 'medium' | 'low';
export type StepStatus = 'idle' | 'running' | 'done' | 'error';

// ── User Profile ───────────────────────────────────────────────────────────
export interface UserProfile {
  full_name: string;
  alias_name: string;
  date_of_birth: string;
  time_of_birth: string;
  place_of_birth: string;
  pincode: string;
}

// ── System Input ───────────────────────────────────────────────────────────
export interface SystemInput {
  user_profile: UserProfile;
  user_question: string;
  questions: string[];
  selected_modules: Module[];
  module_inputs: Record<string, any>;
}

// ── Normalized Question ────────────────────────────────────────────────────
export interface NormalizedQuestion {
  question: string;
  intent: string;
  index: number;
  confidence: string;
  detected_keywords: string[];
  summary: string;
}

// ── Enterprise Admin Review ────────────────────────────────────────────────
export interface AdminInsight {
  id: string;
  content: string;
  confidence: Confidence;
  domains: string[];
  is_common: boolean;
  editable: boolean;
  edited?: boolean;
}

export interface AdminQuestion {
  question: string;
  intent: string;
  insights: AdminInsight[];
}

export interface AdminReview {
  subject?: string;
  questions: AdminQuestion[];
}

// ── Final Report ───────────────────────────────────────────────────────────
export interface ReportInsight {
  id: string;
  content: string;
  confidence: string;
  domains: string[];
  is_common: boolean;
  approved: boolean;
}

export interface ReportSection {
  question: string;
  intent: string;
  insights: ReportInsight[];
}

export interface FinalReport {
  brand_name: string;
  logo_url: string;
  image_url: string;
  report_title: string;
  user_name: string;
  questions: string[];
  generated_at: string;
  modules_used: string[];
  sections: ReportSection[];
  disclaimer: string;
  closing_note: string;
  confidence_distribution: Record<string, number>;
}

// ── Raw Agent Outputs (for display) ───────────────────────────────────────
export interface AgentOutputs {
  astrology?: any;
  numerology?: any;
  palmistry?: any;
  tarot?: any;
  vastu?: any;
  remedies?: any;
  consolidated?: any;
}

// ── Orchestrator step ──────────────────────────────────────────────────────
export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
  tradition?: string;
}

// ── Legacy local-service types (kept for local fallback services) ──────────
export interface NumerologyResult {
  tradition: 'Indian' | 'Chaldean' | 'Pythagorean';
  life_path_number?: number;
  destiny_number?: number;
  name_number?: number;
  soul_urge_number?: number;
  personality_number?: number;
  traits: string[];
  strengths?: string[];
  weaknesses?: string[];
  lucky_numbers?: number[];
  lucky_colors?: string[];
  predictions?: string[];
  [key: string]: any;
}

export interface PalmistryInput {
  left_hand_image?: string;
  right_hand_image?: string;
  hand_shape?: string;
  [key: string]: any;
}

export interface PalmistryResult {
  tradition: 'Indian' | 'Chinese' | 'Western';
  traits: string[];
  health_notes?: string[];
  career_notes?: string[];
  relationship_notes?: string[];
  [key: string]: any;
}

export interface AstrologyResult {
  lagna?: string;
  moon_sign?: string;
  sun_sign?: string;
  current_dasha?: string;
  predictions?: string[];
  doshas?: string[];
  [key: string]: any;
}

export interface TarotCard {
  name: string;
  position: string;
  orientation: 'upright' | 'reversed';
  meaning: string;
  keywords: string[];
}

export interface TarotInput {
  question?: string;
  spread?: '3-card' | '5-card';
  [key: string]: any;
}

export interface TarotResult {
  spread: string;
  question?: string;
  cards: TarotCard[];
  overall_theme: string;
  guidance: string[];
}

export interface VastuInput {
  property_type?: string;
  facing_direction?: string;
  floor_plan_notes?: string;
  [key: string]: any;
}

export interface VastuResult {
  overall_energy: string;
  zone_analysis?: Record<string, string>;
  corrections?: string[];
  colors_recommended?: string[];
  [key: string]: any;
}

export interface RemedyResult {
  daily_habits?: string[];
  mantras?: { mantra: string; purpose: string; count: number }[];
  colors?: string[];
  gemstones?: { stone: string; finger: string; purpose: string }[];
  fasting?: string[];
  charity?: string[];
  behavioral_adjustments?: string[];
  yoga_meditation?: string[];
  [key: string]: any;
}

export interface ModuleInputs {
  numerology?: any;
  palmistry?: PalmistryInput;
  vastu?: VastuInput;
  tarot?: TarotInput;
}

// ── Legacy / local fallback ────────────────────────────────────────────────
export interface ReviewSection {
  id: string;
  title: string;
  content: string;
  confidence: Confidence;
  sources: Module[];
  approved?: boolean;
  edited?: boolean;
}
