import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TokenPair, UserOut } from './models';

const ACCESS_KEY = 'acf_access_token';
const REFRESH_KEY = 'acf_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<UserOut | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  async register(email: string, password: string, fullName: string): Promise<void> {
    await firstValueFrom(
      this.http.post<UserOut>('/api/v1/auth/register', {
        email,
        password,
        full_name: fullName,
      }),
    );
    await this.login(email, password);
  }

  async login(email: string, password: string): Promise<void> {
    const tokens = await firstValueFrom(
      this.http.post<TokenPair>('/api/v1/auth/login', { email, password }),
    );
    this.storeTokens(tokens);
    await this.loadUser();
  }

  async loadUser(): Promise<boolean> {
    if (!this.accessToken) return false;
    try {
      const user = await firstValueFrom(this.http.get<UserOut>('/api/v1/auth/me'));
      this.user.set(user);
      return true;
    } catch {
      return this.tryRefresh();
    }
  }

  async tryRefresh(): Promise<boolean> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const tokens = await firstValueFrom(
        this.http.post<TokenPair>('/api/v1/auth/refresh', { refresh_token: refreshToken }),
      );
      this.storeTokens(tokens);
      const user = await firstValueFrom(this.http.get<UserOut>('/api/v1/auth/me'));
      this.user.set(user);
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  logout(): void {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      this.http.post('/api/v1/auth/logout', { refresh_token: refreshToken }).subscribe();
    }
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  private storeTokens(tokens: TokenPair): void {
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  }
}
