import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AgentInfo,
  AvatarCatalogItem,
  CreatorProfile,
  CreatorProfileDraft,
  Job,
  JobDetail,
  JobEvent,
  Project,
  Prompt,
  TrainingResult,
  TrainingSession,
  VoiceCatalogItem,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  // --- Projects ---
  listProjects(): Promise<Project[]> {
    return firstValueFrom(this.http.get<Project[]>('/api/v1/projects'));
  }

  createProject(body: Partial<Project>): Promise<Project> {
    return firstValueFrom(this.http.post<Project>('/api/v1/projects', body));
  }

  getProject(id: string): Promise<Project> {
    return firstValueFrom(this.http.get<Project>(`/api/v1/projects/${id}`));
  }

  // --- Jobs ---
  listJobs(projectId: string): Promise<Job[]> {
    return firstValueFrom(this.http.get<Job[]>(`/api/v1/projects/${projectId}/jobs`));
  }

  createJob(
    projectId: string,
    topic: string,
    scriptText = '',
    thumbnailInstructions = '',
  ): Promise<Job> {
    return firstValueFrom(
      this.http.post<Job>(`/api/v1/projects/${projectId}/jobs`, {
        topic,
        script_text: scriptText,
        thumbnail_instructions: thumbnailInstructions,
      }),
    );
  }

  trainingHistory(profileId: string): Promise<TrainingSession[]> {
    return firstValueFrom(
      this.http.get<TrainingSession[]>(`/api/v1/profiles/${profileId}/training`),
    );
  }

  getJob(id: string): Promise<JobDetail> {
    return firstValueFrom(this.http.get<JobDetail>(`/api/v1/jobs/${id}`));
  }

  startJob(id: string): Promise<Job> {
    return firstValueFrom(this.http.post<Job>(`/api/v1/jobs/${id}/start`, {}));
  }

  approveJob(id: string): Promise<Job> {
    return firstValueFrom(this.http.post<Job>(`/api/v1/jobs/${id}/approve`, {}));
  }

  replayEvents(jobId: string, afterId = 0): Promise<JobEvent[]> {
    return firstValueFrom(
      this.http.get<JobEvent[]>(`/api/v1/jobs/${jobId}/events`, {
        params: { after_id: afterId },
      }),
    );
  }

  // --- Agents & prompts ---
  listAgents(): Promise<AgentInfo[]> {
    return firstValueFrom(this.http.get<AgentInfo[]>('/api/v1/agents'));
  }

  listPrompts(): Promise<Prompt[]> {
    return firstValueFrom(this.http.get<Prompt[]>('/api/v1/prompts'));
  }

  updatePrompt(agentName: string, body: { system_prompt: string; user_template: string; notes: string }): Promise<Prompt> {
    return firstValueFrom(this.http.put<Prompt>(`/api/v1/prompts/${agentName}`, body));
  }

  // --- Creator profiles ---
  listProfiles(): Promise<CreatorProfile[]> {
    return firstValueFrom(this.http.get<CreatorProfile[]>('/api/v1/profiles'));
  }

  createProfile(body: CreatorProfileDraft): Promise<CreatorProfile> {
    return firstValueFrom(this.http.post<CreatorProfile>('/api/v1/profiles', body));
  }

  updateProfile(id: string, body: CreatorProfileDraft): Promise<CreatorProfile> {
    return firstValueFrom(this.http.put<CreatorProfile>(`/api/v1/profiles/${id}`, body));
  }

  deleteProfile(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/v1/profiles/${id}`));
  }

  avatarCatalog(search = '', limit = 60): Promise<AvatarCatalogItem[]> {
    return firstValueFrom(
      this.http.get<AvatarCatalogItem[]>('/api/v1/profiles/catalog/avatars', {
        params: { search, limit },
      }),
    );
  }

  voiceCatalog(): Promise<VoiceCatalogItem[]> {
    return firstValueFrom(this.http.get<VoiceCatalogItem[]>('/api/v1/profiles/catalog/voices'));
  }

  trainVoice(profileId: string, samples: { blob: Blob; filename: string }[]): Promise<TrainingResult> {
    const form = new FormData();
    for (const sample of samples) form.append('files', sample.blob, sample.filename);
    return firstValueFrom(
      this.http.post<TrainingResult>(`/api/v1/profiles/${profileId}/voice-training`, form),
    );
  }

  trainAvatar(profileId: string, video: Blob, filename: string): Promise<TrainingResult> {
    const form = new FormData();
    form.append('video', video, filename);
    return firstValueFrom(
      this.http.post<TrainingResult>(`/api/v1/profiles/${profileId}/avatar-training`, form),
    );
  }

  trainPhoto(profileId: string, image: Blob, filename: string): Promise<TrainingResult> {
    const form = new FormData();
    form.append('image', image, filename);
    return firstValueFrom(
      this.http.post<TrainingResult>(`/api/v1/profiles/${profileId}/photo-training`, form),
    );
  }

  // --- Files (auth header cannot ride on <video src>, so fetch → blob URL) ---
  async assetObjectUrl(assetId: string): Promise<string> {
    const blob = await firstValueFrom(
      this.http.get(`/api/v1/files/${assetId}`, { responseType: 'blob' }),
    );
    return URL.createObjectURL(blob);
  }
}
