import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  HealthResponse, Runbook, RunbookStats, IngestJob,
  GraphAnalysis, QueryResult, ConflictResult, MergeResult,
  CompoundResult, SimilarRunbooks
} from '../models/runbook.model';

const API = 'http://localhost:8000';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${API}/health`);
  }

  // Runbooks
  getRunbooks(params?: { category?: string; severity?: string; limit?: number; offset?: number }): Observable<{ runbooks: Runbook[]; total: number }> {
    let p = new HttpParams();
    if (params?.category) p = p.set('category', params.category);
    if (params?.severity) p = p.set('severity', params.severity);
    if (params?.limit != null) p = p.set('limit', params.limit);
    if (params?.offset != null) p = p.set('offset', params.offset);
    return this.http.get<{ runbooks: Runbook[]; total: number }>(`${API}/runbooks`, { params: p });
  }

  getRunbook(id: number): Observable<Runbook> {
    return this.http.get<Runbook>(`${API}/runbooks/${id}`);
  }

  getRunbookStats(): Observable<RunbookStats> {
    return this.http.get<RunbookStats>(`${API}/runbooks/stats`);
  }

  // Graph
  getGraph(id: number): Observable<GraphAnalysis> {
    return this.http.get<GraphAnalysis>(`${API}/graph/${id}`);
  }

  // Ingest
  uploadPdf(file: File): Observable<{ job_id: number; status: string; filename: string }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<{ job_id: number; status: string; filename: string }>(`${API}/ingest/upload`, form);
  }

  getJobStatus(jobId: number): Observable<IngestJob> {
    return this.http.get<IngestJob>(`${API}/ingest/job/${jobId}`);
  }

  // Query
  queryIncident(incident: string, maxSteps?: number): Observable<QueryResult> {
    return this.http.post<QueryResult>(`${API}/query`, { incident, max_steps: maxSteps ?? 20 });
  }

  // Multi
  mergeRunbooks(ids: number[]): Observable<MergeResult> {
    return this.http.post<MergeResult>(`${API}/multi/merge`, { runbook_ids: ids });
  }

  checkConflicts(ids: number[]): Observable<ConflictResult> {
    return this.http.post<ConflictResult>(`${API}/multi/conflicts`, { runbook_ids: ids });
  }

  analyzeCompound(incident: string): Observable<CompoundResult> {
    return this.http.post<CompoundResult>(`${API}/multi/compound`, { incident });
  }

  getSimilar(id: number): Observable<SimilarRunbooks> {
    return this.http.get<SimilarRunbooks>(`${API}/multi/runbooks/${id}/similar`);
  }
}
