import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

type AuthTab = 'login' | 'register';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  tab: AuthTab = 'login';
  loading = false;
  error = '';

  // Login
  loginEmail = '';
  loginPassword = '';

  // Register
  tenantName = '';
  tenantSlug = '';
  regEmail = '';
  regPassword = '';
  regFullName = '';

  constructor(private auth: AuthService, private router: Router) {}

  login() {
    if (!this.loginEmail || !this.loginPassword) return;
    this.loading = true;
    this.error = '';
    this.auth.login(this.loginEmail, this.loginPassword).subscribe({
      next: () => this.router.navigate(['/']),
      error: e => { this.error = e?.error?.detail ?? 'Login failed.'; this.loading = false; },
    });
  }

  register() {
    if (!this.tenantName || !this.tenantSlug || !this.regEmail || !this.regPassword) return;
    this.loading = true;
    this.error = '';
    this.auth.register({
      tenant_name: this.tenantName,
      tenant_slug: this.tenantSlug,
      email: this.regEmail,
      password: this.regPassword,
      full_name: this.regFullName,
    }).subscribe({
      next: () => this.router.navigate(['/']),
      error: e => { this.error = e?.error?.detail ?? 'Registration failed.'; this.loading = false; },
    });
  }

  autoSlug() {
    this.tenantSlug = this.tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }
}
