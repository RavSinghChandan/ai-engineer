import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">

        <div class="login-logo">
          <span class="logo-icon">⚡</span>
          <div class="logo-text">Bench Resource Optimizer</div>
          <div class="logo-sub">Enterprise AI Platform</div>
        </div>

        <div *ngIf="error" class="alert-error">{{ error }}</div>

        <form (ngSubmit)="submit()" #f="ngForm">

          <div class="field">
            <label>User ID</label>
            <input
              type="text"
              [(ngModel)]="userId"
              name="userId"
              placeholder="e.g. john.doe  or  admin"
              required
              [disabled]="loading"
            />
          </div>

          <div class="field">
            <label>Password</label>
            <input
              type="password"
              [(ngModel)]="password"
              name="password"
              placeholder="••••••••"
              required
              [disabled]="loading"
            />
          </div>

          <button type="submit" class="btn-login" [disabled]="loading || !userId || !password">
            <span *ngIf="loading" class="spinner"></span>
            {{ loading ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>


      </div>
    </div>
  `,
  styles: [`
    .login-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      padding: 24px;
    }
    .login-card {
      background: #ffffff;
      border-radius: 16px;
      padding: 40px 36px 32px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    }
    .login-logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo-icon {
      font-size: 40px;
      display: block;
      margin-bottom: 10px;
    }
    .logo-text {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
    }
    .logo-sub {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .alert-error {
      background: #fee2e2;
      border: 1px solid #fca5a5;
      color: #991b1b;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      margin-bottom: 20px;
    }
    .field {
      margin-bottom: 18px;
    }
    .field label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
    }
    .field input {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      color: #1e293b;
      background: #f9fafb;
      box-sizing: border-box;
      transition: border-color 0.2s;
    }
    .field input:focus {
      outline: none;
      border-color: #3b82f6;
      background: #ffffff;
    }
    .field input:disabled {
      opacity: 0.6;
    }
    .btn-login {
      width: 100%;
      padding: 12px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s;
    }
    .btn-login:hover:not(:disabled) { background: #2563eb; }
    .btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class LoginComponent {
  userId   = '';
  password = '';
  loading  = false;
  error    = '';

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    if (!this.userId || !this.password) return;
    this.loading = true;
    this.error   = '';

    this.auth.login(this.userId.trim(), this.password).subscribe({
      next: () => {
        this.loading = false;
        // Admin goes straight to admin panel, regular users go to upload
        this.router.navigate([this.auth.isAdmin() ? '/admin' : '/upload']);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.status === 401
          ? 'Invalid user ID or password.'
          : 'Login failed. Please try again.';
      },
    });
  }
}
