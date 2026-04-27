import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BackendConfigService {
  private http = inject(HttpClient);

  /** Resolved at app startup — never changes after that. */
  backendUrl = '';

  /** Called by APP_INITIALIZER before the app renders. */
  async load(): Promise<void> {
    // In dev: Angular dev-server proxies /api → FastAPI (proxy.conf.json).
    // In prod: Angular is served by FastAPI on the same origin.
    // Either way, /api/v1/config/ is always reachable from window.location.origin.
    const origin = window.location.origin;
    try {
      const res = await firstValueFrom(
        this.http.get<{ backendUrl: string }>(`${origin}/api/v1/config/`)
      );
      this.backendUrl = res.backendUrl;
    } catch {
      // Dev fallback: proxy not running yet — point directly at FastAPI.
      this.backendUrl = 'http://localhost:8001';
    }
  }
}
