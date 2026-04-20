export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience_years: number;
  roles: string[];
  projects: { name: string; description: string; technologies: string[] }[];
  education: string;
}

export interface UploadCvResponse {
  user_id: string;
  profile: UserProfile;
}

export interface RoleMapping {
  role: string;
  match_percentage: number;
  matched_skills: string[];
  missing_skills: string[];
  experience_gap: number;
  recommendation: string;
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
