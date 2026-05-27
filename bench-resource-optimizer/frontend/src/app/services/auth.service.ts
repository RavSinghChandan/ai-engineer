import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthUser {
  user_id: string;
  role: 'user' | 'admin';
  exp: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'bench_token';
  private readonly USER_KEY  = 'bench_user';

  private _token = signal<string | null>(sessionStorage.getItem(this.TOKEN_KEY));
  private _user  = signal<AuthUser | null>(this._loadUser());

  readonly isLoggedIn  = computed(() => !!this._token());
  readonly currentUser = computed(() => this._user());
  readonly isAdmin     = computed(() => this._user()?.role === 'admin');

  constructor(private http: HttpClient, private router: Router) {}

  login(userId: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/login', { user_id: userId, password })
      .pipe(
        tap(resp => {
          sessionStorage.setItem(this.TOKEN_KEY, resp.access_token);
          this._token.set(resp.access_token);
          const payload = this._decode(resp.access_token);
          if (payload) {
            const user: AuthUser = {
              user_id: payload['sub'],
              role: payload['role'],
              exp: payload['exp'],
            };
            sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
            this._user.set(user);
          }
        })
      );
  }

  logout(): void {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this._token();
  }

  private _loadUser(): AuthUser | null {
    try {
      const raw = sessionStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private _decode(token: string): Record<string, any> | null {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch { return null; }
  }
}
