import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

const BACKEND = 'http://localhost:8080';
const TOKEN_KEY = 'astro_token';
const META_KEY  = 'astro_meta';

export interface AuthMeta {
  tenant_id:   string;
  tenant_name: string;
  role:        'user' | 'admin' | 'superadmin';
  expires_at:  number; // epoch ms
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(null);
  private _meta  = signal<AuthMeta | null>(null);

  readonly isLoggedIn  = computed(() => !!this._token() && !this._isExpired());
  readonly role        = computed(() => this._meta()?.role ?? null);
  readonly tenantName  = computed(() => this._meta()?.tenant_name ?? '');
  readonly isAdmin     = computed(() => ['admin','superadmin'].includes(this.role() ?? ''));
  readonly isSuperAdmin = computed(() => this.role() === 'superadmin');

  constructor(private http: HttpClient, private router: Router) {
    this._restore();
  }

  login(apiKey: string) {
    return this.http.post<any>(`${BACKEND}/auth/token`, { api_key: apiKey }).pipe(
      tap(res => {
        const meta: AuthMeta = {
          tenant_id:   res.tenant_id,
          tenant_name: res.tenant_name,
          role:        res.role,
          expires_at:  Date.now() + res.expires_in * 1000,
        };
        this._token.set(res.access_token);
        this._meta.set(meta);
        sessionStorage.setItem(TOKEN_KEY, res.access_token);
        sessionStorage.setItem(META_KEY, JSON.stringify(meta));
      }),
      catchError(err => {
        const msg = err?.error?.detail ?? 'Invalid API key. Please try again.';
        return throwError(() => new Error(msg));
      })
    );
  }

  logout() {
    this._token.set(null);
    this._meta.set(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(META_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this._token();
  }

  getMeta(): AuthMeta | null {
    return this._meta();
  }

  private _restore() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const raw   = sessionStorage.getItem(META_KEY);
    if (!token || !raw) return;
    try {
      const meta: AuthMeta = JSON.parse(raw);
      if (Date.now() < meta.expires_at) {
        this._token.set(token);
        this._meta.set(meta);
      } else {
        sessionStorage.clear();
      }
    } catch {
      sessionStorage.clear();
    }
  }

  private _isExpired(): boolean {
    const meta = this._meta();
    if (!meta) return true;
    return Date.now() >= meta.expires_at;
  }
}
