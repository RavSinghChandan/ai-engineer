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

  tab      = signal<'signin' | 'signup'>('signin');
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

  switchTab(t: 'signin' | 'signup') {
    this.tab.set(t);
    this.error.set('');
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

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.tab() === 'signin' ? this.signIn() : this.signUp();
    }
  }
}
