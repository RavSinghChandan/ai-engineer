import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ExecutionStep, FlowNode } from '../models/execution-step.model';
import { FLOW_NODES } from '../data/mock-steps.data';
import { ENDPOINT_CONFIGS, EndpointConfig } from '../data/endpoints.data';
import { PROJECT_CONFIG } from '../config/project.config';

export interface ApiResponse {
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class ExecutionStateService {

  // ── Core signals ─────────────────────────────────────────────────────────
  private _steps = signal<ExecutionStep[]>([]);
  private _nodes = signal<FlowNode[]>(FLOW_NODES.map(n => ({ ...n })));
  private _currentIndex = signal(-1);
  private _isRunning = signal(false);
  private _isComplete = signal(false);
  private _apiResponse = signal<ApiResponse | null>(null);   // shown only after flow ends
  private _pendingResponse = signal<ApiResponse | null>(null); // held until flow ends
  private _requestPayload = signal<any | null>(null);
  private _autoPlaying = signal(false);
  private _currentEndpointId = signal<string>('health');
  private _autoTimer: ReturnType<typeof setInterval> | null = null;
  private _manualLine = signal<number | null>(null);
  readonly codeFontSize = signal(13);

  // Line currently highlighted — manual override (stepIn) takes priority
  readonly activeLine = computed(() =>
    this._manualLine() ?? this.currentStep()?.highlightLine ?? null
  );

  // ── Public readonly ───────────────────────────────────────────────────────
  readonly steps = this._steps.asReadonly();
  readonly nodes = this._nodes.asReadonly();
  readonly isRunning = this._isRunning.asReadonly();
  readonly isComplete = this._isComplete.asReadonly();
  readonly apiResponse = this._apiResponse.asReadonly();
  readonly requestPayload = this._requestPayload.asReadonly();
  readonly autoPlaying = this._autoPlaying.asReadonly();
  readonly currentEndpointId = this._currentEndpointId.asReadonly();

  readonly currentStep = computed(() => {
    const idx = this._currentIndex();
    const steps = this._steps();
    return idx >= 0 && idx < steps.length ? steps[idx] : null;
  });

  readonly currentIndex = computed(() => this._currentIndex());

  readonly progress = computed(() => {
    const steps = this._steps();
    if (!steps.length) return 0;
    const done = steps.filter(s => s.status === 'completed').length;
    return Math.round((done / steps.length) * 100);
  });

  constructor(private http: HttpClient) {}

  // ── Start flow ────────────────────────────────────────────────────────────
  startFlow(endpointId: string, form: Record<string, any>): void {
    this.resetState();

    const config = ENDPOINT_CONFIGS.find(e => e.id === endpointId);
    if (!config) return;

    this._currentEndpointId.set(endpointId);
    this._isRunning.set(true);

    // Build steps for this endpoint + form values
    const steps = config.buildSteps(form).map(s => ({ ...s, status: 'pending' as const }));
    this._steps.set(steps);
    this._nodes.set(FLOW_NODES.map(n => ({ ...n, status: 'pending' as const })));

    // Store what we're about to send
    this._requestPayload.set({ endpoint: config.path, method: config.method, body: config.buildBody(form) });

    // ── Fire the real API call in the background ──────────────────────────
    if (endpointId === 'ingest') {
      this.callIngest(form);
    } else if (endpointId === 'chat_stream') {
      this.callStream(form);
    } else {
      this.callHttp(config, form);
    }

    // Start the animation after a short delay
    setTimeout(() => this.nextStep(), 400);
  }

  // ── HTTP calls ────────────────────────────────────────────────────────────

  private callHttp(config: EndpointConfig, form: Record<string, any>): void {
    const url = `${PROJECT_CONFIG.backendUrl}${config.path}`;
    let obs;

    if (config.method === 'GET') {
      obs = this.http.get<ApiResponse>(url);
    } else if (config.method === 'DELETE') {
      obs = this.http.delete<ApiResponse>(url);
    } else {
      const body = config.buildBody(form);
      // FormData bodies (e.g. auth/token) must not set Content-Type — browser sets boundary
      if (body instanceof FormData) {
        obs = this.http.post<ApiResponse>(url, body);
      } else {
        obs = this.http.post<ApiResponse>(url, body, {
          headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        });
      }
    }

    obs.subscribe({
      next: res => this._pendingResponse.set(res),
      error: () => this._pendingResponse.set({
        error: true,
        message: 'API unavailable — running in demo mode.',
        answer: 'Backend returned an error. The execution flow above is from mock data.',
        steps: this._steps().map(s => `${s.id}. ${s.name}`),
      }),
    });
  }

  private callStream(form: Record<string, any>): void {
    fetch(`${PROJECT_CONFIG.backendUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: form['question'] || '',
        use_rag: !!form['use_rag'],
        prompt_version: form['prompt_version'] || 'v1',
      }),
    }).then(res => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      const pump = (): Promise<void> =>
        reader.read().then(({ done, value }) => {
          if (done) {
            this._pendingResponse.set({ answer: fullText, sources: [], steps: ['Streamed response'] });
            return;
          }
          fullText += decoder.decode(value);
          return pump();
        });
      return pump();
    }).catch(() => {
      this._pendingResponse.set({ answer: 'Stream failed — check backend.', sources: [], steps: [] });
    });
  }

  private callIngest(form: Record<string, any>): void {
    const file = form['file'] as File | null;
    if (!file) {
      this._pendingResponse.set({ message: 'No file provided', chunks: 0, source: '' });
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<ApiResponse>(`${PROJECT_CONFIG.backendUrl}/api/v1/ingest`, fd).subscribe({
      next: res => this._pendingResponse.set(res),
      error: () => this._pendingResponse.set({ message: 'Ingest failed', chunks: 0, source: file.name }),
    });
  }

  // ── Step into next line within current code block ─────────────────────────
  stepIn(): void {
    const step = this.currentStep();
    if (!step) return;
    const totalLines = step.code.split('\n').length;
    const cur = this._manualLine() ?? step.highlightLine;
    const next = cur + 1;
    if (next <= totalLines) this._manualLine.set(next);
  }

  // ── Next step ─────────────────────────────────────────────────────────────
  nextStep(): void {
    const steps = this._steps();
    const idx = this._currentIndex();

    if (idx >= steps.length - 1) {
      this.finishFlow();
      return;
    }

    if (idx >= 0) {
      this.updateStepStatus(idx, 'completed');
      this.updateNodeStatus(steps[idx].nodeId, 'completed');
    }

    const nextIdx = idx + 1;
    this._manualLine.set(null);
    this._currentIndex.set(nextIdx);
    this.updateStepStatus(nextIdx, 'active');
    this.updateNodeStatus(steps[nextIdx].nodeId, 'active');
  }

  // ── Jump to step ──────────────────────────────────────────────────────────
  jumpToStep(targetIdx: number): void {
    const steps = this._steps();
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    if (!this._isRunning()) return;

    this.stopAutoPlay();
    const currentIdx = this._currentIndex();

    if (targetIdx < currentIdx) {
      const updated = steps.map((s, i) => ({
        ...s,
        status: i < targetIdx ? 'completed' as const :
                i === targetIdx ? 'active' as const : 'pending' as const,
      }));
      this._steps.set(updated);

      const updatedNodes = this._nodes().map(n => {
        const stepForNode = updated.find(s => s.nodeId === n.id);
        return stepForNode ? { ...n, status: stepForNode.status } : { ...n, status: 'pending' as const };
      });
      this._nodes.set(updatedNodes);
    } else {
      for (let i = currentIdx; i < targetIdx; i++) {
        this.updateStepStatus(i, 'completed');
        this.updateNodeStatus(steps[i].nodeId, 'completed');
      }
      this.updateStepStatus(targetIdx, 'active');
      this.updateNodeStatus(steps[targetIdx].nodeId, 'active');
    }

    this._currentIndex.set(targetIdx);
  }

  // ── Auto play ─────────────────────────────────────────────────────────────
  toggleAutoPlay(): void {
    if (this._autoPlaying()) {
      this.stopAutoPlay();
    } else {
      this._autoPlaying.set(true);
      this._autoTimer = setInterval(() => {
        const idx = this._currentIndex();
        if (idx >= this._steps().length - 1) {
          this.stopAutoPlay();
          this.finishFlow();
        } else {
          this.nextStep();
        }
      }, 1600);
    }
  }

  stopAutoPlay(): void {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
    this._autoPlaying.set(false);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  resetState(): void {
    this.stopAutoPlay();
    this._steps.set([]);
    this._nodes.set(FLOW_NODES.map(n => ({ ...n, status: 'pending' as const })));
    this._currentIndex.set(-1);
    this._isRunning.set(false);
    this._isComplete.set(false);
    this._apiResponse.set(null);
    this._pendingResponse.set(null);
    this._requestPayload.set(null);
    this._manualLine.set(null);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private finishFlow(): void {
    this.stopAutoPlay();
    const steps = this._steps();
    const lastIdx = steps.length - 1;
    if (lastIdx >= 0) {
      this.updateStepStatus(lastIdx, 'completed');
      this.updateNodeStatus(steps[lastIdx].nodeId, 'completed');
    }
    this._isComplete.set(true);
    this._isRunning.set(false);

    // ── Reveal the API response NOW (after flow completes) ──────────────
    const pending = this._pendingResponse();
    if (pending) {
      this._apiResponse.set(pending);
    } else {
      // API hasn't responded yet — poll until it does (max 30s)
      const start = Date.now();
      const poll = setInterval(() => {
        const res = this._pendingResponse();
        if (res) {
          this._apiResponse.set(res);
          clearInterval(poll);
        } else if (Date.now() - start > 30000) {
          this._apiResponse.set({ answer: 'API did not respond in time.', sources: [], steps: [] });
          clearInterval(poll);
        }
      }, 200);
    }
  }

  private updateStepStatus(idx: number, status: ExecutionStep['status']): void {
    this._steps.update(steps =>
      steps.map((s, i) => i === idx ? { ...s, status } : s)
    );
  }

  private updateNodeStatus(nodeId: string, status: FlowNode['status']): void {
    this._nodes.update(nodes =>
      nodes.map(n => n.id === nodeId ? { ...n, status } : n)
    );
  }

  zoomIn():  void { this.codeFontSize.update(s => Math.min(s + 1, 22)); }
  zoomOut(): void { this.codeFontSize.update(s => Math.max(s - 1, 10)); }

  // Update the displayed endpoint without starting the flow (for graph preview)
  selectEndpoint(id: string): void { this._currentEndpointId.set(id); }
}
