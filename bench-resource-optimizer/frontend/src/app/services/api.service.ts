import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Plan, Role, RoleMapping, TrackingResult, UploadCvResponse
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

  updateProgress(userId: string, completedTaskIds: string[]): Observable<TrackingResult> {
    return this.http.post<TrackingResult>(`${this.base}/update-progress`, {
      user_id: userId,
      completed_task_ids: completedTaskIds,
    });
  }

  getProgress(userId: string): Observable<any> {
    return this.http.get(`${this.base}/progress/${userId}`);
  }
}
