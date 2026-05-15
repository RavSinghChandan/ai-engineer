import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

const BACKEND = 'http://localhost:8080';

interface TenantRow {
  tenant_id: string;
  name: string;
  is_active: boolean;
  key_count: number;
}

interface KeyRow {
  key: string;
  tenant_id: string;
  role: string;
  description: string;
  is_active: boolean;
}

interface NewTenantForm {
  name: string;
  admin_description: string;
}

interface LeadRow {
  lead_id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  consent: boolean;
  status: string;
  created_at: number;
  updated_at: number;
  notes: string;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="au-wrap">

  <!-- Header -->
  <div class="au-header">
    <div class="au-header-left">
      <button class="au-back-btn" (click)="goHome()" title="Back to Home">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="au-brand">
        <span class="au-brand-mark">✦</span>
        <span class="au-brand-name">Aura with Rav</span>
        <span class="au-divider">·</span>
        <span class="au-page-name">User Management</span>
      </div>
    </div>
    <div class="au-header-right">
      <span class="au-role-badge superadmin">SUPERADMIN</span>
      <span class="au-tenant-name">{{ auth.tenantName() }}</span>
    </div>
  </div>

  <!-- Error banner -->
  @if (error()) {
    <div class="au-error-banner">⚠ {{ error() }}</div>
  }

  <!-- Create tenant panel — SUPERADMIN only -->
  @if (auth.isSuperAdmin()) {
  <div class="au-section">
    <div class="au-section-header">
      <h2 class="au-section-title">Create New Tenant</h2>
      <button class="au-toggle-btn" (click)="showCreateForm.set(!showCreateForm())">
        {{ showCreateForm() ? 'Cancel' : '+ New Tenant' }}
      </button>
    </div>

    @if (showCreateForm()) {
      <div class="au-create-form">
        <div class="au-field">
          <label class="au-label">Tenant / Company Name</label>
          <input class="au-input" type="text" [value]="newTenant.name"
            (input)="newTenant.name = $any($event.target).value"
            placeholder="e.g. Acme Corp"/>
        </div>
        <div class="au-field">
          <label class="au-label">Admin Key Description</label>
          <input class="au-input" type="text" [value]="newTenant.admin_description"
            (input)="newTenant.admin_description = $any($event.target).value"
            placeholder="Primary admin key"/>
        </div>
        <button class="au-btn-primary" [disabled]="creating()" (click)="createTenant()">
          @if (creating()) { Creating… } @else { Create Tenant }
        </button>
        @if (createdKey()) {
          <div class="au-key-reveal">
            <strong>Admin API Key (copy now — shown only once):</strong>
            <code class="au-key-code">{{ createdKey() }}</code>
          </div>
        }
      </div>
    }
  </div>
  } <!-- end @if(auth.isSuperAdmin()) create tenant -->

