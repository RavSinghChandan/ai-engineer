// ── Core domain models for 360° Astrology Intelligence System ─────────────

export type Module = 'astrology' | 'numerology' | 'palmistry' | 'tarot' | 'vastu';
export type Confidence = 'high' | 'medium' | 'low';
export type StepStatus = 'idle' | 'running' | 'done' | 'error';

// ── User Profile ───────────────────────────────────────────────────────────
export interface UserProfile {
  full_name: string;
  alias_name: string;
  date_of_birth: string;   // YYYY-MM-DD
  time_of_birth: string;   // HH:MM
  place_of_birth: string;
  pincode: string;
}

// ── Form Field ─────────────────────────────────────────────────────────────
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'date' | 'time' | 'number' | 'select' | 'textarea' | 'file';
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

// ── Module Inputs ──────────────────────────────────────────────────────────
export interface NumerologyInput {
  full_name: string;
  date_of_birth: string;
}

export interface PalmistryInput {
  left_hand_image?: string;   // base64 or URL
  right_hand_image?: string;
  hand_shape?: string;
}

export interface VastuInput {
  property_type?: string;
  facing_direction?: string;
  floor_plan_notes?: string;
}

export interface TarotInput {
  question?: string;
  spread?: '3-card' | '5-card';
}

export interface ModuleInputs {
  numerology?: NumerologyInput;
  palmistry?: PalmistryInput;
  vastu?: VastuInput;
  tarot?: TarotInput;
}

// ── System Input ───────────────────────────────────────────────────────────
export interface SystemInput {
  user_profile: UserProfile;
  selected_modules: Module[];
  module_inputs: ModuleInputs;
}

// ── Agent Output types ─────────────────────────────────────────────────────

export interface NumerologyResult {
  tradition: 'Indian' | 'Chaldean' | 'Pythagorean';
  life_path_number: number;
  destiny_number: number;
  name_number: number;
  soul_urge_number: number;
  personality_number: number;
  traits: string[];
  strengths: string[];
  weaknesses: string[];
  lucky_numbers: number[];
  lucky_colors: string[];
  predictions: string[];
}

export interface PalmistryResult {
  tradition: 'Indian' | 'Chinese' | 'Western';
  life_line: string;
  head_line: string;
  heart_line: string;
  fate_line: string;
  hand_shape: string;
  mounts: Record<string, string>;
  traits: string[];
  health_notes: string[];
  career_notes: string[];
  relationship_notes: string[];
}

export interface AstrologyResult {
  lagna: string;
  moon_sign: string;
  sun_sign: string;
  planetary_positions: Record<string, string>;
  house_analysis: Record<string, string>;
  doshas: string[];
  current_dasha: string;
  dasha_periods: { period: string; planet: string; from: string; to: string }[];
  yogas: string[];
  strengths: string[];
  challenges: string[];
  predictions: string[];
}

export interface TarotCard {
  name: string;
  position: string;
  orientation: 'upright' | 'reversed';
  meaning: string;
  keywords: string[];
}

export interface TarotResult {
  spread: string;
  question?: string;
  cards: TarotCard[];
  overall_theme: string;
  guidance: string[];
}

export interface VastuResult {
  overall_energy: string;
  zone_analysis: Record<string, string>;
  imbalances: string[];
  corrections: string[];
  favorable_directions: string[];
  colors_recommended: string[];
}

export interface RemedyResult {
  daily_habits: string[];
  mantras: { mantra: string; purpose: string; count: number }[];
  colors: string[];
  gemstones: { stone: string; finger: string; purpose: string }[];
  fasting: string[];
  charity: string[];
  behavioral_adjustments: string[];
  yoga_meditation: string[];
}

// ── Consolidated Agent Outputs ─────────────────────────────────────────────
export interface AgentOutputs {
  astrology?: AstrologyResult;
  numerology?: NumerologyResult[];        // 3 traditions
  palmistry?: PalmistryResult[];          // 3 traditions
  tarot?: TarotResult;
  vastu?: VastuResult;
  remedies?: RemedyResult;
}

// ── Admin Review Section ───────────────────────────────────────────────────
export interface ReviewSection {
  id: string;
  title: string;
  content: string;
  confidence: Confidence;
  sources: Module[];
  approved?: boolean;
  edited?: boolean;
}

export interface AdminReview {
  sections: ReviewSection[];
}

// ── Final Report ───────────────────────────────────────────────────────────
export interface FinalReport {
  brand_name: string;
  image_url: string;
  user_name: string;
  generated_at: string;
  sections: ReviewSection[];
  raw_outputs: AgentOutputs;
}

// ── Orchestrator State ─────────────────────────────────────────────────────
export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
  tradition?: string;
}
