import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

// Empty string = relative URL → routed through Angular dev-server proxy to http://localhost:8080
// In production, replace with your actual backend URL
const BACKEND = '';

export interface RunRequest {
  user_profile: {
    full_name: string; alias_name: string; date_of_birth: string;
    time_of_birth: string; place_of_birth: string; pincode: string;
  };
  user_question: string;
  selected_modules: string[];
  module_inputs: Record<string, any>;
}

export interface RunResponse {
  session_id: string;
  status: string;
  focus_context: Record<string, any>;
  memory_keys: Record<string, string[]>;
  admin_review: { question: string; focus: string; subject: string; sections: any[] };
  agent_log: string[];
  raw_outputs: Record<string, any>;
}

export interface ApproveRequest {
  session_id: string;
  approved_sections: string[];
  rejected_sections: string[];
  brand_name?: string;
  logo_url?: string;
  image_url?: string;
}

export interface ApproveResponse {
  session_id: string;
  final_report: Record<string, any>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  runAnalysis(req: RunRequest): Observable<RunResponse> {
    return this.http
      .post<RunResponse>(`${BACKEND}/api/v1/analysis/run`, req)
      .pipe(
        timeout(120_000),
        catchError(this._handleError),
      );
  }

  approveReport(req: ApproveRequest): Observable<ApproveResponse> {
    return this.http
      .post<ApproveResponse>(`${BACKEND}/api/v1/analysis/approve`, req)
      .pipe(
        timeout(30_000),
        catchError(this._handleError),
      );
  }

  getHealth(): Observable<any> {
    return this.http.get(`${BACKEND}/health`).pipe(catchError(this._handleError));
  }

  private _handleError(err: HttpErrorResponse): Observable<never> {
    const msg = err.status === 0
      ? 'Cannot reach backend — run: cd astro-intel-backend && bash start.sh (starts on port 8080)'
      : `Backend error ${err.status}: ${err.error?.detail ?? err.message}`;
    return throwError(() => new Error(msg));
  }
}
