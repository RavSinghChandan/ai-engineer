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
  otpMode      = signal<'email' | 'phone'>('email');
  otpEmail     = signal('');
  otpPhone     = signal('');
  otpCode      = signal('');
  otpSent      = signal(false);
  otpCountdown = signal(0);
  devCode      = signal('');  // shown when SMTP/SMS not configured (dev mode)
  private _countdownTimer: ReturnType<typeof setInterval> | null = null;

  switchTab(t: 'signin' | 'signup' | 'otp') {
    this.tab.set(t);
    this.error.set('');
    if (t !== 'otp') {
      this.otpSent.set(false);
      this.otpCode.set('');
      this.devCode.set('');
      this._stopCountdown();
    }
  }

  switchOtpMode(mode: 'email' | 'phone') {
    this.otpMode.set(mode);
    this.otpSent.set(false);
    this.otpCode.set('');
    this.devCode.set('');
    this.error.set('');
    this._stopCountdown();
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
    const mode  = this.otpMode();
    const email = this.otpEmail().trim();
    const phone = this.otpPhone().trim();

    if (mode === 'email' && !email) { this.error.set('Please enter your email address.'); return; }
    if (mode === 'phone' && !phone) { this.error.set('Please enter your mobile number.'); return; }

    this.loading.set(true);
    this.error.set('');
    this.devCode.set('');

    const obs = mode === 'phone'
      ? this.auth.sendPhoneOtp(phone)
      : this.auth.sendOtp(email);

    obs.subscribe({
      next: (res) => {
        this.loading.set(false);
        this.otpSent.set(true);
        this._startCountdown(60);
        if (res?.dev_code) {
          this.devCode.set(res.dev_code);
        }
      },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  verifyOtp() {
    const mode  = this.otpMode();
    const email = this.otpEmail().trim();
    const phone = this.otpPhone().trim();
    const code  = this.otpCode().trim();
    if (!code || code.length !== 6) { this.error.set('Please enter the 6-digit code.'); return; }
    this.loading.set(true);
    this.error.set('');

    const obs = mode === 'phone'
      ? this.auth.verifyPhoneOtp(phone, code)
      : this.auth.verifyOtp(email, code);

    obs.subscribe({
      next:  () => this.router.navigate(['/']),
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  resendOtp() {
    this.otpCode.set('');
    this.devCode.set('');
    this.sendOtp();
  }

  useDevCode() {
    this.otpCode.set(this.devCode());
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
