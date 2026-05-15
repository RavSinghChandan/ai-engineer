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

  apiKey  = signal('');
  loading = signal(false);
  error   = signal('');
  showKey = signal(false);

  submit() {
    const key = this.apiKey().trim();
    if (!key) { this.error.set('Please enter your API key.'); return; }
    this.loading.set(true);
    this.error.set('');

    this.auth.login(key).subscribe({
      next: () => this.router.navigate(['/']),
      error: (e: Error) => {
        this.error.set(e.message);
        this.loading.set(false);
      },
    });
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') this.submit();
  }
}
