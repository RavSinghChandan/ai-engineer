import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  ExecutionStep, FlowNode, EndpointDef, VisualizerAdapter, CallFrame
} from '../models/visualizer.models';

export type ApiResponse = Record<string, any>;

// Debugger mode: which direction line scanning moves
type DebugDir = 'forward' | 'backward' | 'idle';

@Injectable({ providedIn: 'root' })
export class ExecutionEngineService {

  // ── Adapter ────────────────────────────────────────────────────────────
  private readonly _adapter = signal<VisualizerAdapter | null>(null);
  private _endpoints: EndpointDef[] = [];

  // ── Steps & nodes ──────────────────────────────────────────────────────
  private _steps        = signal<ExecutionStep[]>([]);
  private _nodes        = signal<FlowNode[]>([]);
  private _currentIdx   = signal(-1);
  private _isRunning    = signal(false);
  private _isComplete   = signal(false);
  private _apiResponse  = signal<ApiResponse | null>(null);
  private _pendingResp  = signal<ApiResponse | null>(null);
  private _reqPayload   = signal<any | null>(null);
  private _autoPlaying  = signal(false);
  private _currentEpId  = signal<string>('');

  // ── Debugger state ─────────────────────────────────────────────────────
  private _manualLine   = signal<number | null>(null);
  readonly codeFontSize = signal(13);

  // User-toggled breakpoints: stepId → Set of line numbers
  private _breakpoints  = signal<Record<number, Set<number>>>({});

  // Paused-at-breakpoint flag
  private _pausedAtBreakpoint = signal(false);

  // Call stack frames for current step
  readonly callStack = computed<CallFrame[]>(() => {
    const step = this.currentStep();
    if (!step) return [];
    const line = this.activeLine() ?? step.highlightLine;
    // Use step's callStack if provided, else synthesise one frame
    if (step.callStack?.length) {
      return step.callStack.map((f, i) =>
        i === 0 ? { ...f, line } : f
      );
    }
    return [{ file: step.file, fn: step.functionName, line }];
  });

  readonly activeLine = computed(() =>
    this._manualLine() ?? this.currentStep()?.highlightLine ?? null
  );

  // Public readonly signals
  readonly steps              = this._steps.asReadonly();
  readonly nodes              = this._nodes.asReadonly();
  readonly isRunning          = this._isRunning.asReadonly();
  readonly isComplete         = this._isComplete.asReadonly();
  readonly apiResponse        = this._apiResponse.asReadonly();
  readonly requestPayload     = this._reqPayload.asReadonly();
  readonly autoPlaying        = this._autoPlaying.asReadonly();
  readonly currentEndpointId  = this._currentEpId.asReadonly();
  readonly pausedAtBreakpoint = this._pausedAtBreakpoint.asReadonly();
  readonly breakpoints        = this._breakpoints.asReadonly();

  readonly currentStep = computed(() => {
    const idx = this._currentIdx();
    const steps = this._steps();
    return idx >= 0 && idx < steps.length ? steps[idx] : null;
  });
  readonly currentIndex = computed(() => this._currentIdx());

  readonly progress = computed(() => {
    const steps = this._steps();
    if (!steps.length) return 0;
    return Math.round(steps.filter(s => s.status === 'completed').length / steps.length * 100);
  });

  // Total lines of current step
  readonly totalLines = computed(() =>
    this.currentStep()?.code.split('\n').length ?? 0
  );

  // Is current line the last line of this step?
  readonly atLastLine = computed(() => {
    const line = this.activeLine();
    const total = this.totalLines();
    return line !== null && line >= total;
  });

  // Is current line the first line?
  readonly atFirstLine = computed(() => {
    const line = this.activeLine();
    return line !== null && line <= 1;
  });

