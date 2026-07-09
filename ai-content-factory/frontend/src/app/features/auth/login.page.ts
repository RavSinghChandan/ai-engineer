import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'acf-login-page',
  imports: [FormsModule],
  template: `
    <div class="flex min-h-screen items-center justify-center px-4">
      <div class="card w-full max-w-md">
        <div class="mb-6 text-center">
          <div class="text-3xl font-black tracking-tight text-sky-400">AI Content Factory</div>
          <p class="mt-1 text-sm text-slate-400">Multi-agent YouTube video production</p>
        </div>

        <div class="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
          <button
            class="rounded-md py-1.5 text-sm font-semibold transition"
            [class]="mode() === 'login' ? 'bg-sky-500 text-slate-950' : 'text-slate-400'"
            (click)="mode.set('login')"
          >
            Sign in
          </button>
          <button
            class="rounded-md py-1.5 text-sm font-semibold transition"
            [class]="mode() === 'register' ? 'bg-sky-500 text-slate-950' : 'text-slate-400'"
            (click)="mode.set('register')"
          >
            Create account
          </button>
        </div>

        <form (ngSubmit)="submit()" class="space-y-4">
          @if (mode() === 'register') {
            <div>
              <label class="label" for="fullName">Full name</label>
              <input id="fullName" class="input" [(ngModel)]="fullName" name="fullName" required />
            </div>
          }
          <div>
            <label class="label" for="email">Email</label>
            <input id="email" class="input" type="email" [(ngModel)]="email" name="email" required />
          </div>
          <div>
            <label class="label" for="password">Password</label>
            <input
              id="password"
              class="input"
              type="password"
              [(ngModel)]="password"
              name="password"
              minlength="8"
              required
            />
          </div>

          @if (error()) {
            <p class="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {{ error() }}
            </p>
          }

          <button class="btn-primary w-full justify-center" type="submit" [disabled]="busy()">
            {{ busy() ? 'Please wait…' : mode() === 'login' ? 'Sign in' : 'Create account' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly busy = signal(false);
  readonly error = signal('');

  email = '';
  password = '';
  fullName = '';

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'register') {
        await this.auth.register(this.email, this.password, this.fullName);
      } else {
        await this.auth.login(this.email, this.password);
      }
      await this.router.navigateByUrl('/');
    } catch (err: unknown) {
      const detail = (err as { error?: { error?: { message?: string } } })?.error?.error?.message;
      this.error.set(detail ?? 'Authentication failed. Check your credentials.');
    } finally {
      this.busy.set(false);
    }
  }
}
