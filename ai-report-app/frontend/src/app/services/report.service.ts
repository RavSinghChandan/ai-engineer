import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

export interface ReportRequest {
  textInput?: string;
  file?: File;
  logo?: File;
  profilePic?: File;
  authorName?: string;
}

const TIMEOUT_MS = 120_000; // 2 minutes hard cap

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly base   = 'http://localhost:8002';
  private readonly apiKey = 'ai-report-saas-2024';

  private get headers(): HttpHeaders {
    return new HttpHeaders({ 'X-API-Key': this.apiKey });
  }

  constructor(private http: HttpClient) {}

  generateReport(req: ReportRequest): Observable<Blob> {
    const form = new FormData();
    if (req.textInput)  form.append('text_input',  req.textInput);
    if (req.file)       form.append('file',         req.file, req.file.name);
    if (req.logo)       form.append('logo',         req.logo, req.logo.name);
    if (req.profilePic) form.append('profile_pic',  req.profilePic, req.profilePic.name);
    if (req.authorName) form.append('author_name',  req.authorName);

    return this.http
      .post(`${this.base}/generate-report`, form, {
        headers: this.headers,
        responseType: 'blob',
      })
      .pipe(timeout(TIMEOUT_MS));
  }

  generateCarousel(topic: string): Observable<Blob> {
    const form = new FormData();
    form.append('topic', topic);
    return this.http
      .post(`${this.base}/generate-carousel`, form, {
        headers: this.headers,
        responseType: 'blob',
      })
      .pipe(timeout(TIMEOUT_MS));
  }
}
