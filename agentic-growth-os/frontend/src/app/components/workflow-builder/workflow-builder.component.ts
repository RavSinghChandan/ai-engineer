import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { WorkflowService } from '../../services/workflow.service';
import { CampaignService } from '../../services/campaign.service';
import { AgentProgress, LiveStep, WorkflowNode, WorkflowEdge, CampaignForm } from '../../models/campaign.model';

@Component({
  selector: 'app-workflow-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, AsyncPipe],
  template: `
    <div class="flex flex-col xl:flex-row gap-5 h-full animate-fade-in">

      <!-- Left: Canvas + presets -->
      <div class="flex-1 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="section-title">Workflow Builder</h2>
            <p class="text-xs text-slate-500 mt-0.5">Drag nodes to rearrange · Edges show LangGraph data flow</p>
          </div>
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <div class="relative">
              <input type="checkbox" [(ngModel)]="campaign.learning_mode" class="sr-only peer">
              <div class="w-10 h-5 rounded-full bg-gray-700 peer-checked:bg-indigo-600 transition-colors duration-200"></div>
              <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 peer-checked:translate-x-5"></div>
            </div>
            <span class="text-sm font-medium" [class]="campaign.learning_mode ? 'text-indigo-600' : 'text-slate-500'">
              🧠 Learning {{ campaign.learning_mode ? 'ON' : 'OFF' }}
            </span>
          </label>
        </div>

        <!-- SVG + Node Canvas -->
        <div #canvas class="glass rounded-2xl relative overflow-x-auto overflow-y-hidden"
             style="height:560px; background-color:#fafafa; background-image: radial-gradient(rgba(15,23,42,.10) 1px, transparent 1px); background-size: 20px 20px;"
             (mousemove)="onMouseMove($event)"
             (mouseup)="onMouseUp()"
             (mouseleave)="onMouseUp()">

          <!-- SVG edges -->
          <svg class="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" opacity="0.55"/>
              </marker>
              <marker id="arr-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#a5b4fc"/>
              </marker>
            </defs>
            <path *ngFor="let e of edges"
              [attr.d]="edgePath(e)"
              [attr.stroke]="edgeActive(e) ? '#a5b4fc' : '#6366f1'"
              [attr.stroke-width]="edgeActive(e) ? '2.5' : '1.5'"
              stroke-opacity="0.5" fill="none"
              [attr.marker-end]="edgeActive(e) ? 'url(#arr-active)' : 'url(#arr)'"
              [attr.stroke-dasharray]="edgeActive(e) ? '6 3' : 'none'"
            />
          </svg>

          <!-- Agent nodes (drag via mousedown) -->
          <div *ngFor="let node of nodes"
               class="absolute agent-node p-3 w-48 select-none"
               [style.left.px]="node.x"
               [style.top.px]="node.y"
               [style.border-color]="nodeBorderColor(node)"
               [class.running]="node.status === 'running'"
               [class.done]="node.status === 'done'"
               style="border-width:1.5px; cursor:grab;"
               (mousedown)="startDrag($event, node)">

            <div class="flex items-start gap-2.5 pointer-events-none">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                   [style.background]="node.color + '25'">{{ node.icon }}</div>
              <div class="min-w-0">
                <div class="text-sm font-bold text-slate-900 leading-tight truncate">{{ node.label }}</div>
                <div class="text-slate-500 mt-0.5 leading-tight text-xs" *ngIf="node.status === 'idle'">{{ node.description }}</div>
              </div>
            </div>
            <ng-container *ngIf="agentFor(node.id) as ag">
              <div class="mt-2 pointer-events-none">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium"
                        [class]="node.status === 'running' ? 'text-indigo-600' : node.status === 'done' ? 'text-emerald-600' : 'text-slate-500'">
                    {{ node.status === 'running' ? 'Running' : node.status === 'done' ? 'Completed' : 'Ready' }}
                  </span>
                  <span class="text-xs font-bold tabular-nums"
                        [class]="node.status === 'done' ? 'text-emerald-600' : 'text-indigo-600'">{{ ag.progress }}%</span>
                </div>
                <div class="h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-300"
                       [style.width.%]="ag.progress"
                       [style.background]="node.status === 'done' ? '#10b981' : node.color"></div>
                </div>
                <div class="mt-2 flex items-center gap-1.5" *ngIf="node.status !== 'idle'">
                  <span *ngFor="let st of ag.steps; let i = index"
                        class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold tabular-nums transition-colors"
                        [class]="st.status === 'done' ? 'bg-emerald-500 text-white'
                               : st.status === 'running' ? 'bg-indigo-600 text-white ring-2 ring-indigo-200'
                               : 'bg-slate-200 text-slate-500'"
                        [title]="st.label">{{ st.status === 'done' ? '✓' : i + 1 }}</span>
                </div>
                <!-- Name only the step in flight; the rest are pips above. -->
                <div class="mt-1.5 text-xs font-semibold text-indigo-700 truncate"
                     *ngIf="runningStepLabel(ag) as label">{{ label }}</div>
              </div>
            </ng-container>
          </div>

          <!-- Running overlay -->
          <div *ngIf="running$ | async" class="absolute top-2 left-3 right-3 pointer-events-none z-20">
            <div class="glass rounded-lg px-3 py-2 flex items-center gap-2">
              <div class="flex gap-1">
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 loading-dot"></div>
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 loading-dot"></div>
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 loading-dot"></div>
              </div>
              <span class="text-xs text-indigo-700 font-semibold flex-shrink-0">{{ runningAgent$ | async }}</span>
              <span class="text-xs text-slate-600 truncate">{{ activeStep$ | async }}</span>
              <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                <span class="text-xs text-slate-500 tabular-nums">{{ (elapsedMs / 1000) | number:'1.1-1' }}s</span>
                <span class="text-xs font-semibold text-indigo-700 tabular-nums">{{ progress$ | async }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div *ngIf="running$ | async" class="-mt-2 space-y-1.5">
          <div class="glass rounded-full h-2 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
                 [style.width.%]="progress$ | async"></div>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-400" *ngIf="estimatedRealMs">
            <span>Step timing is scaled from measured API latency</span>
            <span class="tabular-nums">~{{ (estimatedRealMs / 1000) | number:'1.0-0' }}s against live ad platforms</span>
          </div>
        </div>

        <!-- Execution trail. Every agent that has started stays on screen with
             its steps, so a viewer can read back what happened rather than
             watching one line get overwritten. -->
        <div *ngIf="showTrail" class="glass-card p-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
            <span class="text-sm font-bold text-slate-900">Agent Execution</span>
            <span class="text-xs text-slate-500">{{ doneAgentCount }} of {{ agents.length }} agents complete</span>
            <div class="ml-auto flex items-center gap-3">
              <span class="text-sm font-bold text-indigo-700 tabular-nums">{{ progress$ | async }}%</span>
              <span class="text-xs text-slate-500 tabular-nums">{{ (elapsedMs / 1000) | number:'1.1-1' }}s</span>
            </div>
          </div>

          <div class="divide-y divide-slate-100 max-h-80 overflow-y-auto" #trail>
            <div *ngFor="let ag of startedAgents" class="px-4 py-3">
              <!-- Agent header: green once finished, indigo while running -->
              <div class="flex items-center gap-2.5">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      [class]="ag.status === 'done' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'">
                  {{ ag.status === 'done' ? '✓' : '▸' }}
                </span>
                <span class="text-base font-bold"
                      [class]="ag.status === 'done' ? 'text-emerald-700' : 'text-indigo-700'">{{ ag.label }}</span>
                <span class="text-xs text-slate-500 hidden sm:inline">{{ ag.role }}</span>
                <span class="ml-auto text-sm font-bold tabular-nums"
                      [class]="ag.status === 'done' ? 'text-emerald-600' : 'text-indigo-600'">{{ ag.progress }}%</span>
              </div>

              <!-- Its steps, numbered, kept on screen after they finish -->
              <div class="mt-2 ml-8.5 space-y-1.5" style="margin-left:2.1rem;">
                <div *ngFor="let st of ag.steps; let i = index"
                     class="flex items-start gap-2.5"
                     [class.opacity-35]="st.status === 'idle'">
                  <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold tabular-nums flex-shrink-0 mt-px"
                        [class]="st.status === 'done' ? 'bg-emerald-100 text-emerald-700'
                               : st.status === 'running' ? 'bg-indigo-600 text-white'
                               : 'bg-slate-100 text-slate-400'">{{ st.status === 'done' ? '✓' : i + 1 }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-semibold"
                         [class]="st.status === 'running' ? 'text-indigo-700'
                                : st.status === 'done' ? 'text-slate-700' : 'text-slate-400'">{{ st.label }}</div>
                    <div class="text-xs text-slate-500 leading-snug" *ngIf="st.status !== 'idle'">{{ st.detail }}</div>
                    <!-- Time bar runs for exactly as long as the step is held -->
                    <div *ngIf="st.status === 'running'" class="mt-1 h-0.5 rounded-full bg-indigo-100 overflow-hidden">
                      <div class="h-full bg-indigo-500 rounded-full step-timer"
                           [style.animation-duration.s]="st.seconds || 2"></div>
                    </div>
                  </div>
                  <span class="text-xs text-slate-400 tabular-nums flex-shrink-0"
                        *ngIf="st.status === 'done' && st.tookSeconds">{{ st.tookSeconds | number:'1.1-1' }}s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Primary action, centred under the workflow it runs -->
        <div class="flex justify-center">
          <button (click)="execute()" [disabled]="(running$ | async) === true"
            class="btn-primary flex items-center justify-center gap-2.5 px-10 py-3.5 text-base">
            <ng-container *ngIf="!(running$ | async)">▶ Build My Campaign</ng-container>
            <ng-container *ngIf="running$ | async">
              <span class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
              Building campaign…
            </ng-container>
          </button>
        </div>

        <!-- Demo presets -->
        <div class="glass-card">
          <div class="label-text mb-3">⚡ Quick Load Demo Campaign</div>
          <div class="grid grid-cols-3 gap-2">
            <button *ngFor="let d of demoCampaigns" (click)="loadDemo(d)"
              class="text-left p-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-400 transition-all duration-200">
              <div class="text-lg mb-1">{{ campaignEmoji(d['campaign_type']) }}</div>
              <div class="text-xs font-semibold text-slate-900 leading-tight">{{ d['name'] }}</div>
              <div class="text-xs text-slate-500 mt-0.5">₹{{ ((d['budget'] ?? 0) / 1000).toFixed(0) }}K budget</div>
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Config + Execute -->
      <div class="w-full xl:w-72 flex-shrink-0 flex flex-col gap-4">
        <div class="glass-card flex-1 overflow-y-auto">
          <div class="section-title mb-4">Campaign Config</div>
          <div class="space-y-3">
            <div>
              <label class="label-text block mb-1">Campaign Name</label>
              <input class="input-field" [(ngModel)]="campaign.name" placeholder="Campaign name">
            </div>
            <div>
              <label class="label-text block mb-1">Campaign Type</label>
              <select class="select-field" [(ngModel)]="campaign.campaign_type">
                <option value="real_estate">🏠 Real Estate</option>
                <option value="coaching">📚 Coaching / EdTech</option>
                <option value="ecommerce">🛍️ E-commerce</option>
                <option value="custom">⚙️ Custom</option>
              </select>
            </div>
            <div>
              <label class="label-text block mb-1">Product / Brand</label>
              <input class="input-field" [(ngModel)]="campaign.product_name" placeholder="Product or brand name">
            </div>
            <div>
              <label class="label-text block mb-1">Budget (₹)</label>
              <input class="input-field" type="number" [(ngModel)]="campaign.budget" placeholder="50000">
            </div>
            <div>
              <label class="label-text block mb-1">Target Audience</label>
              <textarea class="input-field resize-none" rows="2" [(ngModel)]="campaign.target_audience"
                placeholder="Describe your ideal customer..."></textarea>
            </div>
            <div>
              <label class="label-text block mb-1">Key Benefit / USP</label>
              <textarea class="input-field resize-none" rows="2" [(ngModel)]="campaign.key_benefit"
                placeholder="Why should they choose you?"></textarea>
            </div>
            <div>
              <label class="label-text block mb-1">Platform</label>
              <select class="select-field" [(ngModel)]="campaign.platform">
                <option value="google_ads">🔵 Google Ads</option>
                <option value="meta_ads">🟣 Meta Ads</option>
                <option value="both">⚡ Google + Meta</option>
              </select>
            </div>
          </div>
        </div>



        <!-- Execution log -->
        <div *ngIf="agentLog.length > 0" class="glass-card max-h-52 overflow-y-auto">
          <div class="label-text mb-2">Execution Log</div>
          <div class="space-y-1.5">
            <div *ngFor="let log of agentLog" class="flex items-center gap-2 text-xs">
              <span class="text-emerald-600">✓</span>
              <span class="text-slate-700">{{ log.agent }}</span>
              <span class="ml-auto text-slate-500 text-xs">done</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class WorkflowBuilderComponent implements OnInit, OnDestroy {
  nodes: WorkflowNode[] = [];
  edges: WorkflowEdge[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  demoCampaigns: any[] = [];
  agentLog: { agent: string }[] = [];

  campaign: CampaignForm = {
    name: 'Premium Residences Launch',
    campaign_type: 'real_estate',
    product_name: 'Skyline Heights',
    budget: 50000,
    target_audience: 'Home buyers aged 30-50, upper middle class',
    key_benefit: 'Ready to move luxury apartments with world-class amenities',
    platform: 'google_ads',
    learning_mode: true,
  };

  running$      = this.campaignSvc.running$;
  progress$     = this.campaignSvc.progress$;
  runningAgent$ = this.campaignSvc.runningAgent$;
  activeStep$   = this.campaignSvc.activeStep$;
  liveStep: LiveStep | null = null;
  showTrail = false;
  @ViewChild('trail') trailRef?: ElementRef<HTMLElement>;
  agents: AgentProgress[] = [];
  estimatedRealMs = 0;
  elapsedMs = 0;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;

  // Drag state
  private dragging: WorkflowNode | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  private subs = new Subscription();

  constructor(
    private workflowSvc: WorkflowService,
    private campaignSvc: CampaignService,
    private elRef: ElementRef,
  ) {}

  ngOnInit(): void {
    this.subs.add(this.workflowSvc.nodes$.subscribe(n => (this.nodes = n)));
    this.subs.add(this.workflowSvc.edges$.subscribe(e => (this.edges = e)));
    this.subs.add(this.campaignSvc.result$.subscribe(r => {
      if (r) this.agentLog = r.agent_log;
    }));
    this.campaignSvc.getDemoCampaigns().subscribe(d => (this.demoCampaigns = d.campaigns));

    // Agent progress comes from the backend stream; mirror it onto the canvas.
    this.subs.add(this.campaignSvc.agents$.subscribe(a => {
      this.agents = a;
      for (const agent of a) this.workflowSvc.applyAgentStatus(agent.key, agent.status);
    }));
    this.subs.add(this.campaignSvc.liveStep$.subscribe(v => {
      this.liveStep = v;
      // Follow the run as the trail grows past the panel's height.
      queueMicrotask(() => {
        const el = this.trailRef?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }));
    this.subs.add(this.campaignSvc.estimatedRealMs$.subscribe(ms => (this.estimatedRealMs = ms)));
    this.campaignSvc.loadSteps();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.stopElapsed();
  }

  async execute(): Promise<void> {
    this.agentLog = [];
    this.workflowSvc.resetExecution();
    this.showTrail = true;
    this.startElapsed();
    await this.campaignSvc.executeWorkflow(this.nodes, this.edges, this.campaign);
    this.stopElapsed();
  }

  private startElapsed(): void {
    this.stopElapsed();
    const started = Date.now();
    this.elapsedMs = 0;
    this.elapsedTimer = setInterval(() => (this.elapsedMs = Date.now() - started), 100);
  }

  private stopElapsed(): void {
    if (this.elapsedTimer) { clearInterval(this.elapsedTimer); this.elapsedTimer = null; }
  }

  private static readonly NODE_AGENT_KEYS: Record<string, string> = {
    '1': 'audience', '2': 'ad_copy', '3': 'budget', '4': 'campaign', '5': 'performance',
  };

  /** Agents that have started, so the trail grows rather than pre-filling. */
  get startedAgents(): AgentProgress[] {
    return this.agents.filter(a => a.status !== 'idle');
  }

  get doneAgentCount(): number {
    return this.agents.filter(a => a.status === 'done').length;
  }

  runningStepLabel(agent: AgentProgress): string | null {
    return agent.steps.find(s => s.status === 'running')?.label ?? null;
  }

  agentFor(nodeId: string): AgentProgress | undefined {
    const key = WorkflowBuilderComponent.NODE_AGENT_KEYS[nodeId];
    return this.agents.find(a => a.key === key);
  }

  // ── Drag handlers ──────────────────────────────────────────
  startDrag(event: MouseEvent, node: WorkflowNode): void {
    event.preventDefault();
    this.dragging = node;
    const canvasRect = (this.elRef.nativeElement as HTMLElement)
      .querySelector('.glass.rounded-2xl')!.getBoundingClientRect();
    this.dragOffsetX = event.clientX - canvasRect.left - node.x;
    this.dragOffsetY = event.clientY - canvasRect.top  - node.y;
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.dragging) return;
    const canvasEl = (this.elRef.nativeElement as HTMLElement).querySelector('.glass.rounded-2xl')!;
    const rect = canvasEl.getBoundingClientRect();
    const newX = Math.max(0, Math.min(event.clientX - rect.left - this.dragOffsetX, rect.width  - 176));
    const newY = Math.max(0, Math.min(event.clientY - rect.top  - this.dragOffsetY, rect.height - 90));
    this.workflowSvc.updateNodePosition(this.dragging.id, newX, newY);
  }

  onMouseUp(): void { this.dragging = null; }

  // ── SVG helpers ────────────────────────────────────────────
  edgePath(edge: WorkflowEdge): string {
    const src = this.nodes.find(n => n.id === edge.source);
    const tgt = this.nodes.find(n => n.id === edge.target);
    if (!src || !tgt) return '';
    const x1 = src.x + 176, y1 = src.y + 44;
    const x2 = tgt.x,       y2 = tgt.y + 44;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  }

  edgeActive(edge: WorkflowEdge): boolean {
    const src = this.nodes.find(n => n.id === edge.source);
    return src?.status === 'running' || src?.status === 'done';
  }

  nodeBorderColor(node: WorkflowNode): string {
    if (node.status === 'running') return '#6366f1';
    if (node.status === 'done')    return '#10b981';
    return '#e2e8f0';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadDemo(demo: any): void {
    this.campaign = { ...demo, learning_mode: true };
  }

  campaignEmoji(type: string): string {
    const m: Record<string, string> = { real_estate: '🏠', coaching: '📚', ecommerce: '🛍️', custom: '⚙️' };
    return m[type] ?? '📢';
  }
}
