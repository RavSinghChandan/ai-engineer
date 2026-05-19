import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { AppFooterComponent } from '../../components/shared/app-footer.component';
import { environment } from '../../../environments/environment';

const BACKEND = environment.apiUrl;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-().]{7,15}$/;

function validateName(v: string): string {
  if (!v.trim()) return 'Full name is required.';
  if (v.trim().length < 2) return 'Name must be at least 2 characters.';
  if (!/[a-zA-Z]/.test(v)) return 'Name must contain letters.';
  return '';
}
function validatePhone(v: string): string {
  if (!v.trim()) return 'Mobile number is required.';
  if (!PHONE_RE.test(v.trim())) return 'Enter a valid mobile number.';
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
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, AppFooterComponent],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.css'],
})
export class ProfilePage implements OnInit {
  readonly auth   = inject(AuthService);
  readonly router = inject(Router);
  private  http   = inject(HttpClient);

  // Display
  activeTab = signal<'profile' | 'password'>('profile');

  // Profile fields
  name    = signal('');
  email   = signal('');
  phone   = signal('');
  role    = signal('');
  nameSuc = signal('');
  phoneSuc = signal('');
  savingName  = signal(false);
  savingPhone = signal(false);

  // Name / phone touched state + computed errors
  nameTouched  = signal(false);
  phoneTouched = signal(false);
  nameErr  = computed(() => this.nameTouched()  ? validateName(this.name())   : '');
  phoneErr = computed(() => this.phoneTouched() ? validatePhone(this.phone()) : '');

  // Password fields
  currentPw  = signal('');
  newPw      = signal('');
  confirmPw  = signal('');
  pwErr      = signal('');
  pwSuc      = signal('');
  savingPw   = signal(false);
  showCurr   = signal(false);
  showNew    = signal(false);

  // Per-field touched state for password section
  pwTouched = signal<Record<string, boolean>>({});
  currPwErr  = computed(() => this.pwTouched()['curr']    ? (this.currentPw() ? '' : 'Current password is required.') : '');
  newPwErr   = computed(() => this.pwTouched()['newpw']   ? validatePassword(this.newPw())                             : '');
  confPwErr  = computed(() => this.pwTouched()['confirm'] ? validateConfirm(this.newPw(), this.confirmPw())            : '');

  touchPw(field: string) {
    this.pwTouched.update(t => ({ ...t, [field]: true }));
  }

  // Forgot password (reset via OTP)
  resetMode     = signal(false);
  resetEmail    = signal('');
  resetCode     = signal('');
  resetPw       = signal('');
  resetConfirm  = signal('');
  resetCodeSent = signal(false);
  resetDevCode  = signal('');
  resetErr      = signal('');
  resetSuc      = signal('');
  sendingReset  = signal(false);

  ngOnInit() {
    const meta = this.auth.getMeta();
    this.name.set(meta?.name ?? '');
    this.email.set(meta?.email ?? '');
    this.role.set(meta?.role ?? '');
    // phone not in meta currently — shown as empty unless user has saved one
  }

  saveName() {
    this.nameTouched.set(true);
    if (this.nameErr()) return;
    const n = this.name().trim();
    this.savingName.set(true);
    this.nameSuc.set('');
    this.http.patch<any>(`${BACKEND}/auth/profile`, { name: n }).subscribe({
      next: () => {
        this.savingName.set(false);
        this.nameSuc.set('Name updated successfully.');
      },
      error: (e: any) => {
        this.savingName.set(false);
      },
    });
  }

  savePhone() {
    this.phoneTouched.set(true);
    if (this.phoneErr()) return;
    const p = this.phone().trim();
    this.savingPhone.set(true);
    this.phoneSuc.set('');
    this.auth.updatePhone(p).subscribe({
      next: (res: any) => {
        this.savingPhone.set(false);
        this.phoneSuc.set(`Phone saved as ${res.phone}`);
        this.phone.set(res.phone);
      },
      error: (e: Error) => {
        this.savingPhone.set(false);
      },
    });
  }

  changePassword() {
    this.pwTouched.set({ curr: true, newpw: true, confirm: true });
    if (this.currPwErr() || this.newPwErr() || this.confPwErr()) return;
    this.savingPw.set(true);
    this.pwErr.set('');
    this.pwSuc.set('');
    this.http.post<any>(`${BACKEND}/auth/password/change`, {
      current_password: this.currentPw(),
      new_password: this.newPw(),
    }).subscribe({
      next: () => {
        this.savingPw.set(false);
        this.pwSuc.set('Password changed successfully.');
        this.currentPw.set('');
        this.newPw.set('');
        this.confirmPw.set('');
        this.pwTouched.set({});
      },
      error: (e: any) => {
        this.savingPw.set(false);
        this.pwErr.set(e?.error?.detail ?? 'Could not change password.');
      },
    });
  }

  sendResetCode() {
    const email = this.resetEmail().trim() || this.email();
    if (!email) { this.resetErr.set('Enter your email address.'); return; }
    this.sendingReset.set(true);
    this.resetErr.set('');
    this.resetDevCode.set('');
    this.auth.sendOtp(email).subscribe({
      next: (res: any) => {
        this.sendingReset.set(false);
        this.resetCodeSent.set(true);
        if (res?.dev_code) this.resetDevCode.set(res.dev_code);
      },
      error: (e: Error) => {
        this.sendingReset.set(false);
        this.resetErr.set(e.message);
      },
    });
  }

  submitReset() {
    const email = this.resetEmail().trim() || this.email();
    const code  = this.resetCode().trim();
    const pw    = this.resetPw();
    const conf  = this.resetConfirm();
    if (!code || code.length !== 6) { this.resetErr.set('Enter the 6-digit code.'); return; }
    if (pw.length < 8)              { this.resetErr.set('Password must be at least 8 characters.'); return; }
    if (pw !== conf)                 { this.resetErr.set('Passwords do not match.'); return; }
    this.sendingReset.set(true);
    this.resetErr.set('');
    this.http.post<any>(`${BACKEND}/auth/password/reset`, {
      email, code, password: pw,
    }).subscribe({
      next: () => {
        this.sendingReset.set(false);
        this.resetSuc.set('Password reset! You can now sign in with your new password.');
        this.resetMode.set(false);
        this.resetCodeSent.set(false);
        this.resetCode.set('');
        this.resetPw.set('');
        this.resetConfirm.set('');
        this.resetDevCode.set('');
      },
      error: (e: any) => {
        this.sendingReset.set(false);
        this.resetErr.set(e?.error?.detail ?? 'Could not reset password.');
      },
    });
  }
}
