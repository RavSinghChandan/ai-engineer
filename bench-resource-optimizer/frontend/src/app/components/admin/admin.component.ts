import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AdminUploadResponse, InternalDocument, ResourceRegistryResponse } from '../../models/types';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1 style="margin-bottom:4px;">HR Admin — Internal Knowledge Base</h1>
        <p style="color:var(--text-muted); font-size:14px;">
          Upload company-internal training documents. These replace all public internet links
          as training resources. All data stays internal — never sent externally.
        </p>
      </div>
      <span class="privacy-badge">🔒 Company Confidential</span>
    </div>

    <!-- ── Privacy notice ──────────────────────────────────────────────────── -->
    <div class="privacy-notice card">
      <h3 style="margin-bottom:10px; font-size:14px; color:#1d4ed8;">
        🛡 Data Privacy Architecture
      </h3>
      <div class="privacy-grid">
        <div class="privacy-item">
          <span class="privacy-icon">📄</span>
          <div>
            <p class="privacy-title">Employee CVs</p>
            <p class="privacy-desc">Text extracted locally. Only parsed profile (name, skills, years) stored. Raw bytes discarded immediately.</p>
          </div>
        </div>
        <div class="privacy-item">
          <span class="privacy-icon">📋</span>
          <div>
            <p class="privacy-title">Client Requirements / Role Templates</p>
            <p class="privacy-desc">Loaded from this internal knowledge base. Never sent to LLM verbatim — only retrieved chunks used as context.</p>
          </div>
        </div>
        <div class="privacy-item">
          <span class="privacy-icon">📚</span>
          <div>
            <p class="privacy-title">Internal Training Docs</p>
            <p class="privacy-desc">Chunked + embedded using on-premise HuggingFace model. No external API receives document content.</p>
          </div>
        </div>
        <div class="privacy-item">
          <span class="privacy-icon">🤖</span>
          <div>
            <p class="privacy-title">What LLM Sees</p>
            <p class="privacy-desc">Only: skill names, role title, experience years, retrieved text chunks. Never: full CVs, raw documents, or PII.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Upload form ─────────────────────────────────────────────────────── -->
    <div class="card">
      <h2 style="margin-bottom:20px;">Upload Internal Training Document</h2>

      <div
        class="drop-zone"
        [class.drag-over]="isDragging"
        (dragover)="onDragOver($event)"
        (dragleave)="isDragging=false"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
      >
        <input #fileInput type="file" accept=".pdf,.txt" style="display:none"
               (change)="onFileSelected($event)" />
        <div class="drop-icon">📁</div>
        <p><strong>Click to upload</strong> or drag and drop</p>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">
          PDF or .txt · Internal use only · Max 50MB
        </p>
        <p *ngIf="selectedFile" class="selected-file">
          📄 {{ selectedFile.name }} ({{ (selectedFile.size / 1024).toFixed(0) }} KB)
        </p>
      </div>

      <div class="form-row" style="margin-top:20px;">
        <div class="form-field">
          <label>Skills Covered <span style="color:var(--text-muted); font-weight:400;">(comma-separated)</span></label>
          <input type="text" [(ngModel)]="skillTags"
                 placeholder="e.g. Java, Spring Boot, Kubernetes"
                 style="width:100%;" />
          <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">
            Used to route this document to relevant training plans.
          </p>
        </div>
        <div class="form-field">
          <label>Classification</label>
          <select [(ngModel)]="classification" style="width:100%;">
            <option value="internal">Internal</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
      </div>

      <div *ngIf="error" class="alert alert-error" style="margin-top:16px;">{{ error }}</div>

      <button class="btn btn-primary" style="margin-top:20px;"
              [disabled]="!selectedFile || uploading" (click)="upload()">
        <span *ngIf="uploading" class="spinner"></span>
        {{ uploading ? 'Indexing document...' : 'Index Document into Knowledge Base' }}
      </button>
    </div>

    <!-- Upload success -->
    <div *ngIf="lastUpload" class="card upload-success">
      <h3 style="color:var(--success); margin-bottom:12px;">✅ Document Indexed</h3>
      <div class="upload-meta-grid">
        <div class="upload-meta-item">
          <span class="upload-meta-key">Document</span>
          <span class="upload-meta-val">{{ lastUpload.title }}</span>
        </div>
        <div class="upload-meta-item">
          <span class="upload-meta-key">Chunks Indexed</span>
          <span class="upload-meta-val">{{ lastUpload.chunks_indexed }}</span>
        </div>
        <div class="upload-meta-item">
          <span class="upload-meta-key">Skills Tagged</span>
          <span class="upload-meta-val">{{ lastUpload.skill_tags.join(', ') || '—' }}</span>
        </div>
        <div class="upload-meta-item">
          <span class="upload-meta-key">Classification</span>
          <span class="upload-meta-val">
            <span class="classification-badge"
                  [class.badge-conf]="lastUpload.classification === 'confidential'">
              {{ lastUpload.classification }}
            </span>
          </span>
        </div>
        <div class="upload-meta-item">
          <span class="upload-meta-key">Source</span>
          <span class="upload-meta-val">{{ lastUpload.source }}</span>
        </div>
      </div>
      <p style="font-size:13px; color:var(--text-muted); margin-top:12px;">
        {{ lastUpload.message }}
      </p>
    </div>

    <!-- ── Resource registry ────────────────────────────────────────────────── -->
    <div class="card" *ngIf="registry">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
        <h2>Internal Resource Registry</h2>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="stat-pill">{{ registry.total_skill_mappings }} skills mapped</span>
          <span class="stat-pill stat-pill-green">{{ registry.indexed_documents.length }} docs indexed</span>
          <button class="btn btn-secondary" style="font-size:12px; padding:5px 12px;"
                  (click)="loadRegistry()">↻ Refresh</button>
        </div>
      </div>

      <!-- Indexed documents -->
      <div *ngIf="registry.indexed_documents.length" style="margin-bottom:20px;">
        <p style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
          Uploaded Documents
        </p>
        <div *ngFor="let doc of registry.indexed_documents" class="doc-row">
          <div class="doc-icon">📁</div>
          <div class="doc-info">
            <p class="doc-title">{{ doc.title }}</p>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
              <span *ngFor="let tag of doc.skill_tags" class="skill-chip">{{ tag }}</span>
              <span class="classification-badge" [class.badge-conf]="doc.classification === 'confidential'">
                {{ doc.classification }}
              </span>
            </div>
          </div>
          <div class="doc-stats">
            <span class="doc-chunks">{{ doc.chunk_count }} chunks</span>
            <span class="doc-date">{{ (doc.uploaded_at * 1000) | date:'dd MMM HH:mm' }}</span>
          </div>
        </div>
      </div>

      <div *ngIf="!registry.indexed_documents.length" class="no-docs">
        <p>No documents uploaded yet. Upload your first internal document above.</p>
      </div>

      <!-- Skill registry (built-in) -->
      <div>
        <p style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
          Built-in Skill → Internal Portal Mappings
        </p>
        <div class="skill-grid">
          <span *ngFor="let skill of registry.resource_registry" class="skill-registry-item">
            🔒 {{ skill }}
          </span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">
          {{ registry.note }}
        </p>
      </div>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .privacy-badge {
      background: #fee2e2; color: #b91c1c;
      font-size: 12px; font-weight: 700;
      padding: 6px 14px; border-radius: 999px;
    }

    /* Privacy notice */
    .privacy-notice { background: #eff6ff; border-color: #bfdbfe; margin-bottom: 20px; }
    .privacy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .privacy-item { display: flex; gap: 12px; align-items: flex-start; }
    .privacy-icon { font-size: 22px; flex-shrink: 0; }
    .privacy-title { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
    .privacy-desc  { font-size: 12px; color: #475569; }

    /* Upload */
    .drop-zone {
      border: 2px dashed var(--border); border-radius: var(--radius);
      padding: 36px; text-align: center; cursor: pointer; transition: all 0.15s;
    }
    .drop-zone:hover, .drop-zone.drag-over {
      border-color: var(--primary); background: #eff6ff;
    }
    .drop-icon { font-size: 42px; margin-bottom: 10px; }
    .selected-file {
      margin-top: 10px; padding: 6px 12px;
      background: #dbeafe; color: #1d4ed8;
      border-radius: var(--radius); font-size: 13px; font-weight: 600; display: inline-block;
    }

    .form-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .form-field { display: flex; flex-direction: column; gap: 4px; }
    .form-field label { font-size: 13px; font-weight: 600; }

    /* Upload success */
    .upload-success { border-left: 4px solid var(--success); }
    .upload-meta-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 12px; }
    .upload-meta-item { display: flex; flex-direction: column; gap: 3px; }
    .upload-meta-key { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .upload-meta-val { font-size: 13px; font-weight: 600; }

    /* Classification */
    .classification-badge {
      font-size: 10px; font-weight: 700;
      padding: 2px 7px; border-radius: 999px;
      background: #dbeafe; color: #1d4ed8;
    }
    .badge-conf { background: #f3e8ff; color: #7e22ce; }

    /* Registry */
    .stat-pill {
      font-size: 12px; font-weight: 600; padding: 3px 10px;
      border-radius: 999px; background: #f1f5f9; color: #475569;
    }
    .stat-pill-green { background: #dcfce7; color: #15803d; }

    .doc-row {
      display: flex; gap: 14px; align-items: flex-start;
      padding: 12px; border: 1px solid var(--border);
      border-radius: var(--radius); margin-bottom: 8px;
      background: #fafafa;
    }
    .doc-icon { font-size: 24px; flex-shrink: 0; }
    .doc-info { flex: 1; }
    .doc-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .doc-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .doc-chunks { font-size: 12px; font-weight: 700; color: #3b82f6; }
    .doc-date   { font-size: 11px; color: var(--text-muted); }

    .skill-chip {
      font-size: 11px; font-weight: 600; padding: 2px 7px;
      border-radius: 999px; background: #dbeafe; color: #1d4ed8;
    }

    .no-docs { text-align: center; padding: 24px; color: var(--text-muted); font-size: 14px; }

    .skill-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .skill-registry-item {
      font-size: 11px; padding: 3px 9px; border-radius: 999px;
      background: #f8fafc; border: 1px solid var(--border); color: #475569;
    }
  `],
})
export class AdminComponent implements OnInit {
  selectedFile: File | null = null;
  isDragging = false;
  uploading = false;
  error = '';
  skillTags = '';
  classification = 'internal';
  lastUpload: AdminUploadResponse | null = null;
  registry: ResourceRegistryResponse | null = null;

  constructor(private api: ApiService) {}

  ngOnInit() { this.loadRegistry(); }

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
    if (file) this.selectedFile = file;
  }

  upload() {
    if (!this.selectedFile) return;
    this.uploading = true;
    this.error = '';
    this.lastUpload = null;

    this.api.adminUploadResource(this.selectedFile, this.skillTags, this.classification).subscribe({
      next: res => {
        this.lastUpload = res;
        this.uploading = false;
        this.selectedFile = null;
        this.skillTags = '';
        this.loadRegistry();
      },
      error: err => {
        this.error = err.error?.detail ?? 'Upload failed. Please try again.';
        this.uploading = false;
      },
    });
  }

  loadRegistry() {
    this.api.getAdminResources().subscribe({
      next: r => { this.registry = r; },
      error: () => {},
    });
  }
}
