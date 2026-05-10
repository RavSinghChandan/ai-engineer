import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import {
  AdminUploadResponse, HealthReady, JudgeScores, MetricsData,
  Plan, ResourceRegistryResponse, Role, RoleMapping,
  StreamEvent, TrackingResult, UploadCvResponse
} from '../models/types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api';

  constructor(private http: HttpClient) {}

  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.base}/roles`);
  }

  uploadCv(file: File): Observable<UploadCvResponse> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<UploadCvResponse>(`${this.base}/upload-cv`, fd);
  }

  mapRole(userId: string, targetRole: string): Observable<RoleMapping> {
    return this.http.post<RoleMapping>(`${this.base}/map-role`, {
      user_id: userId,
      target_role: targetRole,
    });
  }

  generatePlan(
    userId: string,
    targetRole: string,
    missingSkills: string[],
    numDays: number = 7,
  ): Observable<Plan> {
    return this.http.post<Plan>(`${this.base}/generate-plan`, {
      user_id: userId,
      target_role: targetRole,
      missing_skills: missingSkills,
      num_days: numDays,
    });
  }

  /**
   * SSE streaming plan generation.
   * Emits StreamEvent objects as each day is generated.
   * Returns a Subject that completes when the stream ends.
   */
  generatePlanStream(
    userId: string,
    targetRole: string,
    missingSkills: string[],
    numDays: number = 7,
  ): Subject<StreamEvent> {
    const subject = new Subject<StreamEvent>();

    fetch(`${this.base}/generate-plan/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        target_role: targetRole,
        missing_skills: missingSkills,
        num_days: numDays,
      }),
    }).then(async res => {
      if (!res.ok || !res.body) {
        subject.error(new Error(`HTTP ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              subject.next(event);
              if (event.event === 'done' || event.event === 'error') {
                subject.complete();
                return;
              }
            } catch { /* skip malformed line */ }
          }
        }
      }
      subject.complete();
    }).catch(err => subject.error(err));

    return subject;
  }

  evaluate(
    question: string,
    context: string,
    output: string,
    requestId = '',
  ): Observable<JudgeScores> {
    return this.http.post<JudgeScores>(`${this.base}/evaluate`, {
      question,
      context,
      output,
      request_id: requestId,
    });
  }

  getMetrics(): Observable<MetricsData> {
    return this.http.get<MetricsData>(`${this.base}/metrics`);
  }

  getHealthReady(): Observable<HealthReady> {
    return this.http.get<HealthReady>(`${this.base}/health/ready`);
  }

  updateProgress(userId: string, completedTaskIds: string[]): Observable<TrackingResult> {
    return this.http.post<TrackingResult>(`${this.base}/update-progress`, {
      user_id: userId,
      completed_task_ids: completedTaskIds,
    });
  }

  getProgress(userId: string): Observable<any> {
    return this.http.get(`${this.base}/progress/${userId}`);
  }

  adminUploadResource(
    file: File,
    skillTags: string,
    classification: string,
  ): Observable<AdminUploadResponse> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('skill_tags', skillTags);
    fd.append('classification', classification);
    return this.http.post<AdminUploadResponse>(`${this.base}/admin/upload-resource`, fd);
  }

  getAdminResources(): Observable<ResourceRegistryResponse> {
    return this.http.get<ResourceRegistryResponse>(`${this.base}/admin/resources`);
  }
}
