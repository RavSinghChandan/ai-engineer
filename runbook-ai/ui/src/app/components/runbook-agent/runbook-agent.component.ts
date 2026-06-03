import { Component, inject, signal, ViewChild, ElementRef, AfterViewChecked, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RunbookAgentService } from '../../services/runbook-agent.service';
import { AuthService } from '../../services/auth.service';

function md(text: string): string {
  if (!text) return '';
  return text
    .replace(/\|(.+)\|/g, (_: string, r: string) => r.split('|').map((c: string) => c.trim()).filter(Boolean).join(' · '))
    .replace(/^---+$/gm, '<hr/>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/[*][*](.+?)[*][*]/g, '<strong>$1</strong>').replace(/[*](.+?)[*]/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[- ] (.+)$/gm, '<li>$1</li>').replaceAll(/(<li>[\s\S]*?<\/li>)(\s*(?!<li>))/g, '<ul>$1</ul>$2')
    .replace(/^\d+[.] (.+)$/gm, '<li>$1</li>')
    .replaceAll(/\n\n+/g, '<br/><br/>').replaceAll('\n', '<br/>');
}

@Component({
  selector: 'app-runbook-agent',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (auth.isLoggedIn) {
      <button class="ai-fab" (click)="agent.toggle()" [class.open]="agent.isOpen()" aria-label="Ask Rex">
        <div class="fab-av-wrap"><img src="rex-happy.svg" class="fab-av" alt="Rex"/><span class="fab-pulse"></span></div>
        <div class="fab-txt"><span class="fab-name">Rex</span><span class="fab-sub">Incident AI · On call!</span></div>
        @if (unread() > 0 && !agent.isOpen()) { <span class="fab-badge">{{ unread() }}</span> }
      </button>

      @if (agent.isOpen()) {
        <div class="ai-panel" [style.width.px]="pw()" [style.height.px]="ph()" role="dialog">
          <div class="resize-h" (mousedown)="rsStart($event)">⤡</div>
          <div class="ai-header">
            <img src="rex-happy.svg" class="h-av" alt="Rex"/>
            <div class="h-info"><strong>Rex</strong><span>RunbookAI · Incident Guide ✦</span></div>
            <button class="h-btn" (click)="newSession()" title="New conversation">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
            <button class="h-btn h-close" (click)="agent.close()">✕</button>
          </div>
          <div class="ai-msgs" #scrollRef>
            @if (!agent.hasMessages()) {
              <div class="welcome">
                <img src="rex-happy.svg" class="w-av" alt="Rex"/>
                <p class="w-title">Hey! I'm Rex ⚡</p>
                <p class="w-sub">Your DevOps AI guide for RunbookAI. Ask me about runbooks, incidents, or how the platform works.</p>
                <div class="q-grid">
                  @for (p of agent.quickPrompts; track p) { <button class="q-btn" (click)="send(p)">{{ p }}</button> }
                </div>
              </div>
            }
            @for (msg of agent.messages(); track $index) {
              <div class="msg" [class.mu]="msg.role==='user'" [class.ma]="msg.role==='agent'">
                @if (msg.role==='agent') { <img [src]="av($index)" class="m-av" alt="Rex"/> }
                <div class="m-col" [class.mc-u]="msg.role==='user'">
                  <div class="bubble" [class.bu]="msg.role==='user'" [class.ba]="msg.role==='agent'">
                    @if (msg.role==='agent') { <span [innerHTML]="safe(msg.content)"></span>@if (msg.streaming){<span class="cur">▌</span>} }
                    @else { {{ msg.content }} }
                  </div>
                  <span class="mt">{{ msg.timestamp | date:'HH:mm' }}</span>
                </div>
              </div>
            }
            @if (agent.isLoading()) {
              <div class="msg ma"><img src="rex-thinking.svg" class="m-av" alt="Rex"/><div class="bubble ba typing"><span></span><span></span><span></span></div></div>
            }
            @if (agent.error()) { <div class="err">⚠️ {{ agent.error() }}<button (click)="agent.error.set(null)">✕</button></div> }
          </div>
          @if (agent.qCount() > 0 && !agent.isLimited()) {
            <div class="lbar"><span class="ldot"></span>{{ agent.qRemaining() }} question{{ agent.qRemaining()===1?'':'s' }} remaining</div>
          }
          <div class="ai-input">
            @if (agent.isLimited()) {
              <div class="locked">🔒 Limit reached &nbsp;·&nbsp;<button class="new-btn" (click)="newSession()">New session</button></div>
            } @else {
              <input class="inp" type="text" [placeholder]="'Ask about runbooks… (' + agent.qRemaining() + ' left)'" [(ngModel)]="draft" (keydown.enter)="send(draft)" [disabled]="agent.isLoading()||agent.isStreaming()" maxlength="500"/>
              <button class="send" (click)="send(draft)" [disabled]="!draft.trim()||agent.isLoading()||agent.isStreaming()">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .ai-fab { position:fixed; bottom:24px; right:24px; z-index:10000; display:flex; align-items:center; gap:10px; padding:8px 16px 8px 8px; border-radius:50px; background:#fff; border:1.5px solid rgba(34,197,94,0.35); cursor:pointer; box-shadow:0 4px 16px rgba(34,197,94,0.2),0 1px 4px rgba(0,0,0,0.08); transition:transform .2s,box-shadow .2s; }
    .ai-fab:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(34,197,94,0.3); }
    .ai-fab.open { background:#f0fdf4; border-color:#22c55e; }
    .fab-av-wrap { position:relative; width:40px; height:40px; flex-shrink:0; }
    .fab-av { width:40px; height:40px; border-radius:50%; object-fit:contain; background:#f0fdf4; padding:2px; }
    .fab-pulse { position:absolute; bottom:0; right:0; width:11px; height:11px; border-radius:50%; background:#22c55e; border:2px solid #fff; animation:pulse 2s infinite; }
    @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)} 50%{box-shadow:0 0 0 5px rgba(34,197,94,0)} }
    .fab-txt { display:flex; flex-direction:column; line-height:1.2; }
    .fab-name { font-size:13px; font-weight:800; color:#1a2540; }
    .fab-sub  { font-size:10px; color:#16a34a; }
    .fab-badge { position:absolute; top:-6px; right:-6px; background:#ef4444; color:#fff; font-size:10px; font-weight:800; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
    .ai-panel { position:fixed; bottom:90px; right:24px; z-index:9999; display:flex; flex-direction:column; border-radius:18px; background:#fff; border:1px solid rgba(34,197,94,0.2); box-shadow:0 12px 40px rgba(34,197,94,0.12),0 2px 8px rgba(0,0,0,0.08); overflow:hidden; animation:su .22s ease; min-width:300px; min-height:340px; max-width:90vw; max-height:90vh; }
    @keyframes su { from{opacity:0;transform:translateY(14px) scale(.98)} to{opacity:1;transform:translateY(0) scale(1)} }
    .resize-h { position:absolute; top:6px; left:8px; font-size:14px; color:rgba(34,197,94,.4); cursor:nw-resize; user-select:none; z-index:10; transition:color .15s; }
    .resize-h:hover { color:rgba(34,197,94,.9); }
    .ai-header { display:flex; align-items:center; gap:10px; padding:12px 14px 12px 28px; background:linear-gradient(135deg,#f0fdf4,#dcfce7); border-bottom:1px solid rgba(34,197,94,.15); flex-shrink:0; }
    .h-av { width:36px; height:36px; border-radius:50%; background:#f0fdf4; flex-shrink:0; border:2px solid rgba(34,197,94,.2); }
    .h-info { flex:1; }
    .h-info strong { display:block; color:#1a2540; font-size:13px; font-weight:800; }
    .h-info span   { color:#16a34a; font-size:10px; }
    .h-btn { background:none; border:none; color:#16a34a; font-size:14px; cursor:pointer; padding:5px 7px; border-radius:7px; transition:background .15s; line-height:1; display:flex; align-items:center; }
    .h-btn:hover { background:rgba(34,197,94,.1); }
    .h-close { font-size:16px; }
    .ai-msgs { flex:1; overflow-y:auto; padding:14px 12px; display:flex; flex-direction:column; gap:12px; background:#f8fff9; scrollbar-width:thin; scrollbar-color:rgba(34,197,94,.25) transparent; }
    .welcome { text-align:center; padding:16px 8px 8px; }
    .w-av { width:80px; height:80px; margin:0 auto 12px; display:block; border-radius:50%; background:#f0fdf4; border:3px solid rgba(34,197,94,.2); padding:4px; object-fit:contain; }
    .w-title { color:#1a2540; font-weight:800; margin:0 0 5px; font-size:15px; }
    .w-sub   { color:#64748b; font-size:11.5px; margin:0 0 14px; line-height:1.6; }
    .q-grid  { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .q-btn { padding:8px 10px; border-radius:10px; background:#fff; border:1px solid rgba(34,197,94,.25); color:#166534; font-size:11px; cursor:pointer; text-align:left; transition:background .15s; line-height:1.35; font-weight:500; box-shadow:0 1px 3px rgba(0,0,0,.05); }
    .q-btn:hover { background:#f0fdf4; border-color:#22c55e; }
    .msg { display:flex; align-items:flex-end; gap:7px; }
    .mu { flex-direction:row-reverse; }
    .ma { flex-direction:row; }
    .m-av { width:30px; height:30px; border-radius:50%; flex-shrink:0; margin-bottom:16px; background:#f0fdf4; border:2px solid rgba(34,197,94,.15); padding:2px; object-fit:contain; }
    .m-col { display:flex; flex-direction:column; max-width:80%; }
    .mc-u { align-items:flex-end; }
    .bubble { padding:10px 13px; border-radius:14px; font-size:13px; line-height:1.6; word-break:break-word; }
    .bu { background:linear-gradient(135deg,#16a34a,#15803d); color:#fff; border-bottom-right-radius:4px; }
    .ba { background:#fff; color:#1a2540; border-bottom-left-radius:4px; border:1px solid rgba(34,197,94,.12); box-shadow:0 1px 4px rgba(0,0,0,.06); }
    .ba h2,.ba h3,.ba h4 { color:#166534; font-weight:700; margin:6px 0 3px; }
    .ba strong { color:#1a2540; font-weight:700; }
    .ba em { color:#16a34a; }
    .ba code { background:#f0fdf4; color:#166534; padding:1px 5px; border-radius:4px; font-size:11.5px; }
    .ba ul { margin:4px 0 4px 16px; } .ba li { margin:3px 0; color:#374151; }
    .ba hr { border:none; border-top:1px solid rgba(34,197,94,.15); margin:8px 0; }
    .mt { font-size:10px; color:#94a3b8; margin-top:3px; }
    .cur { animation:blink .7s step-end infinite; color:#22c55e; }
    @keyframes blink { 50%{opacity:0} }
    .typing { display:flex !important; gap:5px; align-items:center; padding:12px 16px !important; }
    .typing span { width:7px; height:7px; border-radius:50%; background:#22c55e; animation:bounce 1.2s infinite; }
    .typing span:nth-child(2){animation-delay:.2s} .typing span:nth-child(3){animation-delay:.4s}
    @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
    .err { display:flex; align-items:center; justify-content:space-between; padding:7px 11px; border-radius:8px; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; font-size:11.5px; }
    .err button { background:none; border:none; color:#dc2626; cursor:pointer; }
    .lbar { display:flex; align-items:center; gap:6px; padding:5px 14px; background:#fffbeb; border-top:1px solid rgba(245,158,11,.2); font-size:11px; color:#92400e; font-weight:500; flex-shrink:0; }
    .ldot { width:7px; height:7px; border-radius:50%; background:#f59e0b; flex-shrink:0; }
    .locked { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:8px 12px; background:#fef2f2; border-radius:10px; border:1px solid #fecaca; font-size:12px; color:#dc2626; font-weight:600; }
    .new-btn { background:#dc2626; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; }
    .ai-input { display:flex; gap:7px; padding:10px 12px; border-top:1px solid rgba(34,197,94,.12); background:#fff; flex-shrink:0; }
    .inp { flex:1; padding:9px 13px; border-radius:10px; background:#f8fff9; border:1px solid rgba(34,197,94,.25); color:#1a2540; font-size:13px; outline:none; transition:border-color .2s; font-family:inherit; }
    .inp::placeholder { color:#94a3b8; } .inp:focus { border-color:#22c55e; background:#fff; } .inp:disabled { opacity:.45; }
    .send { width:38px; height:38px; flex-shrink:0; border-radius:10px; background:linear-gradient(135deg,#22c55e,#16a34a); border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:opacity .15s,transform .15s; }
    .send:hover:not(:disabled) { opacity:.85; transform:scale(1.07); }
    .send:disabled { opacity:.3; cursor:not-allowed; }
    @media(max-width:480px) { .ai-panel{width:calc(100vw - 20px) !important; right:10px; bottom:80px;} .ai-fab{right:10px; bottom:10px;} .q-grid{grid-template-columns:1fr;} }
  `]
})
export class RunbookAgentComponent implements AfterViewChecked, OnDestroy {
  agent     = inject(RunbookAgentService);
  auth      = inject(AuthService);
  sanitizer = inject(DomSanitizer);
  draft = ''; unread = signal(0); pw = signal(390); ph = signal(560);
  private _lmc = 0; private _rs = false; private _sx = 0; private _sy = 0; private _sw = 390; private _sh = 560;
  private _om!: (e: MouseEvent) => void; private _ou!: () => void;
  @ViewChild('scrollRef') private readonly scrollRef!: ElementRef<HTMLDivElement>;
  av(i: number) { return ['rex-happy.svg','rex.svg','rex-thinking.svg','rex-wow.svg'][i%4]; }
  safe(t: string): SafeHtml { return this.sanitizer.bypassSecurityTrustHtml(md(t)); } // NOSONAR
  async send(t: string) { if (!t.trim()) return; this.draft=''; await this.agent.chatStream(t); if(!this.agent.isOpen()) this.unread.update(n=>n+1); }
  async newSession() { await this.agent.clearSession(); }
  rsStart(e: MouseEvent) {
    this._rs=true; this._sx=e.clientX; this._sy=e.clientY; this._sw=this.pw(); this._sh=this.ph(); e.preventDefault();
    this._om=(ev)=>{ if(!this._rs)return; this.pw.set(Math.max(300,Math.min(700,this._sw+(this._sx-ev.clientX)))); this.ph.set(Math.max(340,Math.min(860,this._sh+(this._sy-ev.clientY)))); };
    this._ou=()=>{ this._rs=false; globalThis.removeEventListener('mousemove',this._om); globalThis.removeEventListener('mouseup',this._ou); };
    globalThis.addEventListener('mousemove',this._om); globalThis.addEventListener('mouseup',this._ou);
  }
  @HostListener('window:keydown.escape') onEsc() { if(this.agent.isOpen()) this.agent.close(); }
  ngAfterViewChecked() { const c=this.agent.messages().length; if(c!==this._lmc&&this.scrollRef?.nativeElement){this._lmc=c;const el=this.scrollRef.nativeElement;el.scrollTop=el.scrollHeight;} }
  ngOnDestroy() { if(this._om) globalThis.removeEventListener('mousemove',this._om); if(this._ou) globalThis.removeEventListener('mouseup',this._ou); }
}
