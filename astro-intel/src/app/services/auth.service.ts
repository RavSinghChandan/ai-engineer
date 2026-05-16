import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { environment } from '../../environments/environment';

const BACKEND = environment.apiUrl;
const TOKEN_KEY  = 'astro_token';
const META_KEY   = 'astro_meta';
// localStorage persists across tabs/restarts; expiry is enforced via expires_at
const _storage = localStorage;

export interface AuthMeta {
  tenant_id:   string;
  tenant_name: string;
  role:        'user' | 'admin' | 'superadmin';
  expires_at:  number;
  user_id:     string;
  email:       string;
  name:        string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(null);
  private _meta  = signal<AuthMeta | null>(null);

  readonly isLoggedIn   = computed(() => !!this._token() && !this._isExpired());
  readonly role         = computed(() => this._meta()?.role ?? null);
  readonly tenantName   = computed(() => this._meta()?.tenant_name ?? '');
  readonly userName     = computed(() => this._meta()?.name ?? this._meta()?.email ?? '');
  readonly userEmail    = computed(() => this._meta()?.email ?? '');
  readonly isAdmin      = computed(() => ['admin','superadmin'].includes(this.role() ?? ''));
  readonly isSuperAdmin = computed(() => this.role() === 'superadmin');

  constructor(private http: HttpClient, private router: Router) {
    this._restore();
  }

  login(email: string, password: string) {
    return this.http.post<any>(`${BACKEND}/auth/login`, { email, password }).pipe(
      tap(res => this._persist(res)),
      catchError(err => {
        const msg = err?.error?.detail ?? 'Invalid email or password. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  register(name: string, email: string, password: string) {
    return this.http.post<any>(`${BACKEND}/auth/register`, { name, email, password }).pipe(
      tap(res => this._persist(res)),
      catchError(err => {
        const msg = err?.error?.detail ?? 'Registration failed. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  // Register without auto-login — user must sign in manually after
  registerOnly(name: string, email: string, password: string) {
    return this.http.post<any>(`${BACKEND}/auth/register`, { name, email, password }).pipe(
      catchError(err => {
        const msg = err?.error?.detail ?? 'Registration failed. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  sendOtp(email: string) {
    return this.http.post<{ message: string; dev_code?: string; dev_note?: string }>(
      `${BACKEND}/auth/otp/send`, { email }
    ).pipe(
      catchError(err => {
        const msg = err?.error?.detail ?? 'Could not send code. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  verifyOtp(email: string, code: string) {
    return this.http.post<any>(`${BACKEND}/auth/otp/verify`, { email, code }).pipe(
      tap(res => this._persist(res)),
      catchError(err => {
        const msg = err?.error?.detail ?? 'Invalid or expired code. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  sendPhoneOtp(phone: string) {
    return this.http.post<{ message: string; dev_code?: string; dev_note?: string }>(
      `${BACKEND}/auth/otp/phone/send`, { phone }
    ).pipe(
      catchError(err => {
        const msg = err?.error?.detail ?? 'Could not send code. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  verifyPhoneOtp(phone: string, code: string) {
    return this.http.post<any>(`${BACKEND}/auth/otp/phone/verify`, { phone, code }).pipe(
      tap(res => this._persist(res)),
      catchError(err => {
        const msg = err?.error?.detail ?? 'Invalid or expired code. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  updatePhone(phone: string) {
    return this.http.post<any>(`${BACKEND}/auth/phone`, { phone }).pipe(
      catchError(err => {
        const msg = err?.error?.detail ?? 'Could not update phone number.';
        return throwError(() => new Error(msg));
      })
    );
  }

  logout() {
    this._token.set(null);
    this._meta.set(null);
    _storage.removeItem(TOKEN_KEY);
    _storage.removeItem(META_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this._token();
  }

  getMeta(): AuthMeta | null {
    return this._meta();
  }

  private _persist(res: any) {
    const meta: AuthMeta = {
      tenant_id:   res.tenant_id,
      tenant_name: res.tenant_name,
      role:        res.role,
      expires_at:  Date.now() + res.expires_in * 1000,
      user_id:     res.user_id ?? '',
      email:       res.email ?? '',
      name:        res.name ?? '',
    };
    this._token.set(res.access_token);
    this._meta.set(meta);
    _storage.setItem(TOKEN_KEY, res.access_token);
    _storage.setItem(META_KEY, JSON.stringify(meta));
  }

  private _restore() {
    const token = _storage.getItem(TOKEN_KEY);
    const raw   = _storage.getItem(META_KEY);
    if (!token || !raw) return;
    try {
      const meta: AuthMeta = JSON.parse(raw);
      if (Date.now() < meta.expires_at) {
        this._token.set(token);
        this._meta.set(meta);
      } else {
        _storage.removeItem(TOKEN_KEY);
        _storage.removeItem(META_KEY);
      }
    } catch {
      _storage.removeItem(TOKEN_KEY);
      _storage.removeItem(META_KEY);
    }
  }

  private _isExpired(): boolean {
    const meta = this._meta();
    if (!meta) return true;
    return Date.now() >= meta.expires_at;
  }
}
