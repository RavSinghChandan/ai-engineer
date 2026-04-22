import { Component, OnInit, OnDestroy, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { WorkflowService } from '../../services/workflow.service';
import { CampaignService } from '../../services/campaign.service';
import { WorkflowNode, WorkflowEdge, CampaignForm } from '../../models/campaign.model';

@Component({
  selector: 'app-workflow-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, AsyncPipe],
  template: `
    <div class="flex gap-5 h-full animate-fade-in">

      <!-- Left: Canvas + presets -->
      <div class="flex-1 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="section-title">Workflow Builder</h2>
            <p class="text-xs text-gray-500 mt-0.5">Drag nodes to rearrange · Edges show LangGraph data flow</p>
          </div>
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <div class="relative">
              <input type="checkbox" [(ngModel)]="campaign.learning_mode" class="sr-only peer">
              <div class="w-10 h-5 rounded-full bg-gray-700 peer-checked:bg-indigo-600 transition-colors duration-200"></div>
              <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 peer-checked:translate-x-5"></div>
            </div>
            <span class="text-sm font-medium" [class]="campaign.learning_mode ? 'text-indigo-400' : 'text-gray-500'">
              🧠 Learning {{ campaign.learning_mode ? 'ON' : 'OFF' }}
            </span>
          </label>
        </div>

        <!-- SVG + Node Canvas -->
        <div #canvas class="glass rounded-2xl relative overflow-hidden"
             style="height:380px; background: radial-gradient(circle at 50% 50%, rgba(99,102,241,0.04) 0%, transparent 70%);"
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
               class="absolute agent-node p-3 w-44 select-none"
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
                <div class="text-xs font-semibold text-white leading-tight truncate">{{ node.label }}</div>
                <div class="text-gray-500 mt-0.5 leading-tight" style="font-size:10px;">{{ node.description }}</div>
              </div>
            </div>
            <div class="mt-2 flex items-center gap-1.5 pointer-events-none">
              <div *ngIf="node.status==='idle'"    class="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
              <div *ngIf="node.status==='running'" class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
              <div *ngIf="node.status==='done'"    class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
              <span class="text-gray-500 pointer-events-none" style="font-size:10px;">
                {{ node.status === 'running' ? 'Processing...' : node.status === 'done' ? 'Completed ✓' : 'Ready' }}
              </span>
            </div>
          </div>

          <!-- Running overlay -->
          <div *ngIf="running$ | async" class="absolute bottom-3 left-3 right-3 pointer-events-none">
            <div class="glass rounded-lg px-3 py-2 flex items-center gap-2">
              <div class="flex gap-1">
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 loading-dot"></div>
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 loading-dot"></div>
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 loading-dot"></div>
              </div>
              <span class="text-xs text-indigo-300">{{ runningAgent$ | async }}</span>
              <div class="ml-auto text-xs text-gray-500">{{ progress$ | async }}%</div>
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div *ngIf="running$ | async" class="glass rounded-full h-1.5 overflow-hidden -mt-2">
          <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
               [style.width.%]="progress$ | async"></div>
        </div>

        <!-- Demo presets -->
        <div class="glass-card">
          <div class="label-text mb-3">⚡ Quick Load Demo Campaign</div>
          <div class="grid grid-cols-3 gap-2">
            <button *ngFor="let d of demoCampaigns" (click)="loadDemo(d)"
              class="text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 transition-all duration-200">
              <div class="text-lg mb-1">{{ campaignEmoji(d['campaign_type']) }}</div>
              <div class="text-xs font-semibold text-white leading-tight">{{ d['name'] }}</div>
              <div class="text-xs text-gray-500 mt-0.5">₹{{ ((d['budget'] ?? 0) / 1000).toFixed(0) }}K budget</div>
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Config + Execute -->
      <div class="w-80 flex flex-col gap-4">
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

        <button (click)="execute()" [disabled]="(running$ | async) === true"
          class="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm">
          <ng-container *ngIf="!(running$ | async)">▶ Execute LangGraph Workflow</ng-container>
          <ng-container *ngIf="running$ | async">
            <span class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            Running agents...
          </ng-container>
        </button>

        <!-- Execution log -->
        <div *ngIf="agentLog.length > 0" class="glass-card max-h-52 overflow-y-auto">
          <div class="label-text mb-2">Execution Log</div>
          <div class="space-y-1.5">
            <div *ngFor="let log of agentLog" class="flex items-center gap-2 text-xs">
              <span class="text-emerald-400">✓</span>
              <span class="text-gray-300">{{ log.agent }}</span>
              <span class="ml-auto text-gray-600 text-xs">done</span>
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
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  async execute(): Promise<void> {
    this.agentLog = [];
    this.workflowSvc.animateExecution();
    await this.campaignSvc.executeWorkflow(this.nodes, this.edges, this.campaign);
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
    return 'rgba(255,255,255,0.1)';
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
