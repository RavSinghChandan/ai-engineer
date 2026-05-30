import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

const API = 'http://localhost:8000';
const TOKEN_KEY = 'runbookai_token';
const USER_KEY = 'runbookai_user';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<AuthUser | null>(this._loadUser());
  readonly user = this._user.asReadonly();

  constructor(private http: HttpClient, private router: Router) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isLoggedIn(): boolean {
    return !!this.token && !!this._user();
  }

  register(payload: {
    tenant_name: string; tenant_slug: string;
    email: string; password: string; full_name?: string;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/register`, payload).pipe(
      tap(r => this._persist(r))
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/login`, { email, password }).pipe(
      tap(r => this._persist(r))
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  private _persist(r: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, r.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    this._user.set(r.user);
  }

  private _loadUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
