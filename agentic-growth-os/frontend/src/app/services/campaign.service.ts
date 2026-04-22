import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { CampaignForm, CampaignResult, LearningInsight, WorkflowEdge, WorkflowNode } from '../models/campaign.model';

const API = 'http://localhost:8000';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  private _result  = new BehaviorSubject<CampaignResult | null>(null);
  private _prev    = new BehaviorSubject<CampaignResult | null>(null);
  private _allRuns = new BehaviorSubject<CampaignResult[]>([]);
  private _running = new BehaviorSubject<boolean>(false);
  private _progress= new BehaviorSubject<number>(0);
  private _runningAgent = new BehaviorSubject<string>('');

  result$       = this._result.asObservable();
  prev$         = this._prev.asObservable();
  allRuns$      = this._allRuns.asObservable();
  running$      = this._running.asObservable();
  progress$     = this._progress.asObservable();
  runningAgent$ = this._runningAgent.asObservable();

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

  async executeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[], campaign: CampaignForm): Promise<void> {
    const agents = ['Audience Agent', 'Ad Copy Agent', 'Budget Optimizer', 'Campaign Agent', 'Performance Analyzer'];
    this._running.next(true);
    this._progress.next(0);

    for (let i = 0; i < agents.length; i++) {
      this._runningAgent.next(agents[i]);
      this._progress.next(Math.round(((i + 1) / agents.length) * 75));
      await this.delay(500);
    }

    const payload = {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label, position: { x: n.x, y: n.y }, data: {} })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
      campaign,
    };

    this.http.post<CampaignResult>(`${API}/api/execute-workflow`, payload).subscribe({
      next: (data) => {
        this._prev.next(this._result.value);
        this._result.next(data);
        this._allRuns.next([...this._allRuns.value, data]);
        this._progress.next(100);
        this._running.next(false);
        this._runningAgent.next('');
      },
      error: () => {
        this._running.next(false);
        this._progress.next(0);
        alert('Backend not reachable. Ensure FastAPI is running on port 8000.');
      },
    });
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
