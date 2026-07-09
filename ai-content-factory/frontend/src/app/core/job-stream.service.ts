import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { JobEvent } from './models';

/**
 * Live job event stream over WebSocket.
 * The backend replays persisted history after `afterId`, then streams live —
 * so a page refresh never loses or duplicates events.
 */
@Injectable({ providedIn: 'root' })
export class JobStreamService {
  private readonly auth = inject(AuthService);

  connect(
    jobId: string,
    afterId: number,
    onEvent: (event: JobEvent) => void,
    onClose: () => void,
  ): () => void {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const token = this.auth.accessToken ?? '';
    const socket = new WebSocket(
      `${protocol}://${location.host}/ws/jobs/${jobId}?token=${encodeURIComponent(token)}&after_id=${afterId}`,
    );
    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as JobEvent);
      } catch {
        /* malformed frame — ignore */
      }
    };
    socket.onclose = onClose;
    socket.onerror = () => socket.close();
    return () => socket.close();
  }
}
