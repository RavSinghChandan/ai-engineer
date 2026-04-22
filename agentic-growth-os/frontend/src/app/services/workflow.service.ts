import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WorkflowEdge, WorkflowNode } from '../models/campaign.model';

const DEFAULT_NODES: WorkflowNode[] = [
  { id: '1', type: 'audienceAgent',         label: 'Audience Agent',       color: '#6366f1', icon: '👥', description: 'Segments & identifies ideal audience',  x: 60,  y: 180, status: 'idle' },
  { id: '2', type: 'adCopyAgent',           label: 'Ad Copy Agent',        color: '#8b5cf6', icon: '✍️', description: 'Generates high-converting ad creatives', x: 280, y: 80,  status: 'idle' },
  { id: '3', type: 'budgetOptimizerAgent',  label: 'Budget Optimizer',     color: '#06b6d4', icon: '💰', description: 'Allocates budget for max ROI',           x: 280, y: 280, status: 'idle' },
  { id: '4', type: 'campaignAgent',         label: 'Campaign Agent',       color: '#10b981', icon: '🚀', description: 'Launches & manages campaigns',          x: 500, y: 180, status: 'idle' },
  { id: '5', type: 'performanceAnalyzerAgent', label: 'Performance Analyzer', color: '#f59e0b', icon: '📊', description: 'Tracks ROI & optimization signals',  x: 720, y: 180, status: 'idle' },
];

const DEFAULT_EDGES: WorkflowEdge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
  { id: 'e4-5', source: '4', target: '5' },
];

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private _nodes = new BehaviorSubject<WorkflowNode[]>(DEFAULT_NODES.map(n => ({ ...n })));
  private _edges = new BehaviorSubject<WorkflowEdge[]>([...DEFAULT_EDGES]);

  nodes$ = this._nodes.asObservable();
  edges$ = this._edges.asObservable();

  get nodes(): WorkflowNode[] { return this._nodes.value; }
  get edges(): WorkflowEdge[] { return this._edges.value; }

  updateNodePosition(id: string, x: number, y: number): void {
    this._nodes.next(this._nodes.value.map(n => n.id === id ? { ...n, x, y } : n));
  }

  setNodeStatus(id: string, status: WorkflowNode['status']): void {
    this._nodes.next(this._nodes.value.map(n => n.id === id ? { ...n, status } : n));
  }

  setAllStatus(status: WorkflowNode['status']): void {
    this._nodes.next(this._nodes.value.map(n => ({ ...n, status })));
  }

  async animateExecution(): Promise<void> {
    this.setAllStatus('idle');
    const order = ['1', '2', '3', '4', '5'];
    for (const id of order) {
      this.setNodeStatus(id, 'running');
      await this.delay(550);
      this.setNodeStatus(id, 'done');
    }
  }

  private delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}
