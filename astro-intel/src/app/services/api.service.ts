import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

const BACKEND = '';

export interface RunRequest {
  user_profile: {
    full_name: string; alias_name: string; date_of_birth: string;
    time_of_birth: string; place_of_birth: string; pincode: string;
  };
  user_id?: string;
  bypass_cache?: boolean;
  user_question: string;
  questions: string[];
  selected_modules: string[];
  module_inputs: Record<string, any>;
  geocode?: { lat: number; lon: number; timezone: string } | null;
  prompt_version?: string;
}

export interface AdminInsight {
  id: string;
  content: string;
  confidence: 'high' | 'medium' | 'low';
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

export interface ModuleMethodology {
  label: string;
  icon: string;
  branches: string[];
  engine?: string;
  ayanamsa?: string;
  description: string;
}

export interface AdminReviewResponse {
  subject: string;
  questions: AdminQuestion[];
  module_methodology?: Record<string, ModuleMethodology>;
}

export interface NormalizedQuestion {
  question: string;
  intent: string;
  index: number;
  confidence: string;
  detected_keywords: string[];
  summary: string;
}

export interface RunResponse {
  session_id: string;
  status: string;
  cache_hit: boolean;
  cache_key?: string;
  focus_context: Record<string, any>;
  normalized_questions: NormalizedQuestion[];
  memory_keys: Record<string, string[]>;
  admin_review: AdminReviewResponse;
  agent_log: string[];
  raw_outputs: Record<string, any>;
}

export interface ApproveRequest {
  session_id: string;
  approved_insight_ids: string[];
  rejected_insight_ids: string[];
  brand_name?: string;
  logo_url?: string;
  image_url?: string;
}

export interface ReportSection {
  question: string;
  intent: string;
  insights: Array<{
    id: string;
    content: string;
    confidence: string;
    domains: string[];
    is_common: boolean;
    approved: boolean;
  }>;
}

export interface FinalReportPayload {
  brand_name: string;
  logo_url: string;
  image_url: string;
  report_title: string;
  user_name: string;
  questions: string[];
  generated_at: string;
  modules_used: string[];
  module_methodology?: Record<string, ModuleMethodology>;
  sections: ReportSection[];
  disclaimer: string;
  closing_note: string;
  confidence_distribution: Record<string, number>;
  language_code?: string;
  language_name?: string;
  language_native?: string;
}

export interface ApproveResponse {
  session_id: string;
  final_report: FinalReportPayload;
}

export interface LanguageOption {
  code: string;
  name: string;
  native: string;
  script: string;
}

export interface TranslateRequest {
  session_id: string;
  language_code: string;
  report?: Record<string, any>;
}

export interface TranslateResponse {
  session_id: string;
  language_code: string;
  language_name: string;
  final_report: FinalReportPayload;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  runAnalysis(req: RunRequest): Observable<RunResponse> {
    return this.http
      .post<RunResponse>(`${BACKEND}/api/v1/analysis/run`, req)
      .pipe(timeout(120_000), catchError(this._handleError));
  }

  approveReport(req: ApproveRequest): Observable<ApproveResponse> {
    return this.http
      .post<ApproveResponse>(`${BACKEND}/api/v1/analysis/approve`, req)
      .pipe(timeout(120_000), catchError(this._handleError));
  }

  getLanguages(): Observable<{ languages: LanguageOption[] }> {
    return this.http
      .get<{ languages: LanguageOption[] }>(`${BACKEND}/api/v1/analysis/languages`)
      .pipe(catchError(this._handleError));
  }

  translateReport(req: TranslateRequest): Observable<TranslateResponse> {
    return this.http
      .post<TranslateResponse>(`${BACKEND}/api/v1/analysis/translate`, req)
      .pipe(timeout(60_000), catchError(this._handleError));
  }

  getHealth(): Observable<any> {
    return this.http.get(`${BACKEND}/health`).pipe(catchError(this._handleError));
  }

  private _handleError(err: HttpErrorResponse): Observable<never> {
    const msg = err.status === 0
      ? 'Cannot reach backend — run: cd astro-intel-backend && bash start.sh'
      : `Backend error ${err.status}: ${err.error?.detail ?? err.message}`;
    return throwError(() => new Error(msg));
  }
}
