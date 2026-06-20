import { Component, signal, inject, computed, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AppFooterComponent } from '../../components/shared/app-footer.component';

const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE   = /^[+]?[\d\s\-().]{7,15}$/;

function validateEmail(v: string): string {
  if (!v.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(v.trim())) return 'Enter a valid email address.';
  return '';
}
function validatePhone(v: string): string {
  if (!v.trim()) return 'Mobile number is required.';
  if (!PHONE_RE.test(v.trim())) return 'Enter a valid mobile number.';
  return '';
}
function validateName(v: string): string {
  if (!v.trim()) return 'Full name is required.';
  if (v.trim().length < 2) return 'Name must be at least 2 characters.';
  if (!/[a-zA-Z]/.test(v)) return 'Name must contain letters.';
  return '';
}
function validatePassword(v: string): string {
  if (!v) return 'Password is required.';
  if (v.length < 8) return 'Password must be at least 8 characters.';
  return '';
}
function validateConfirm(pass: string, confirm: string): string {
  if (!confirm) return 'Please confirm your password.';
  if (pass !== confirm) return 'Passwords do not match.';
  return '';
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, AppFooterComponent],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.css'],
})
export class LoginPage implements OnInit, OnDestroy {
  private auth   = inject(AuthService);
  private router = inject(Router);

  // On localhost auto-fill superadmin credentials so no manual typing needed
  private readonly _isLocal = typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  tab      = signal<'signin' | 'signup' | 'otp'>('signin');
  loading  = signal(false);
  error    = signal('');
  showPass = signal(false);

  // ── Sign In ──────────────────────────────────────────────────────────────
  siEmail    = signal(this._isLocal ? 'admin@aura.local' : '');
  siPassword = signal(this._isLocal ? 'AuraAdmin2024!' : '');
  siTouched  = signal<Record<string, boolean>>({});

  siEmailErr    = computed(() => this.siTouched()['email']    ? validateEmail(this.siEmail())    : '');
  siPasswordErr = computed(() => this.siTouched()['password'] ? validatePassword(this.siPassword()) : '');

  touchSi(field: string) {
    this.siTouched.update(t => ({ ...t, [field]: true }));
  }

  // ── Sign Up ──────────────────────────────────────────────────────────────
  suName     = signal('');
  suEmail    = signal('');
  suPassword = signal('');
  suConfirm  = signal('');
  suTouched  = signal<Record<string, boolean>>({});
  registered = signal(false); // true → show success screen, prompt to sign in

  suNameErr    = computed(() => this.suTouched()['name']    ? validateName(this.suName())       : '');
  suEmailErr   = computed(() => this.suTouched()['email']   ? validateEmail(this.suEmail())     : '');
  suPassErr    = computed(() => this.suTouched()['pass']    ? validatePassword(this.suPassword()) : '');
  suConfirmErr = computed(() => this.suTouched()['confirm'] ? validateConfirm(this.suPassword(), this.suConfirm()) : '');

  touchSu(field: string) {
    this.suTouched.update(t => ({ ...t, [field]: true }));
  }

  // ── OTP ──────────────────────────────────────────────────────────────────
  otpMode      = signal<'email' | 'phone'>('email');
  otpEmail     = signal('');
  otpPhone     = signal('');
  otpCode      = signal('');
  otpSent      = signal(false);
  otpCountdown = signal(0);
  devCode      = signal('');
  otpTouched   = signal<Record<string, boolean>>({});

  otpEmailErr = computed(() => this.otpTouched()['email'] ? validateEmail(this.otpEmail()) : '');
  otpPhoneErr = computed(() => this.otpTouched()['phone'] ? validatePhone(this.otpPhone()) : '');
  otpCodeErr  = computed(() => {
    if (!this.otpTouched()['code']) return '';
    const c = this.otpCode().trim();
    if (!c) return 'Please enter the 6-digit code.';
    if (!/^\d{6}$/.test(c)) return 'Code must be exactly 6 digits.';
    return '';
  });

  touchOtp(field: string) {
    this.otpTouched.update(t => ({ ...t, [field]: true }));
  }

  private _countdownTimer: ReturnType<typeof setInterval> | null = null;

  // ── Tab switching ─────────────────────────────────────────────────────────
  switchTab(t: 'signin' | 'signup' | 'otp') {
    this.tab.set(t);
    this.error.set('');
    this.registered.set(false);
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
    this.otpTouched.set({});
    this._stopCountdown();
  }

  // ── Sign In ───────────────────────────────────────────────────────────────
  signIn() {
    this.siTouched.set({ email: true, password: true });
    if (this.siEmailErr() || this.siPasswordErr()) return;
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.siEmail().trim(), this.siPassword()).subscribe({
      next:  () => this.router.navigate(['/']),
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  // ── Sign Up ───────────────────────────────────────────────────────────────
  signUp() {
    this.suTouched.set({ name: true, email: true, pass: true, confirm: true });
    if (this.suNameErr() || this.suEmailErr() || this.suPassErr() || this.suConfirmErr()) return;
    this.loading.set(true);
    this.error.set('');

    // Register but do NOT auto-login — instead show success and prompt to sign in
    this.auth.registerOnly(this.suName().trim(), this.suEmail().trim(), this.suPassword()).subscribe({
      next: () => {
        this.loading.set(false);
        this.registered.set(true);
        // Clear signup form
        this.suName.set('');
        this.suEmail.set('');
        this.suPassword.set('');
        this.suConfirm.set('');
        this.suTouched.set({});
      },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  goToSignIn() {
    this.registered.set(false);
    this.switchTab('signin');
  }

  goToOtpReset() {
    // Pre-fill OTP email from whatever the user typed in sign-in
    if (this.siEmail().trim()) {
      this.otpEmail.set(this.siEmail().trim());
    }
    this.switchTab('otp');
    this.otpMode.set('email');
  }

  // ── OTP ───────────────────────────────────────────────────────────────────
  sendOtp() {
    const mode = this.otpMode();
    if (mode === 'email') {
      this.touchOtp('email');
      if (this.otpEmailErr()) return;
    } else {
      this.touchOtp('phone');
      if (this.otpPhoneErr()) return;
    }
    this.loading.set(true);
    this.error.set('');
    this.devCode.set('');

    const obs = mode === 'phone'
      ? this.auth.sendPhoneOtp(this.otpPhone().trim())
      : this.auth.sendOtp(this.otpEmail().trim());

    obs.subscribe({
      next: (res) => {
        this.loading.set(false);
        this.otpSent.set(true);
        this._startCountdown(60);
        if (res?.dev_code) this.devCode.set(res.dev_code);
      },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  verifyOtp() {
    this.touchOtp('code');
    if (this.otpCodeErr()) return;
    this.loading.set(true);
    this.error.set('');

    const mode  = this.otpMode();
    const email = this.otpEmail().trim();
    const phone = this.otpPhone().trim();
    const code  = this.otpCode().trim();

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
    this.otpTouched.update(t => ({ ...t, code: false }));
    this.sendOtp();
  }

  useDevCode() {
    this.otpCode.set(this.devCode());
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const t = this.tab();
    if (t === 'signin')      this.signIn();
    else if (t === 'signup') this.signUp();
    else if (t === 'otp') {
      if (this.otpSent()) this.verifyOtp();
      else this.sendOtp();
    }
  }

  ngOnInit(): void {
    if (this._isLocal) this.signIn();
  }

  ngOnDestroy(): void {
    this._stopCountdown();
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
}
