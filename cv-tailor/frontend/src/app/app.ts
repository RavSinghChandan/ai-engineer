import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface Application {
  id: string;
  company: string;
  role: string;
  apply_url: string;
  ats_score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  created_at: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private http = inject(HttpClient);

  readonly apps = signal<Application[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');

  company = '';
  role = '';
  applyUrl = '';
  jobDescription = '';

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.apps.set(await firstValueFrom(this.http.get<Application[]>('/api/applications')));
  }

  async tailor(): Promise<void> {
    if (this.jobDescription.trim().length < 30) {
      this.error.set('Paste a real job description (at least a few lines).');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.post('/api/tailor', {
          company: this.company,
          role: this.role,
          apply_url: this.applyUrl,
          job_description: this.jobDescription,
        }),
      );
      this.company = this.role = this.applyUrl = this.jobDescription = '';
      await this.refresh();
    } catch (err: any) {
      this.error.set(err?.error?.detail ?? 'Tailoring failed. Is the backend running?');
    } finally {
      this.busy.set(false);
    }
  }

  downloadPdf(a: Application): void {
    window.open(`/api/applications/${a.id}/pdf`, '_blank');
  }

  async remove(a: Application): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/applications/${a.id}`));
    await this.refresh();
  }

  scoreClass(score: number): string {
    if (score >= 90) return 'score-high';
    if (score >= 75) return 'score-mid';
    return 'score-low';
  }
}
