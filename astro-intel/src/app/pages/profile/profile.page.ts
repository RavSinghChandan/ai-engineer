import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

const BACKEND = environment.apiUrl;

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  nameErr = signal('');
  nameSuc = signal('');
  phoneErr = signal('');
  phoneSuc = signal('');
  savingName  = signal(false);
  savingPhone = signal(false);

  // Password fields
  currentPw  = signal('');
  newPw      = signal('');
  confirmPw  = signal('');
  pwErr      = signal('');
  pwSuc      = signal('');
  savingPw   = signal(false);
  showCurr   = signal(false);
  showNew    = signal(false);

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
    const n = this.name().trim();
    if (!n) { this.nameErr.set('Name cannot be empty.'); return; }
    this.savingName.set(true);
    this.nameErr.set('');
    this.nameSuc.set('');
    this.http.patch<any>(`${BACKEND}/auth/profile`, { name: n }).subscribe({
      next: () => {
        this.savingName.set(false);
        this.nameSuc.set('Name updated successfully.');
      },
      error: (e: any) => {
        this.savingName.set(false);
        this.nameErr.set(e?.error?.detail ?? 'Could not update name.');
      },
    });
  }

  savePhone() {
    const p = this.phone().trim();
    if (!p) { this.phoneErr.set('Please enter a phone number.'); return; }
    this.savingPhone.set(true);
    this.phoneErr.set('');
    this.phoneSuc.set('');
    this.auth.updatePhone(p).subscribe({
      next: (res: any) => {
        this.savingPhone.set(false);
        this.phoneSuc.set(`Phone saved as ${res.phone}`);
        this.phone.set(res.phone);
      },
      error: (e: Error) => {
        this.savingPhone.set(false);
        this.phoneErr.set(e.message);
      },
    });
  }

  changePassword() {
    const curr = this.currentPw();
    const nw   = this.newPw();
    const conf = this.confirmPw();
    if (!curr || !nw || !conf) { this.pwErr.set('All fields are required.'); return; }
    if (nw.length < 8)          { this.pwErr.set('New password must be at least 8 characters.'); return; }
    if (nw !== conf)             { this.pwErr.set('Passwords do not match.'); return; }
    this.savingPw.set(true);
    this.pwErr.set('');
    this.pwSuc.set('');
    this.http.post<any>(`${BACKEND}/auth/password/change`, {
      current_password: curr,
      new_password: nw,
    }).subscribe({
      next: () => {
        this.savingPw.set(false);
        this.pwSuc.set('Password changed successfully.');
        this.currentPw.set('');
        this.newPw.set('');
        this.confirmPw.set('');
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
