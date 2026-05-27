import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="profile-page">

      <!-- ── Identity card ──────────────────────────────────────────────── -->
      <div class="identity-card card">
        <div class="id-left">
          <div class="big-avatar">{{ initial }}</div>
          <div class="id-info">
            <div class="id-name">{{ user?.user_id }}</div>
            <div class="id-role-badge" [class.admin]="isAdmin">
              {{ isAdmin ? '🔑 Administrator' : '👤 Regular User' }}
            </div>
            <div class="id-since">Session valid for {{ hoursLeft }}h</div>
          </div>
        </div>
        <div class="id-right">
          <div class="stat-pill">
            <span class="stat-label">Role</span>
            <span class="stat-val">{{ isAdmin ? 'admin' : 'user' }}</span>
          </div>
          <div class="stat-pill">
            <span class="stat-label">CV Uploaded</span>
            <span class="stat-val">{{ profile ? 'Yes' : 'No' }}</span>
          </div>
          <div class="stat-pill">
            <span class="stat-label">Readiness</span>
            <span class="stat-val" [style.color]="scoreColor">
              {{ readiness !== null ? readiness + '%' : '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- ── CV Profile ─────────────────────────────────────────────────── -->
      <div *ngIf="profile; else noProfile" class="two-col">

        <div class="card profile-section">
          <h3 class="section-title">Personal Info</h3>
          <div class="info-row"><span class="info-label">Full Name</span><span>{{ profile.name }}</span></div>
          <div class="info-row"><span class="info-label">Email</span><span>{{ profile.email || '—' }}</span></div>
          <div class="info-row"><span class="info-label">Phone</span><span>{{ profile.phone || '—' }}</span></div>
          <div class="info-row"><span class="info-label">Experience</span><span>{{ profile.experience_years }} years</span></div>
          <div class="info-row"><span class="info-label">Education</span><span>{{ profile.education || '—' }}</span></div>
        </div>

        <div class="card profile-section">
          <h3 class="section-title">Skills</h3>
          <div class="tags-wrap">
            <span *ngFor="let s of profile.skills" class="tag tag-skill">{{ s }}</span>
            <span *ngIf="!profile.skills?.length" class="no-data">No skills extracted</span>
          </div>

          <h3 class="section-title" style="margin-top:20px;">Roles</h3>
          <div class="tags-wrap">
            <span *ngFor="let r of profile.roles" class="tag tag-role">{{ r }}</span>
            <span *ngIf="!profile.roles?.length" class="no-data">No roles extracted</span>
          </div>

          <h3 class="section-title" style="margin-top:20px;">Projects</h3>
          <div *ngFor="let p of (profile.projects || [])" class="project-row">
            <span class="dot"></span>{{ p.name || p }}
          </div>
          <span *ngIf="!profile.projects?.length" class="no-data">No projects extracted</span>
        </div>

      </div>

      <ng-template #noProfile>
        <div class="card no-profile-card">
          <div class="np-icon">📄</div>
          <div class="np-title">No CV uploaded yet</div>
          <p class="np-text">Upload your resume to see your extracted profile here.</p>
          <a routerLink="/upload" class="btn btn-primary" style="display:inline-block;text-decoration:none;">
            Upload CV →
          </a>
        </div>
      </ng-template>

      <!-- ── Admin panel hint ───────────────────────────────────────────── -->
      <div *ngIf="isAdmin" class="card admin-hint">
        <div class="ah-icon">🔑</div>
        <div>
          <div class="ah-title">Admin Access</div>
          <div class="ah-text">You have full access to role management, internal document upload, and system metrics.</div>
        </div>
        <a routerLink="/admin" class="btn btn-admin" style="text-decoration:none;">Open HR Admin →</a>
      </div>

    </div>
  `,
  styles: [`
    .profile-page { display: flex; flex-direction: column; gap: 24px; }

    /* Identity card */
    .identity-card {
      display: flex; align-items: center;
      justify-content: space-between;
      gap: 24px; flex-wrap: wrap;
      padding: 28px 32px;
    }
    .id-left  { display: flex; align-items: center; gap: 20px; }
    .big-avatar {
      width: 72px; height: 72px;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      color: #fff; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; font-weight: 700;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .id-name {
      font-size: 22px; font-weight: 700;
      color: #1e293b; margin-bottom: 6px;
    }
    .id-role-badge {
      display: inline-block;
      background: #dbeafe; color: #1d4ed8;
      font-size: 12px; font-weight: 600;
      padding: 3px 12px; border-radius: 20px;
      margin-bottom: 6px;
    }
    .id-role-badge.admin { background: #fef3c7; color: #92400e; }
    .id-since { font-size: 12px; color: #94a3b8; }
    .id-right  { display: flex; gap: 12px; flex-wrap: wrap; }
    .stat-pill {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 18px;
      text-align: center;
      min-width: 90px;
    }
    .stat-label { display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
    .stat-val   { font-size: 16px; font-weight: 700; color: #1e293b; }

    /* Two col layout */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

    .profile-section { padding: 24px; }
    .section-title {
      font-size: 13px; font-weight: 700;
      color: #64748b; text-transform: uppercase;
      letter-spacing: 0.5px; margin: 0 0 14px;
    }
    .info-row {
      display: flex; gap: 12px; padding: 8px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px; color: #334155;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { width: 110px; color: #94a3b8; font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .tags-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag {
      padding: 3px 12px; border-radius: 20px;
      font-size: 12px; font-weight: 500;
    }
    .tag-skill { background: #dbeafe; color: #1e40af; }
    .tag-role  { background: #dcfce7; color: #166534; }
    .project-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: #475569;
      padding: 4px 0;
    }
    .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #3b82f6; flex-shrink: 0;
    }
    .no-data { font-size: 13px; color: #94a3b8; }

    /* No profile */
    .no-profile-card {
      text-align: center; padding: 48px 32px;
    }
    .np-icon  { font-size: 48px; margin-bottom: 12px; }
    .np-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
    .np-text  { color: #64748b; font-size: 14px; margin-bottom: 20px; }

    /* Admin hint */
    .admin-hint {
      display: flex; align-items: center; gap: 16px;
      background: #fffbeb; border: 1px solid #fde68a;
      padding: 20px 24px; flex-wrap: wrap;
    }
    .ah-icon  { font-size: 28px; }
    .ah-title { font-size: 15px; font-weight: 700; color: #92400e; margin-bottom: 4px; }
    .ah-text  { font-size: 13px; color: #b45309; }
    .btn-admin {
      margin-left: auto; background: #f59e0b; color: #fff;
      border: none; border-radius: 8px; padding: 8px 18px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      white-space: nowrap;
    }
  `],
})
export class ProfileComponent implements OnInit {
  user      = this.auth.currentUser();
  isAdmin   = this.auth.isAdmin();
  profile: any = null;
  readiness: number | null = null;

  get initial(): string {
    return (this.user?.user_id ?? '?')[0].toUpperCase();
  }

  get hoursLeft(): number {
    if (!this.user?.exp) return 0;
    return Math.max(0, Math.round((this.user.exp - Date.now() / 1000) / 3600));
  }

  get scoreColor(): string {
    if (this.readiness === null) return '#94a3b8';
    if (this.readiness >= 70) return '#16a34a';
    if (this.readiness >= 40) return '#d97706';
    return '#dc2626';
  }

  constructor(
    private auth: AuthService,
    private state: StateService,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    // Use CV data already in state (from upload step)
    const cv = this.state.cvData;
    if (cv?.profile) {
      this.profile = cv.profile;
    }

    // Try to load progress/readiness from backend if user_id known
    const uid = this.state.userId || this.user?.user_id;
    if (uid) {
      this.http.get<any>(`/api/progress/${uid}`).subscribe({
        next: (data) => {
          this.readiness = data?.readiness_score ?? null;
          // Also grab profile from progress if not already set
          if (!this.profile && data?.profile) {
            this.profile = data.profile;
          }
        },
        error: () => { /* user may not have a plan yet — fine */ },
      });
    }
  }
}
