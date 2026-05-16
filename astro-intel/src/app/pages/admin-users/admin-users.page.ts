import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const BACKEND = environment.apiUrl;

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

interface UserRow {
  user_id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: number;
}

interface LeadRow {
  lead_id:        string;
  name:           string;
  email:          string;
  phone:          string;
  dob:            string;
  consent:        boolean;
  status:         string;
  created_at:     number;
  updated_at:     number;
  notes:          string;
  place_of_birth: string;
  time_of_birth:  string;
  alias_name:     string;
  question:       string;
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
        <svg width="15" height="15" viewBox="0 0 13 13" fill="none">
          <path d="M1.5 6.5L6.5 2l5 4.5M2.5 6v5h2.5V8h3v3h2.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Home
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

  <!-- Users section — SUPERADMIN only -->
  @if (auth.isSuperAdmin()) {
  <div class="au-section">
    <div class="au-section-header">
      <h2 class="au-section-title">Users & Admins</h2>
      <button class="au-toggle-btn" (click)="showCreateAdmin.set(!showCreateAdmin())">
        {{ showCreateAdmin() ? 'Cancel' : '+ Create Admin' }}
      </button>
    </div>

    @if (showCreateAdmin()) {
      <div class="au-create-form" style="margin-bottom:16px">
        <div class="au-field">
          <label class="au-label">Full Name</label>
          <input class="au-input" type="text" [value]="newAdmin.name"
            (input)="newAdmin.name = $any($event.target).value" placeholder="Admin's name"/>
        </div>
        <div class="au-field">
          <label class="au-label">Email</label>
          <input class="au-input" type="email" [value]="newAdmin.email"
            (input)="newAdmin.email = $any($event.target).value" placeholder="admin@example.com"/>
        </div>
        <div class="au-field">
          <label class="au-label">Password</label>
          <input class="au-input" type="password" [value]="newAdmin.password"
            (input)="newAdmin.password = $any($event.target).value" placeholder="Min 8 characters"/>
        </div>
        <button class="au-btn-primary" [disabled]="creatingAdmin()" (click)="createAdmin()">
          @if (creatingAdmin()) { Creating… } @else { Create Admin Account }
        </button>
        @if (adminCreated()) {
          <div class="au-key-reveal">
            ✓ Admin account created for <strong>{{ adminCreated() }}</strong>.
            They can now log in at the Sign In page.
          </div>
        }
      </div>
    }

    @if (userList().length === 0 && !loading()) {
      <p class="au-empty">No users yet.</p>
    }
    <div class="au-table-wrap">
      <table class="au-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (u of userList(); track u.user_id) {
            <tr [class.au-row-locked]="!u.is_active">
              <td class="au-cell-name">{{ u.name }}</td>
              <td class="au-cell-id" style="font-family:inherit;font-size:13px">{{ u.email }}</td>
              <td>
                <span class="au-key-role-badge" [class]="u.role">{{ u.role }}</span>
              </td>
              <td>
                <span class="au-status-badge" [class.active]="u.is_active" [class.locked]="!u.is_active">
                  {{ u.is_active ? 'Active' : 'Locked' }}
                </span>
              </td>
              <td class="au-cell-actions">
                @if (u.role !== 'superadmin') {
                  @if (u.is_active) {
                    <button class="au-btn-lock" (click)="lockUser(u.email)">🔒 Lock</button>
                  } @else {
                    <button class="au-btn-unlock" (click)="unlockUser(u.email)">🔓 Unlock</button>
                  }
                  <button class="au-btn-danger" (click)="deleteUser(u.email)">🗑 Delete</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </div>
  } <!-- end users section -->

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
      <button class="refresh-btn" [class.spinning]="loading()" [disabled]="loading()" (click)="loadData()"><span class="refresh-icon">↻</span> {{ loading() ? 'Loading…' : 'Refresh' }}</button>
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
      <span class="auto-refresh-badge">Auto-refresh 30s</span><button class="refresh-btn" [class.spinning]="loading()" [disabled]="loading()" (click)="loadData()"><span class="refresh-icon">↻</span> {{ loading() ? 'Loading…' : 'Refresh' }}</button>
    </div>

    <!-- Search + Filter bar -->
    <div class="au-leads-toolbar">
      <div class="au-search-wrap">
        <svg class="au-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="#9ca3af" stroke-width="1.4"/>
          <path d="M9.5 9.5L12 12" stroke="#9ca3af" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input class="au-search-input" type="text" placeholder="Search name, email, phone…"
          [value]="leadSearch()" (input)="leadSearch.set($any($event.target).value)" />
        @if (leadSearch()) {
          <button class="au-search-clear" (click)="leadSearch.set('')">✕</button>
        }
      </div>
      <div class="au-filter-tabs">
        @for (f of leadFilters; track f.value) {
          <button class="au-filter-tab" [class.active]="leadFilter() === f.value"
            (click)="leadFilter.set(f.value)">
            {{ f.label }}
          </button>
        }
      </div>
    </div>

    <!-- Result count -->
    @if (filteredLeads().length !== leads().length) {
      <div class="au-lead-count">Showing {{ filteredLeads().length }} of {{ leads().length }} requests</div>
    }

    @if (filteredLeads().length === 0 && !loading()) {
      <p class="au-empty">
        {{ leads().length === 0 ? 'No reading requests yet.' : 'No results match your search.' }}
      </p>
    }

    <!-- Compact lead rows -->
    <div class="au-leads-list">
      @for (lead of filteredLeads(); track lead.lead_id) {
        <!-- Collapsed row — always visible -->
        <div class="au-lead-row" [class.au-lead-row-new]="lead.status === 'submitted'"
          (click)="toggleLead(lead.lead_id)">
          <div class="au-lead-row-left">
            <div class="au-lead-avatar" [class]="'av-' + lead.status">
              {{ lead.name[0]?.toUpperCase() }}
            </div>
            <div class="au-lead-row-info">
              <span class="au-lead-name">{{ lead.name }}</span>
              <span class="au-lead-sub">{{ lead.email }}</span>
            </div>
          </div>
          <div class="au-lead-row-right">
            <span class="au-lead-status-badge" [class]="'lstat-' + lead.status">
              {{ leadStatusShort(lead.status) }}
            </span>
            <span class="au-lead-date">{{ lead.created_at * 1000 | date:'d MMM' }}</span>
            <svg class="au-chevron" [class.open]="expandedLead() === lead.lead_id"
              width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>

        <!-- Expanded drawer — shown when this lead is selected -->
        @if (expandedLead() === lead.lead_id) {
          <div class="au-lead-drawer">
            <div class="au-drawer-grid">
              <div class="au-drawer-field">
                <span class="au-drawer-label">Email</span>
                <span class="au-drawer-val">{{ lead.email }}</span>
              </div>
              @if (lead.phone) {
                <div class="au-drawer-field">
                  <span class="au-drawer-label">Phone</span>
                  <span class="au-drawer-val">{{ lead.phone }}</span>
                </div>
              }
              @if (lead.dob) {
                <div class="au-drawer-field">
                  <span class="au-drawer-label">Date of Birth</span>
                  <span class="au-drawer-val">{{ lead.dob }}</span>
                </div>
              }
              @if (lead.time_of_birth) {
                <div class="au-drawer-field">
                  <span class="au-drawer-label">Time of Birth</span>
                  <span class="au-drawer-val">{{ lead.time_of_birth }}</span>
                </div>
              }
              @if (lead.place_of_birth) {
                <div class="au-drawer-field">
                  <span class="au-drawer-label">Place of Birth</span>
                  <span class="au-drawer-val">{{ lead.place_of_birth }}</span>
                </div>
              }
              @if (lead.question) {
                <div class="au-drawer-field au-drawer-field-full">
                  <span class="au-drawer-label">Question</span>
                  <span class="au-drawer-val">{{ lead.question }}</span>
                </div>
              }
              <div class="au-drawer-field">
                <span class="au-drawer-label">Submitted</span>
                <span class="au-drawer-val">{{ lead.created_at * 1000 | date:'d MMM yyyy, h:mm a' }}</span>
              </div>
            </div>
            <!-- Actions -->
            <div class="au-drawer-actions">
              <div class="au-drawer-status-wrap">
                <span class="au-drawer-label">Status</span>
                <select class="au-input au-select au-lead-select" [value]="lead.status"
                  (change)="updateLeadStatus(lead.lead_id, $any($event.target).value)">
                  <option value="submitted">⏳ Submitted</option>
                  <option value="admin_notified">🔔 Expert Notified</option>
                  <option value="expert_analysis">✦ Under Analysis</option>
                  <option value="report_ready">✅ Report Ready</option>
                </select>
              </div>
              <button class="au-btn-do-reading" (click)="doReadingForLead(lead); $event.stopPropagation()">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M5 6.5l1.5 1.5 2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Do Reading
              </button>
            </div>
          </div>
        }
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
  display: flex; align-items: center; justify-content: center; gap: 5px;
  height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid #e5e7eb;
  background: #fff; cursor: pointer; color: #6b7280; transition: all .15s;
  font-size: 13px; font-weight: 600; font-family: inherit; white-space: nowrap;
}
.au-back-btn:hover { border-color: #6366f1; color: #6366f1; background: rgba(99,102,241,0.06); }
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
.au-toggle-btn:hover, .au-refresh-btn:hover:not(:disabled) { border-color: #6366f1; color: #6366f1; }
.au-refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.au-refresh-icon { display: inline-block; }
.au-refresh-btn.spinning .au-refresh-icon { animation: au-spin 0.8s linear infinite; display: inline-block; }
@keyframes au-spin { to { transform: rotate(360deg); } }
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

/* Toolbar: search + filter */
.au-leads-toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
}
.au-search-wrap {
  position: relative; flex: 1; min-width: 180px;
}
.au-search-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none;
}
.au-search-input {
  width: 100%; padding: 7px 32px 7px 30px; border: 1.5px solid #e5e7eb;
  border-radius: 8px; font-size: 13px; font-family: inherit; color: #111827;
  outline: none; box-sizing: border-box; transition: border-color .15s;
}
.au-search-input:focus { border-color: #6366f1; }
.au-search-clear {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 12px; padding: 2px;
}
.au-search-clear:hover { color: #374151; }
.au-filter-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.au-filter-tab {
  padding: 5px 11px; border-radius: 20px; font-size: 11px; font-weight: 600;
  border: 1.5px solid #e5e7eb; background: #fff; color: #6b7280;
  cursor: pointer; font-family: inherit; white-space: nowrap; transition: all .15s;
}
.au-filter-tab.active { border-color: #6366f1; background: #eef2ff; color: #4338ca; }
.au-filter-tab:hover:not(.active) { border-color: #9ca3af; color: #374151; }

.au-lead-count { font-size: 11px; color: #9ca3af; margin-bottom: 6px; }

/* Compact lead rows */
.au-leads-list { display: flex; flex-direction: column; gap: 2px; }

.au-lead-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-radius: 10px; cursor: pointer;
  border: 1.5px solid transparent; background: #f9fafb;
  transition: background .12s, border-color .12s; gap: 12px;
}
.au-lead-row:hover { background: #f0f4ff; border-color: #c7d2fe; }
.au-lead-row-new { background: #fffbeb; border-color: #fde68a; }
.au-lead-row-new:hover { background: #fef9c3; border-color: #fbbf24; }

.au-lead-row-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.au-lead-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}
.av-submitted       { background: linear-gradient(135deg, #f59e0b, #d97706); }
.av-admin_notified  { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.av-expert_analysis { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
.av-report_ready    { background: linear-gradient(135deg, #10b981, #059669); }

.au-lead-row-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.au-lead-name { font-size: 13px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.au-lead-sub  { font-size: 11px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.au-lead-row-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.au-lead-date { font-size: 11px; color: #9ca3af; }
.au-lead-status-badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 99px; white-space: nowrap; }
.lstat-submitted       { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.lstat-admin_notified  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.lstat-expert_analysis { background: #f5f3ff; color: #5b21b6; border: 1px solid #ddd6fe; }
.lstat-report_ready    { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

.au-chevron { color: #9ca3af; transition: transform .2s; flex-shrink: 0; }
.au-chevron.open { transform: rotate(180deg); }

/* Expanded drawer */
.au-lead-drawer {
  margin: 0 0 4px 0; padding: 16px 18px; background: #fff;
  border: 1.5px solid #e0e7ff; border-radius: 10px;
  display: flex; flex-direction: column; gap: 14px;
  animation: drawer-in .15s ease;
}
@keyframes drawer-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

.au-drawer-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px;
}
.au-drawer-field { display: flex; flex-direction: column; gap: 2px; }
.au-drawer-field-full { grid-column: 1 / -1; }
.au-drawer-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
.au-drawer-val   { font-size: 12px; color: #111827; line-height: 1.4; }

.au-drawer-actions {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding-top: 12px; border-top: 1px solid #f3f4f6;
}
.au-drawer-status-wrap { display: flex; flex-direction: column; gap: 4px; }
.au-lead-select { max-width: 210px; }

.au-btn-do-reading {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 8px; font-size: 12px; font-weight: 700;
  background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff;
  border: none; cursor: pointer; font-family: inherit;
  box-shadow: 0 2px 8px rgba(99,102,241,0.35); transition: all .15s; white-space: nowrap;
  margin-left: auto;
}
.au-btn-do-reading:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.5); }
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

  readonly newLeadCount    = signal(0);
  readonly userList        = signal<UserRow[]>([]);
  readonly showCreateAdmin = signal(false);
  readonly creatingAdmin   = signal(false);
  readonly adminCreated    = signal('');

  // Lead list — search, filter, expand
  readonly leadSearch  = signal('');
  readonly leadFilter  = signal('all');
  readonly expandedLead = signal<string | null>(null);

  readonly leadFilters = [
    { value: 'all',            label: 'All' },
    { value: 'submitted',      label: '⏳ New' },
    { value: 'admin_notified', label: '🔔 Notified' },
    { value: 'expert_analysis',label: '✦ Analysis' },
    { value: 'report_ready',   label: '✅ Ready' },
  ];

  readonly filteredLeads = computed(() => {
    const q   = this.leadSearch().toLowerCase().trim();
    const f   = this.leadFilter();
    return this.leads().filter(l => {
      const matchFilter = f === 'all' || l.status === f;
      const matchSearch = !q ||
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.phone ?? '').toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  });

  newTenant: NewTenantForm = { name: '', admin_description: 'Primary admin key' };
  newAdmin = { name: '', email: '', password: '' };
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

    // Only SUPERADMIN can see all tenants + all keys + all users
    if (this.auth.isSuperAdmin()) {
      try {
        const [tenants, keys, users] = await Promise.all([
          firstValueFrom(this.http.get<TenantRow[]>(`${BACKEND}/admin/tenants`)),
          firstValueFrom(this.http.get<KeyRow[]>(`${BACKEND}/admin/all-keys`)),
          firstValueFrom(this.http.get<UserRow[]>(`${BACKEND}/admin/users`)),
        ]);
        this.tenants.set(tenants ?? []);
        this.allKeys.set(keys ?? []);
        this.userList.set(users ?? []);
      } catch (e: any) {
        this.error.set(e?.error?.detail ?? 'Failed to load tenant data.');
      }
    }

    this.loading.set(false);
  }

  toggleLead(id: string) {
    this.expandedLead.set(this.expandedLead() === id ? null : id);
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

  leadStatusShort(status: string): string {
    const map: Record<string, string> = {
      submitted:       '⏳ New',
      admin_notified:  '🔔 Notified',
      expert_analysis: '✦ Analysis',
      report_ready:    '✅ Ready',
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

  async createAdmin() {
    if (!this.newAdmin.name || !this.newAdmin.email || !this.newAdmin.password) {
      this.error.set('All fields are required.'); return;
    }
    this.creatingAdmin.set(true);
    this.adminCreated.set('');
    this.error.set('');
    try {
      await firstValueFrom(this.http.post(`${BACKEND}/admin/users`, this.newAdmin));
      this.adminCreated.set(this.newAdmin.email);
      this.newAdmin = { name: '', email: '', password: '' };
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to create admin.');
    } finally {
      this.creatingAdmin.set(false);
    }
  }

  async lockUser(email: string) {
    try {
      await firstValueFrom(this.http.patch(`${BACKEND}/admin/users/${encodeURIComponent(email)}/lock`, {}));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to lock user.');
    }
  }

  async unlockUser(email: string) {
    try {
      await firstValueFrom(this.http.patch(`${BACKEND}/admin/users/${encodeURIComponent(email)}/unlock`, {}));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to unlock user.');
    }
  }

  async deleteUser(email: string) {
    if (!confirm(`Permanently delete user ${email}?`)) return;
    try {
      await firstValueFrom(this.http.delete(`${BACKEND}/admin/users/${encodeURIComponent(email)}`));
      await this.loadData();
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Failed to delete user.');
    }
  }

  doReadingForLead(lead: LeadRow) {
    this.router.navigate(['/'], {
      queryParams: {
        leadId:         lead.lead_id,
        name:           lead.name,
        alias_name:     lead.alias_name     || '',
        dob:            lead.dob,
        time_of_birth:  lead.time_of_birth  || '',
        place_of_birth: lead.place_of_birth || '',
        question:       lead.question       || '',
        email:          lead.email,
        phone:          lead.phone,
      }
    });
  }

  goHome() { this.router.navigate(['/']); }
}
