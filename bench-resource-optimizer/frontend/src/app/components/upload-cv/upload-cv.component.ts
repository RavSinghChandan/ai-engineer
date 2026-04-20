import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { UserProfile } from '../../models/types';

@Component({
  selector: 'app-upload-cv',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1 style="margin-bottom:8px;">Upload Your CV</h1>
    <p style="color:var(--text-muted); margin-bottom:24px;">
      Upload a PDF resume. Our AI will extract your skills and experience.
    </p>

    <div class="card">
      <div
        class="drop-zone"
        [class.drag-over]="isDragging"
        (dragover)="onDragOver($event)"
        (dragleave)="isDragging=false"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
      >
        <input #fileInput type="file" accept=".pdf" style="display:none"
               (change)="onFileSelected($event)" />
        <div class="drop-icon">📄</div>
        <p><strong>Click to upload</strong> or drag and drop</p>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">PDF only</p>
        <p *ngIf="selectedFile" style="margin-top:12px;" class="badge badge-blue">
          {{ selectedFile.name }}
        </p>
      </div>

      <div *ngIf="error" class="alert alert-error" style="margin-top:16px;">{{ error }}</div>

      <button class="btn btn-primary" style="margin-top:20px; width:100%;"
              [disabled]="!selectedFile || loading" (click)="upload()">
        <span *ngIf="loading" class="spinner"></span>
        {{ loading ? 'Parsing CV with AI...' : 'Parse CV' }}
      </button>
    </div>

    <div *ngIf="profile" class="card">
      <h2 style="margin-bottom:16px;">✅ Extracted Profile</h2>

      <div class="profile-grid">
        <div class="profile-item"><span class="label">Name</span><span>{{ profile.name }}</span></div>
        <div class="profile-item"><span class="label">Email</span><span>{{ profile.email || '—' }}</span></div>
        <div class="profile-item"><span class="label">Experience</span><span>{{ profile.experience_years }} years</span></div>
        <div class="profile-item"><span class="label">Education</span><span>{{ profile.education || '—' }}</span></div>
      </div>

      <div style="margin-top:20px;">
        <h3 style="margin-bottom:10px;">Skills</h3>
        <span *ngFor="let s of profile.skills" class="tag">{{ s }}</span>
      </div>

      <div *ngIf="profile.roles.length" style="margin-top:16px;">
        <h3 style="margin-bottom:10px;">Previous Roles</h3>
        <span *ngFor="let r of profile.roles" class="tag">{{ r }}</span>
      </div>

      <div *ngIf="profile.projects.length" style="margin-top:16px;">
        <h3 style="margin-bottom:10px;">Projects</h3>
        <div *ngFor="let p of profile.projects" class="project-item">
          <strong>{{ p.name }}</strong>
          <p style="font-size:13px; color:var(--text-muted); margin:2px 0;">{{ p.description }}</p>
          <span *ngFor="let t of p.technologies" class="tag">{{ t }}</span>
        </div>
      </div>

      <button class="btn btn-primary" style="margin-top:24px;" (click)="goToMapping()">
        Continue to Role Mapping →
      </button>
    </div>
  `,
  styles: [`
    .drop-zone {
      border: 2px dashed var(--border);
      border-radius: var(--radius);
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
    }
    .drop-zone:hover, .drop-zone.drag-over {
      border-color: var(--primary);
      background: #eff6ff;
    }
    .drop-icon { font-size: 48px; margin-bottom: 12px; }
    .profile-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .profile-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .project-item {
      padding: 12px;
      background: var(--bg);
      border-radius: var(--radius);
      margin-bottom: 8px;
    }
  `],
})
export class UploadCvComponent {
  selectedFile: File | null = null;
  isDragging = false;
  loading = false;
  error = '';
  profile: UserProfile | null = null;

  constructor(
    private api: ApiService,
    private state: StateService,
    private router: Router,
  ) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) this.selectedFile = input.files[0];
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file?.type === 'application/pdf') this.selectedFile = file;
  }

  upload() {
    if (!this.selectedFile) return;
    this.loading = true;
    this.error = '';

    this.api.uploadCv(this.selectedFile).subscribe({
      next: (res) => {
        this.state.setUserId(res.user_id);
        this.state.setCvData(res);
        this.profile = res.profile;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.detail || 'Failed to parse CV. Please try again.';
        this.loading = false;
      },
    });
  }

  goToMapping() { this.router.navigate(['/mapping']); }
}