  <!-- Tenants table — SUPERADMIN only -->
  @if (auth.isSuperAdmin()) {
  <div class="au-section">
    <div class="au-section-header">
      <h2 class="au-section-title">All Tenants</h2>
      <button class="au-refresh-btn" [disabled]="loading()" (click)="loadData()">
        {{ loading() ? 'Loading…' : '↻ Refresh' }}
      </button>
    </div>

    @if (tenants().length === 0 && !loading()) {
      <p class="au-empty">No tenants found.</p>
    }

    <div class="au-table-wrap">
      <table class="au-table">
        <thead>
          <tr>
            <th>Tenant Name</th>
            <th>ID</th>
            <th>Keys</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (t of tenants(); track t.tenant_id) {
            <tr [class.au-row-locked]="!t.is_active">
              <td class="au-cell-name">{{ t.name }}</td>
              <td class="au-cell-id">{{ t.tenant_id }}</td>
              <td class="au-cell-keys">{{ t.key_count }}</td>
              <td>
                <span class="au-status-badge" [class.active]="t.is_active" [class.locked]="!t.is_active">
                  {{ t.is_active ? 'Active' : 'Locked' }}
                </span>
              </td>
              <td class="au-cell-actions">
                @if (t.is_active) {
                  <button class="au-btn-lock" (click)="lockTenant(t.tenant_id)" title="Lock tenant">
                    🔒 Lock
                  </button>
                } @else {
                  <button class="au-btn-unlock" (click)="unlockTenant(t.tenant_id)" title="Unlock tenant">
                    🔓 Unlock
                  </button>
                }
                <button class="au-btn-danger"
                  (click)="confirmDelete(t)"
                  [disabled]="t.tenant_id === 'tenant_master'"
                  title="{{ t.tenant_id === 'tenant_master' ? 'Cannot delete master tenant' : 'Delete tenant' }}">
                  🗑 Delete
                </button>
                <button class="au-btn-keys" (click)="toggleKeys(t.tenant_id)">
                  {{ expandedTenant() === t.tenant_id ? 'Hide Keys' : 'Show Keys' }}
                </button>
              </td>
            </tr>
            @if (expandedTenant() === t.tenant_id) {
              <tr class="au-keys-row">
                <td colspan="5">
                  <div class="au-keys-panel">
                    <div class="au-keys-header">
                      <span class="au-keys-label">API Keys for {{ t.name }}</span>
                      <button class="au-btn-add-key" (click)="openAddKey(t.tenant_id)">+ Add Key</button>
                    </div>
                    @if (addKeyForTenant() === t.tenant_id) {
                      <div class="au-add-key-form">
                        <select class="au-input au-select" (change)="newKeyRole = $any($event.target).value">
                          <option value="user">USER</option>
                          <option value="admin">ADMIN</option>
                        </select>
                        <input class="au-input" type="text" [value]="newKeyDesc"
                          (input)="newKeyDesc = $any($event.target).value"
                          placeholder="Key description"/>
                        <button class="au-btn-primary au-btn-sm" (click)="addKey(t.tenant_id)">Create</button>
                        <button class="au-btn-sm" (click)="addKeyForTenant.set(null)">Cancel</button>
                        @if (addedKey()) {
                          <div class="au-key-reveal">
                            <strong>New Key (copy now):</strong>
                            <code class="au-key-code">{{ addedKey() }}</code>
                          </div>
                        }
                      </div>
                    }
                    @for (k of keysForTenant(t.tenant_id); track k.key) {
                      <div class="au-key-row" [class.au-key-inactive]="!k.is_active">
                        <span class="au-key-role-badge" [class]="k.role">{{ k.role }}</span>
                        <code class="au-key-val">{{ k.key }}</code>
                        <span class="au-key-desc">{{ k.description }}</span>
                        <span class="au-key-status" [class.active]="k.is_active">{{ k.is_active ? 'Active' : 'Revoked' }}</span>
                        @if (k.is_active) {
                          <button class="au-btn-revoke" (click)="revokeKey(k.key)">Revoke</button>
                        }
                      </div>
                    }
                    @if (keysForTenant(t.tenant_id).length === 0) {
                      <p class="au-keys-empty">No keys yet.</p>
                    }
                  </div>
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  </div>
  } <!-- end @if(auth.isSuperAdmin()) tenants table -->

  <!-- Leads section — visible to ADMIN and SUPERADMIN -->
  <div class="au-section">
    <div class="au-section-header">
      <h2 class="au-section-title">
        Expert Reading Requests
        @if (newLeadCount() > 0) {
          <span class="au-lead-new-badge">{{ newLeadCount() }} new</span>
        }
      </h2>
      <button class="au-refresh-btn" [disabled]="loading()" (click)="loadData()">↻ Refresh</button>
    </div>

    @if (leads().length === 0 && !loading()) {
      <p class="au-empty">No reading requests yet.</p>
    }

    <div class="au-leads-list">
      @for (lead of leads(); track lead.lead_id) {
        <div class="au-lead-card" [class.au-lead-new]="lead.status === 'submitted'">
          <div class="au-lead-top">
            <div class="au-lead-info">
              <span class="au-lead-name">{{ lead.name }}</span>
              <span class="au-lead-contact">{{ lead.email }}{{ lead.phone ? ' · ' + lead.phone : '' }}</span>
              @if (lead.dob) {
                <span class="au-lead-dob">DOB: {{ lead.dob }}</span>
              }
            </div>
            <div class="au-lead-meta">
              <span class="au-lead-status-badge" [class]="'lstat-' + lead.status">
                {{ leadStatusLabel(lead.status) }}
              </span>
              <span class="au-lead-date">{{ lead.created_at * 1000 | date:'d MMM, h:mm a' }}</span>
            </div>
          </div>
          <div class="au-lead-actions">
            <select class="au-input au-select au-lead-select" [value]="lead.status"
              (change)="updateLeadStatus(lead.lead_id, $any($event.target).value)">
              <option value="submitted">Submitted</option>
              <option value="admin_notified">Astrologer Notified</option>
              <option value="expert_analysis">Expert Analysis</option>
              <option value="report_ready">Report Ready</option>
            </select>
            <button class="au-btn-do-reading" (click)="doReadingForLead(lead)" title="Open intake pre-filled with this person's data">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v10M2 6l4.5 4.5 4.5-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Do Reading
            </button>
          </div>
        </div>
      }
    </div>
  </div>

</div>

<!-- Delete confirmation modal -->
@if (deleteTarget()) {
  <div class="au-modal-backdrop" (click)="deleteTarget.set(null)">
    <div class="au-modal" (click)="$event.stopPropagation()">
      <h3 class="au-modal-title">Delete Tenant?</h3>
      <p class="au-modal-body">
        This will permanently delete <strong>{{ deleteTarget()!.name }}</strong> and all their API keys.
        This cannot be undone.
      </p>
      <div class="au-modal-actions">
        <button class="au-btn-danger" (click)="deleteTenant(deleteTarget()!.tenant_id)">Delete</button>
        <button class="au-btn-sm" (click)="deleteTarget.set(null)">Cancel</button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
:host { display: block; min-height: 100vh; background: #f8fafc; font-family: 'Inter', system-ui, sans-serif; }

.au-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px 60px; }

/* Header */
.au-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 28px;
}
.au-header-left { display: flex; align-items: center; gap: 14px; }
.au-back-btn {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px; border: 1px solid #e5e7eb;
  background: #fff; cursor: pointer; color: #6b7280; transition: all .15s;
}
.au-back-btn:hover { border-color: #6366f1; color: #6366f1; }
.au-brand { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.au-brand-mark { color: #6366f1; font-size: 16px; }
.au-brand-name { font-weight: 700; color: #1e1b4b; }
.au-divider { color: #d1d5db; }
.au-page-name { color: #6b7280; font-weight: 500; }
.au-header-right { display: flex; align-items: center; gap: 10px; }
.au-tenant-name { font-size: 12px; color: #6b7280; font-weight: 500; }
.au-role-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.05em; }
.au-role-badge.superadmin { background: rgba(245,158,11,0.12); color: #b45309; border: 1px solid rgba(245,158,11,0.3); }

/* Error banner */
.au-error-banner {
  background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
  padding: 10px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 16px;
}

/* Sections */
.au-section { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 24px; margin-bottom: 20px; }
.au-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.au-section-title { font-size: 15px; font-weight: 700; color: #111827; margin: 0; }

/* Buttons */
.au-toggle-btn, .au-refresh-btn {
  padding: 7px 16px; border-radius: 8px; font-size: 12px; font-weight: 600;
  border: 1.5px solid #e5e7eb; background: #fff; cursor: pointer; color: #374151;
  font-family: inherit; transition: all .15s;
}
.au-toggle-btn:hover, .au-refresh-btn:hover { border-color: #6366f1; color: #6366f1; }
.au-btn-primary {
  padding: 9px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
  background: #6366f1; color: #fff; border: none; cursor: pointer;
  font-family: inherit; transition: all .15s;
}
.au-btn-primary:hover:not(:disabled) { background: #4f46e5; }
.au-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.au-btn-sm {
  padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 500;
  border: 1px solid #e5e7eb; background: #fff; cursor: pointer; color: #6b7280;
  font-family: inherit; transition: all .15s;
}
.au-btn-sm:hover { border-color: #9ca3af; }

/* Create form */
.au-create-form { display: flex; flex-direction: column; gap: 12px; max-width: 420px; }
.au-field { display: flex; flex-direction: column; gap: 5px; }
.au-label { font-size: 12px; font-weight: 600; color: #374151; }
.au-input {
  padding: 9px 12px; border: 1.5px solid #e5e7eb; border-radius: 8px;
  font-size: 13px; font-family: inherit; color: #111827; outline: none;
  transition: border-color .15s;
}
.au-input:focus { border-color: #6366f1; }
.au-select { cursor: pointer; }

.au-key-reveal {
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;
  padding: 12px 16px; font-size: 12px; color: #166534;
}
.au-key-code {
  display: block; font-family: 'Courier New', monospace; font-size: 11px;
  word-break: break-all; margin-top: 4px; color: #14532d;
}

/* Table */
.au-table-wrap { overflow-x: auto; }
.au-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.au-table th { text-align: left; padding: 10px 12px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
.au-table td { padding: 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
.au-row-locked { opacity: 0.6; }
.au-cell-name { font-weight: 600; color: #111827; }
.au-cell-id { font-family: monospace; font-size: 11px; color: #9ca3af; }
.au-cell-keys { text-align: center; font-weight: 700; color: #6366f1; }
.au-cell-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

.au-status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
.au-status-badge.active { background: rgba(16,185,129,0.1); color: #065f46; }
.au-status-badge.locked { background: rgba(239,68,68,0.1); color: #991b1b; }

.au-btn-lock, .au-btn-unlock, .au-btn-danger, .au-btn-keys, .au-btn-revoke, .au-btn-add-key {
  padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
  cursor: pointer; border: 1.5px solid; font-family: inherit; transition: all .15s;
}
.au-btn-lock { border-color: #fde68a; background: #fffbeb; color: #92400e; }
.au-btn-lock:hover { background: #fef3c7; }
.au-btn-unlock { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
.au-btn-unlock:hover { background: #dcfce7; }
.au-btn-danger { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.au-btn-danger:hover:not(:disabled) { background: #fee2e2; }
.au-btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }
.au-btn-keys { border-color: #e5e7eb; background: #fff; color: #6b7280; }
.au-btn-keys:hover { border-color: #6366f1; color: #6366f1; }
.au-btn-revoke { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.au-btn-revoke:hover { background: #fee2e2; }
.au-btn-add-key { border-color: #c7d2fe; background: #eef2ff; color: #4338ca; }
.au-btn-add-key:hover { background: #e0e7ff; }

/* Keys panel */
.au-keys-row td { padding: 0 12px 12px 12px; }
.au-keys-panel { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
.au-keys-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.au-keys-label { font-size: 12px; font-weight: 700; color: #374151; }
.au-keys-empty { font-size: 12px; color: #9ca3af; margin: 0; }
.au-add-key-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
.au-add-key-form .au-input { flex: 1; min-width: 120px; }

.au-key-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 0;
  border-bottom: 1px solid #e5e7eb; flex-wrap: wrap;
}
.au-key-row:last-child { border-bottom: none; }
.au-key-inactive { opacity: 0.5; }
.au-key-role-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; flex-shrink: 0; }
.au-key-role-badge.user { background: rgba(99,102,241,0.1); color: #4338ca; }
.au-key-role-badge.admin { background: rgba(16,185,129,0.1); color: #065f46; }
.au-key-role-badge.superadmin { background: rgba(245,158,11,0.1); color: #b45309; }
.au-key-val { font-family: monospace; font-size: 11px; color: #374151; word-break: break-all; flex: 1; }
.au-key-desc { font-size: 11px; color: #9ca3af; }
.au-key-status { font-size: 10px; font-weight: 600; }
.au-key-status.active { color: #10b981; }

/* Modal */
.au-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.au-modal {
  background: #fff; border-radius: 14px; padding: 28px 32px;
  max-width: 380px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.au-modal-title { font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 10px; }
.au-modal-body { font-size: 13px; color: #4b5563; line-height: 1.5; margin: 0 0 20px; }
.au-modal-actions { display: flex; gap: 10px; }

.au-empty { font-size: 13px; color: #9ca3af; }

/* ── Leads ── */
.au-lead-new-badge {
  display: inline-block; margin-left: 8px; padding: 2px 8px;
  background: #ef4444; color: #fff; border-radius: 99px;
  font-size: 11px; font-weight: 700;
}
.au-leads-list { display: flex; flex-direction: column; gap: 10px; }
.au-lead-card {
  border: 1.5px solid #e5e7eb; border-radius: 12px;
  padding: 14px 18px; background: #fff;
  display: flex; flex-direction: column; gap: 10px;
}
.au-lead-new { border-color: #fde68a; background: #fffbeb; }
.au-lead-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.au-lead-info { display: flex; flex-direction: column; gap: 2px; }
.au-lead-name { font-size: 14px; font-weight: 700; color: #111827; }
.au-lead-contact { font-size: 12px; color: #6b7280; }
.au-lead-dob { font-size: 11px; color: #9ca3af; }
.au-lead-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.au-lead-date { font-size: 11px; color: #9ca3af; }
.au-lead-status-badge {
  font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px;
}
.lstat-submitted       { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.lstat-admin_notified  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.lstat-expert_analysis { background: #f5f3ff; color: #5b21b6; border: 1px solid #ddd6fe; }
.lstat-report_ready    { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.au-lead-actions { display: flex; gap: 8px; align-items: center; }
.au-lead-select { max-width: 220px; }
  `]
})
export class AdminUsersPage implements OnInit {
  private router = inject(Router);
  private http   = inject(HttpClient);
  readonly auth  = inject(AuthService);

  readonly tenants        = signal<TenantRow[]>([]);
  readonly allKeys        = signal<KeyRow[]>([]);
  readonly leads          = signal<LeadRow[]>([]);
  readonly loading        = signal(false);
  readonly error          = signal('');
  readonly creating       = signal(false);
  readonly createdKey     = signal('');
  readonly showCreateForm  = signal(false);
  readonly expandedTenant  = signal<string | null>(null);
  readonly addKeyForTenant = signal<string | null>(null);
  readonly deleteTarget   = signal<TenantRow | null>(null);
  readonly addedKey       = signal('');

  readonly newLeadCount = signal(0);

  newTenant: NewTenantForm = { name: '', admin_description: 'Primary admin key' };
  newKeyRole = 'user';
  newKeyDesc = '';

  ngOnInit() { this.loadData(); }

  async loadData() {
    this.loading.set(true);
    this.error.set('');

    // Always load leads (ADMIN + SUPERADMIN)
    try {
      const leads = await firstValueFrom(this.http.get<LeadRow[]>(`${BACKEND}/admin/leads`));
      this.leads.set(leads ?? []);
      this.newLeadCount.set((leads ?? []).filter((l: LeadRow) => l.status === 'submitted').length);
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to load leads.');
    }

    // Only SUPERADMIN can see all tenants + all keys
    if (this.auth.isSuperAdmin()) {
      try {
        const [tenants, keys] = await Promise.all([
          firstValueFrom(this.http.get<TenantRow[]>(`${BACKEND}/admin/tenants`)),
          firstValueFrom(this.http.get<KeyRow[]>(`${BACKEND}/admin/all-keys`)),
        ]);
        this.tenants.set(tenants ?? []);
        this.allKeys.set(keys ?? []);
      } catch (e: any) {
        this.error.set(e?.error?.detail ?? 'Failed to load tenant data.');
      }
    }

    this.loading.set(false);
  }

  leadStatusLabel(status: string): string {
    const map: Record<string, string> = {
      submitted:       '⏳ New Request',
      admin_notified:  '🔔 Expert Notified',
      expert_analysis: '✦ Under Analysis',
      report_ready:    '✅ Report Ready',
    };
    return map[status] ?? status;
  }

  async updateLeadStatus(leadId: string, status: string) {
    try {
      await firstValueFrom(this.http.patch(`${BACKEND}/admin/leads/${leadId}/status`, { status }));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to update lead status.');
    }
  }

  keysForTenant(tenantId: string): KeyRow[] {
    return this.allKeys().filter(k => k.tenant_id === tenantId);
  }

  toggleKeys(tenantId: string) {
    this.expandedTenant.set(this.expandedTenant() === tenantId ? null : tenantId);
    this.addKeyForTenant.set(null);
    this.addedKey.set('');
  }

  openAddKey(tenantId: string) {
    this.addKeyForTenant.set(tenantId);
    this.addedKey.set('');
    this.newKeyRole = 'user';
    this.newKeyDesc = '';
  }

  async createTenant() {
    if (!this.newTenant.name.trim()) { this.error.set('Tenant name is required.'); return; }
    this.creating.set(true);
    this.error.set('');
    this.createdKey.set('');
    try {
      const res: any = await firstValueFrom(
        this.http.post(`${BACKEND}/admin/tenants`, this.newTenant)
      );
      this.createdKey.set(res.admin_key);
      this.newTenant = { name: '', admin_description: 'Primary admin key' };
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to create tenant.');
    } finally {
      this.creating.set(false);
    }
  }

  async lockTenant(tenantId: string) {
    try {
      await firstValueFrom(this.http.patch(`${BACKEND}/admin/tenants/${tenantId}/lock`, {}));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to lock tenant.');
    }
  }

  async unlockTenant(tenantId: string) {
    try {
      await firstValueFrom(this.http.patch(`${BACKEND}/admin/tenants/${tenantId}/unlock`, {}));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to unlock tenant.');
    }
  }

  confirmDelete(tenant: TenantRow) {
    this.deleteTarget.set(tenant);
  }

  async deleteTenant(tenantId: string) {
    this.deleteTarget.set(null);
    try {
      await firstValueFrom(this.http.delete(`${BACKEND}/admin/tenants/${tenantId}`));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to delete tenant.');
    }
  }

  async addKey(tenantId: string) {
    this.addedKey.set('');
    try {
      const res: any = await firstValueFrom(
        this.http.post(`${BACKEND}/admin/tenants/${tenantId}/keys`, {
          role: this.newKeyRole,
          description: this.newKeyDesc,
        })
      );
      this.addedKey.set(res.key);
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to add key.');
    }
  }

  async revokeKey(key: string) {
    try {
      await firstValueFrom(this.http.delete(`${BACKEND}/admin/keys/${key}`));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to revoke key.');
    }
  }

  doReadingForLead(lead: LeadRow) {
    // Navigate to intake with lead data encoded as query params
    this.router.navigate(['/'], {
      queryParams: {
        leadId:  lead.lead_id,
        name:    lead.name,
        dob:     lead.dob,
        email:   lead.email,
        phone:   lead.phone,
      }
    });
  }

  goHome() { this.router.navigate(['/']); }
}