  // Auto-play timers
  private _autoTimer: ReturnType<typeof setTimeout> | null = null;
  private _autoLineTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private http: HttpClient) {}

  // ── Adapter registration ───────────────────────────────────────────────
  setAdapter(adapter: VisualizerAdapter): void {
    this.reset();
    this._adapter.set(adapter);
    this._endpoints = adapter.endpoints;
    this._nodes.set(adapter.flowNodes.map(n => ({ ...n })));
    if (adapter.endpoints.length) {
      this._currentEpId.set(adapter.endpoints[0].id);
    }
  }

  readonly adapter    = this._adapter.asReadonly();
  readonly endpoints$ = computed(() => this._adapter()?.endpoints ?? []);
  getAdapter():   VisualizerAdapter | null { return this._adapter(); }
  getEndpoints(): EndpointDef[]           { return this._adapter()?.endpoints ?? []; }
  getEndpoint(id: string): EndpointDef | undefined {
    return this._endpoints.find(e => e.id === id);
  }

  // ── Start flow ─────────────────────────────────────────────────────────
  startFlow(endpointId: string, form: Record<string, any>): void {
    this.reset();
    const config = this.getEndpoint(endpointId);
    const adapter = this._adapter();
    if (!config || !adapter) return;

    this._currentEpId.set(endpointId);
    this._isRunning.set(true);

    const steps = config.buildSteps(form).map(s => ({ ...s, status: 'pending' as const }));
    this._steps.set(steps);
    this._nodes.set(adapter.flowNodes.map(n => ({ ...n, status: 'pending' as const })));
    this._reqPayload.set({ endpoint: config.path, method: config.method, body: config.buildBody(form) });

    this._callApi(config, form);
    setTimeout(() => this.nextStep(), 400);
  }

  // ── API call ───────────────────────────────────────────────────────────
  private _callApi(config: EndpointDef, form: Record<string, any>): void {
    const base = this._adapter()?.backendUrl ?? '';
    const url  = `${base}${config.path}`;
    const body = config.buildBody(form);
    let obs;

    if (config.method === 'GET') {
      obs = this.http.get<ApiResponse>(url);
    } else if (config.method === 'DELETE') {
      obs = this.http.delete<ApiResponse>(url);
    } else if (body instanceof FormData) {
      obs = this.http.post<ApiResponse>(url, body);
    } else {
      obs = this.http.post<ApiResponse>(url, body, {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    obs.subscribe({
      next:  res  => this._pendingResp.set(res),
      error: err  => this._pendingResp.set({
        error: true,
        message: `API error: ${err.status} ${err.statusText || 'Network Error'}`,
        hint: `Make sure backend is running at ${this._adapter()?.backendUrl}`,
      }),
    });
  }

  // ── Step navigation ────────────────────────────────────────────────────
  nextStep(): void {
    const steps = this._steps();
    const idx   = this._currentIdx();
    if (idx >= steps.length - 1) { this._finish(); return; }
    if (idx >= 0) {
      this._updateStep(idx, 'completed');
      this._updateNode(steps[idx].nodeId, 'completed');
    }
    const next = idx + 1;
    this._manualLine.set(null);
    this._pausedAtBreakpoint.set(false);
    this._currentIdx.set(next);
    this._updateStep(next, 'active');
    this._updateNode(steps[next].nodeId, 'active');
  }

  // ── DEBUGGER: Step Into — advance one line forward within current step ─
  stepInto(): void {
    this.stopAutoPlay();
    const step = this.currentStep();
    if (!step) return;
    const total = step.code.split('\n').length;
    const cur   = this._manualLine() ?? step.highlightLine;
    const next  = Math.min(cur + 1, total);
    this._manualLine.set(next);
    this._pausedAtBreakpoint.set(false);
  }

  // ── DEBUGGER: Step Over — advance to next step (complete current) ──────
  stepOver(): void {
    this.stopAutoPlay();
    this._pausedAtBreakpoint.set(false);
    // Jump to first line of next step
    const steps = this._steps();
    const idx   = this._currentIdx();
    if (idx >= steps.length - 1) { this._finish(); return; }
    this._manualLine.set(null);
    this.nextStep();
  }

  // ── DEBUGGER: Step Out — go to last line of current step, then advance ─
  stepOut(): void {
    this.stopAutoPlay();
    const step = this.currentStep();
    if (!step) return;
    const total = step.code.split('\n').length;
    this._manualLine.set(total);     // jump to last line first
    this._pausedAtBreakpoint.set(false);
    // Then after a brief pause advance to next step
    setTimeout(() => this.stepOver(), 250);
  }

  // ── DEBUGGER: Step Back — move one line backward ──────────────────────
  stepBack(): void {
    this.stopAutoPlay();
    const step = this.currentStep();
    if (!step) return;
    const cur = this._manualLine() ?? step.highlightLine;
    const prev = Math.max(cur - 1, 1);
    this._manualLine.set(prev);
    this._pausedAtBreakpoint.set(false);
  }

  // ── DEBUGGER: Continue — resume auto-play from current position ────────
  continueExecution(): void {
    this._pausedAtBreakpoint.set(false);
    this._startAutoPlay();
  }

  // ── DEBUGGER: Toggle breakpoint on a line ─────────────────────────────
  toggleBreakpoint(stepId: number, line: number): void {
    this._breakpoints.update(bp => {
      const copy = { ...bp };
      if (!copy[stepId]) copy[stepId] = new Set();
      else copy[stepId] = new Set(copy[stepId]);
      if (copy[stepId].has(line)) copy[stepId].delete(line);
      else copy[stepId].add(line);
      return copy;
    });
  }

  hasBreakpoint(stepId: number, line: number): boolean {
    return this._breakpoints()[stepId]?.has(line) ?? false;
  }

  // ── Legacy stepIn kept for backward compat ────────────────────────────
  stepIn(): void { this.stepInto(); }

  jumpToStep(targetIdx: number): void {
    const steps = this._steps();
    if (targetIdx < 0 || targetIdx >= steps.length || !this._isRunning()) return;
    this.stopAutoPlay();
    const cur = this._currentIdx();

    if (targetIdx < cur) {
      const updated = steps.map((s, i) => ({
        ...s,
        status: i < targetIdx ? 'completed' as const :
                i === targetIdx ? 'active' as const : 'pending' as const,
      }));
      this._steps.set(updated);
      const updNodes = this._adapter()!.flowNodes.map(n => {
        const s = updated.find(x => x.nodeId === n.id);
        return { ...n, status: s ? s.status : 'pending' as const };
      });
      this._nodes.set(updNodes);
    } else {
      for (let i = cur; i < targetIdx; i++) {
        this._updateStep(i, 'completed');
        this._updateNode(steps[i].nodeId, 'completed');
      }
      this._updateStep(targetIdx, 'active');
      this._updateNode(steps[targetIdx].nodeId, 'active');
    }
    this._currentIdx.set(targetIdx);
    this._manualLine.set(null);
    this._pausedAtBreakpoint.set(false);
  }

  selectEndpoint(id: string): void { this._currentEpId.set(id); }

  // ── Auto play — line-by-line scanning with breakpoint support ──────────
  toggleAutoPlay(): void {
    this._autoPlaying() ? this.stopAutoPlay() : this._startAutoPlay();
  }

  private _startAutoPlay(): void {
    this._autoPlaying.set(true);
    this._autoPlayStep();
  }

  private _autoPlayStep(): void {
    const steps = this._steps();
    const idx   = this._currentIdx();
    if (idx >= steps.length - 1) { this.stopAutoPlay(); this._finish(); return; }

    const step  = steps[idx];
    const total = step ? step.code.split('\n').length : 0;
    const start = this._manualLine() ?? (step?.highlightLine ?? 1);
    this._scanLines(start, total, () => {
      if (!this._autoPlaying()) return;
      this.nextStep();
      this._autoLineTimer = setTimeout(() => {
        if (this._autoPlaying()) this._autoPlayStep();
      }, 300);
    });
  }

  private _scanLines(from: number, total: number, onDone: () => void): void {
    this._manualLine.set(from);

    // Check breakpoint
    const stepId = this.currentStep()?.id;
    if (stepId !== undefined && this.hasBreakpoint(stepId, from)) {
      this.stopAutoPlay();
      this._pausedAtBreakpoint.set(true);
      return;
    }

    if (from >= total) {
      this._autoTimer = setTimeout(onDone, 500);
      return;
    }
    this._autoTimer = setTimeout(() => {
      if (!this._autoPlaying()) return;
      this._scanLines(from + 1, total, onDone);
    }, 160);
  }

  stopAutoPlay(): void {
    if (this._autoTimer)     { clearTimeout(this._autoTimer);     this._autoTimer = null; }
    if (this._autoLineTimer) { clearTimeout(this._autoLineTimer); this._autoLineTimer = null; }
    this._autoPlaying.set(false);
  }

  // ── Reset ──────────────────────────────────────────────────────────────
  reset(): void {
    this.stopAutoPlay();
    this._steps.set([]);
    this._nodes.set(this._adapter()?.flowNodes.map(n => ({ ...n, status: 'pending' as const })) ?? []);
    this._currentIdx.set(-1);
    this._isRunning.set(false);
    this._isComplete.set(false);
    this._apiResponse.set(null);
    this._pendingResp.set(null);
    this._reqPayload.set(null);
    this._manualLine.set(null);
    this._breakpoints.set({});
    this._pausedAtBreakpoint.set(false);
  }

  zoomIn():  void { this.codeFontSize.update(s => Math.min(s + 1, 22)); }
  zoomOut(): void { this.codeFontSize.update(s => Math.max(s - 1, 10)); }

  // ── Private helpers ────────────────────────────────────────────────────
  private _finish(): void {
    this.stopAutoPlay();
    const steps  = this._steps();
    const lastIdx = steps.length - 1;
    if (lastIdx >= 0) {
      this._updateStep(lastIdx, 'completed');
      this._updateNode(steps[lastIdx].nodeId, 'completed');
    }
    this._isComplete.set(true);
    this._isRunning.set(false);

    const pending = this._pendingResp();
    if (pending) {
      this._apiResponse.set(pending);
    } else {
      const start = Date.now();
      const poll  = setInterval(() => {
        const res = this._pendingResp();
        if (res) { this._apiResponse.set(res); clearInterval(poll); }
        else if (Date.now() - start > 30_000) {
          this._apiResponse.set({ error: 'API did not respond in 30s.' });
          clearInterval(poll);
        }
      }, 200);
    }
  }

  private _updateStep(idx: number, status: ExecutionStep['status']): void {
    this._steps.update(s => s.map((x, i) => i === idx ? { ...x, status } : x));
  }

  private _updateNode(nodeId: string, status: FlowNode['status']): void {
    this._nodes.update(n => n.map(x => x.id === nodeId ? { ...x, status } : x));
  }
}
