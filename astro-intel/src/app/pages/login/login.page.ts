import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.css'],
})
export class LoginPage {
  private auth   = inject(AuthService);
  private router = inject(Router);

  tab      = signal<'signin' | 'signup' | 'otp'>('signin');
  loading  = signal(false);
  error    = signal('');
  showPass = signal(false);

  // Sign In fields
  siEmail    = signal('');
  siPassword = signal('');

  // Sign Up fields
  suName     = signal('');
  suEmail    = signal('');
  suPassword = signal('');
  suConfirm  = signal('');

  // OTP fields
  otpEmail     = signal('');
  otpCode      = signal('');
  otpSent      = signal(false);
  otpCountdown = signal(0);
  private _countdownTimer: ReturnType<typeof setInterval> | null = null;

  switchTab(t: 'signin' | 'signup' | 'otp') {
    this.tab.set(t);
    this.error.set('');
    if (t !== 'otp') {
      this.otpSent.set(false);
      this.otpCode.set('');
      this._stopCountdown();
    }
  }

  signIn() {
    const email = this.siEmail().trim();
    const pass  = this.siPassword();
    if (!email || !pass) { this.error.set('Please enter your email and password.'); return; }
    this.loading.set(true);
    this.error.set('');

    this.auth.login(email, pass).subscribe({
      next:  () => this.router.navigate(['/']),
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  signUp() {
    const name    = this.suName().trim();
    const email   = this.suEmail().trim();
    const pass    = this.suPassword();
    const confirm = this.suConfirm();

    if (!name || !email || !pass) { this.error.set('All fields are required.'); return; }
    if (pass.length < 8) { this.error.set('Password must be at least 8 characters.'); return; }
    if (pass !== confirm) { this.error.set('Passwords do not match.'); return; }

    this.loading.set(true);
    this.error.set('');

    this.auth.register(name, email, pass).subscribe({
      next:  () => this.router.navigate(['/']),
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  sendOtp() {
    const email = this.otpEmail().trim();
    if (!email) { this.error.set('Please enter your email address.'); return; }
    this.loading.set(true);
    this.error.set('');

    this.auth.sendOtp(email).subscribe({
      next: () => {
        this.loading.set(false);
        this.otpSent.set(true);
        this._startCountdown(60);
      },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  verifyOtp() {
    const email = this.otpEmail().trim();
    const code  = this.otpCode().trim();
    if (!code || code.length !== 6) { this.error.set('Please enter the 6-digit code.'); return; }
    this.loading.set(true);
    this.error.set('');

    this.auth.verifyOtp(email, code).subscribe({
      next:  () => this.router.navigate(['/']),
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  resendOtp() {
    this.otpCode.set('');
    this.sendOtp();
  }

  private _startCountdown(seconds: number) {
    this._stopCountdown();
    this.otpCountdown.set(seconds);
    this._countdownTimer = setInterval(() => {
      const remaining = this.otpCountdown() - 1;
      this.otpCountdown.set(remaining);
      if (remaining <= 0) this._stopCountdown();
    }, 1000);
  }

  private _stopCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    this.otpCountdown.set(0);
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      const t = this.tab();
      if (t === 'signin') this.signIn();
      else if (t === 'signup') this.signUp();
      else if (t === 'otp') {
        if (this.otpSent()) this.verifyOtp();
        else this.sendOtp();
      }
    }
  }
}
