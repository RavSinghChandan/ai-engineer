import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { AgentProgress, CampaignForm, CampaignResult, LearningInsight, WorkflowEdge, WorkflowNode, WorkflowStepsResponse } from '../models/campaign.model';

const API = 'http://localhost:8000';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  private _result  = new BehaviorSubject<CampaignResult | null>(null);
  private _prev    = new BehaviorSubject<CampaignResult | null>(null);
  private _allRuns = new BehaviorSubject<CampaignResult[]>([]);
  private _running = new BehaviorSubject<boolean>(false);
  private _progress= new BehaviorSubject<number>(0);
  private _runningAgent = new BehaviorSubject<string>('');
  private _agents  = new BehaviorSubject<AgentProgress[]>([]);
  private _activeStep = new BehaviorSubject<string>('');
  private _estimatedRealMs = new BehaviorSubject<number>(0);

  result$       = this._result.asObservable();
  prev$         = this._prev.asObservable();
  allRuns$      = this._allRuns.asObservable();
  running$      = this._running.asObservable();
  progress$     = this._progress.asObservable();
  runningAgent$ = this._runningAgent.asObservable();
  agents$       = this._agents.asObservable();
  activeStep$   = this._activeStep.asObservable();
  estimatedRealMs$ = this._estimatedRealMs.asObservable();

  constructor(private http: HttpClient) {}

  getDemoCampaigns(): Observable<{ campaigns: CampaignForm[] }> {
    return this.http.get<{ campaigns: CampaignForm[] }>(`${API}/api/demo-campaigns`);
  }

  getLearningInsights(): Observable<{ insights: LearningInsight[]; total_learned: number }> {
    return this.http.get<{ insights: LearningInsight[]; total_learned: number }>(`${API}/api/learning-insights`);
  }

  getMemory(): Observable<unknown> {
    return this.http.get(`${API}/api/campaign-memory`);
  }

  clearMemory(): Observable<unknown> {
    return this.http.delete(`${API}/api/campaign-memory`);
  }

  loadSteps(): void {
    this.http.get<WorkflowStepsResponse>(`${API}/api/workflow-steps`).subscribe({
      next: (data) => {
        this._estimatedRealMs.next(data.estimated_real_ms);
        this._agents.next(this.blankAgents(data));
      },
      error: () => { /* the builder still renders; the stream fills this in */ },
    });
  }

  private blankAgents(data: WorkflowStepsResponse): AgentProgress[] {
    return data.agents.map(a => ({
      key: a.key,
      label: a.label,
      progress: 0,
      status: 'idle' as const,
      steps: a.steps.map(st => ({ ...st, status: 'idle' as const })),
    }));
  }

  private patchAgent(key: string, patch: Partial<AgentProgress>): void {
    this._agents.next(
      this._agents.value.map(a => (a.key === key ? { ...a, ...patch } : a)),
    );
  }

  private patchStep(agentKey: string, stepKey: string, status: 'running' | 'done'): void {
    this._agents.next(
      this._agents.value.map(a =>
        a.key === agentKey
          ? { ...a, steps: a.steps.map(s => (s.key === stepKey ? { ...s, status } : s)) }
          : a,
      ),
    );
  }

  /**
   * Run the workflow over server-sent events, so each agent's sub-steps are
   * reported by the backend as they finish. The previous implementation
   * advanced a timer on the client and then made one blocking call, which
   * meant the progress bar moved whether or not anything was running.
   */
  async executeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[], campaign: CampaignForm): Promise<void> {
    const payload = {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label, position: { x: n.x, y: n.y }, data: {} })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
      campaign,
    };

    this._running.next(true);
    this._progress.next(0);
    this._runningAgent.next('');
    this._activeStep.next('');
    this._agents.next(this._agents.value.map(a => ({
      ...a,
      progress: 0,
      status: 'idle' as const,
      steps: a.steps.map(s => ({ ...s, status: 'idle' as const })),
    })));

    try {
      const response = await fetch(`${API}/api/execute-workflow/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; the last chunk may be partial.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          this.handleEvent(JSON.parse(line.slice(6)));
        }
      }
    } catch {
      this._running.next(false);
      this._progress.next(0);
      this._runningAgent.next('');
      this._activeStep.next('');
      alert('Backend not reachable. Ensure FastAPI is running on port 8000.');
    }
  }

  private handleEvent(event: Record<string, unknown>): void {
    const type = event['type'] as string;
    const agentKey = event['agent'] as string;

    if (typeof event['overall_progress'] === 'number') {
      this._progress.next(event['overall_progress'] as number);
    }

    switch (type) {
      case 'agent_start':
        this._runningAgent.next(event['agent_label'] as string);
        this.patchAgent(agentKey, { status: 'running', progress: 0 });
        break;
      case 'step_start':
        this._activeStep.next(event['step_label'] as string);
        this.patchStep(agentKey, event['step'] as string, 'running');
        break;
      case 'step_done':
        this.patchStep(agentKey, event['step'] as string, 'done');
        this.patchAgent(agentKey, { progress: event['agent_progress'] as number });
        break;
      case 'agent_done':
        this.patchAgent(agentKey, { status: 'done', progress: 100 });
        break;
      case 'result': {
        const data = event['result'] as CampaignResult;
        this._prev.next(this._result.value);
        this._result.next(data);
        this._allRuns.next([...this._allRuns.value, data]);
        this._progress.next(100);
        this._running.next(false);
        this._runningAgent.next('');
        this._activeStep.next('');
        break;
      }
      case 'error':
        this._running.next(false);
        this._activeStep.next('');
        alert(`Workflow failed: ${event['message']}`);
        break;
    }
  }

  clearResults(): void {
    this._result.next(null);
    this._prev.next(null);
    this._allRuns.next([]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
