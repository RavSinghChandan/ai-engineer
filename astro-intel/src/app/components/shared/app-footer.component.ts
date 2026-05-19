import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
<footer class="site-footer">

  <!-- ── Desktop strip (compact, fits fixed-height shell) ── -->
  <div class="sf-desktop">
    <div class="sf-d-left">
      <img src="rav-logo.png" alt="Aura with Rav" class="sf-d-logo"/>
      <span class="sf-d-name">AURA <em>with Rav</em></span>
      <span class="sf-d-sep">·</span>
      <span class="sf-d-tag">Guiding Energies, Empowering Lives</span>
    </div>
    <div class="sf-d-links">
      <a href="mailto:aurawithrav@gmail.com" class="sf-d-link" title="Email us">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        Email
      </a>
      <span class="sf-d-sep">·</span>
      <a href="https://www.youtube.com/@aurawithrav" class="sf-d-link sf-yt" target="_blank" rel="noopener" title="YouTube">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 1.96C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
        YouTube
      </a>
      <span class="sf-d-sep">·</span>
      <a href="https://www.linkedin.com/groups/10040340/" class="sf-d-link sf-li" target="_blank" rel="noopener" title="LinkedIn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
        LinkedIn
      </a>
      <span class="sf-d-sep">·</span>
      <a href="https://topmate.io/aurawithrav" class="sf-d-book" target="_blank" rel="noopener">
        Book a Session ↗
      </a>
    </div>
    <span class="sf-d-copy">© {{ year }} Aura with Rav</span>
  </div>

  <!-- ── Mobile expanded footer (visible only <960px) ── -->
  <div class="sf-mobile">
    <div class="sf-m-inner">

      <div class="sf-m-brand">
        <img src="rav-logo.png" alt="" class="sf-m-logo"/>
        <div>
          <p class="sf-m-name">AURA <em>with Rav</em></p>
          <p class="sf-m-tag">Guiding Energies, Empowering Lives</p>
        </div>
      </div>

      <div class="sf-m-links">
        <a href="mailto:aurawithrav@gmail.com" class="sf-m-link" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          aurawithrav&#64;gmail.com
        </a>
        <a href="https://www.youtube.com/@aurawithrav" class="sf-m-link sf-m-yt" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 1.96C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
          YouTube — @aurawithrav
        </a>
        <a href="https://www.linkedin.com/groups/10040340/" class="sf-m-link sf-m-li" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
          LinkedIn Community
        </a>
      </div>

      <a href="https://topmate.io/aurawithrav" class="sf-m-cta" target="_blank" rel="noopener">
        Book a 1-on-1 Session with Chandan Kumar ↗
      </a>

      <p class="sf-m-copy">© {{ year }} Aura with Rav · For guidance only · Powered by AI</p>
    </div>
  </div>

</footer>
  `,
  styles: [`
:host { display: block; }

/* ── Shared ── */
.site-footer {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  flex-shrink: 0;
}

/* ══════════════════════════════════════════════════
   DESKTOP STRIP — compact, matches app chrome style
   Visible above 960px
══════════════════════════════════════════════════ */
.sf-desktop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  height: 36px;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(99,102,241,0.1);
  flex-wrap: nowrap;
  overflow: hidden;
}

.sf-d-left {
  display: flex; align-items: center; gap: 7px; flex-shrink: 0;
}
.sf-d-logo {
  width: 18px; height: 18px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
}
.sf-d-name {
  font-size: 11px; font-weight: 700; color: #1e1b4b; letter-spacing: 0.04em; white-space: nowrap;
}
.sf-d-name em { font-style: italic; color: #6366f1; font-weight: 400; }
.sf-d-tag { font-size: 10px; color: #94a3b8; white-space: nowrap; }
.sf-d-sep { color: rgba(0,0,0,0.15); font-size: 10px; }

.sf-d-links {
  display: flex; align-items: center; gap: 6px; flex: 1; justify-content: center;
}
.sf-d-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; color: #6b7280; text-decoration: none;
  transition: color 0.15s; white-space: nowrap;
}
.sf-d-link:hover { color: #4338ca; }
.sf-yt:hover { color: #dc2626; }
.sf-li:hover { color: #2563eb; }

.sf-d-book {
  display: inline-flex; align-items: center;
  font-size: 10.5px; font-weight: 700; color: #6366f1;
  text-decoration: none; white-space: nowrap;
  transition: color 0.15s;
}
.sf-d-book:hover { color: #4338ca; text-decoration: underline; }

.sf-d-copy { font-size: 10px; color: #d1d5db; white-space: nowrap; flex-shrink: 0; }

/* ══════════════════════════════════════════════════
   MOBILE EXPANDED — visible only <960px
══════════════════════════════════════════════════ */
.sf-mobile { display: none; }

@media (max-width: 960px) {
  .sf-desktop { display: none; }
  .sf-mobile  { display: block; }

  .sf-m-inner {
    background: #f8faff;
    border-top: 1px solid #e0e7ff;
    padding: 1.5rem 1.25rem 1.25rem;
    display: flex; flex-direction: column; gap: 1.1rem;
  }

  .sf-m-brand {
    display: flex; align-items: center; gap: 10px;
  }
  .sf-m-logo {
    width: 36px; height: 36px;
    border-radius: 8px;
    object-fit: contain;
    border: 1px solid #e0e7ff;
    background: #fff;
    flex-shrink: 0;
  }
  .sf-m-name {
    font-size: 0.95rem; font-weight: 800; color: #1e1b4b; margin: 0 0 2px;
  }
  .sf-m-name em { font-style: italic; color: #6366f1; font-weight: 400; }
  .sf-m-tag  { font-size: 0.75rem; color: #94a3b8; margin: 0; }

  .sf-m-links {
    display: flex; flex-direction: column; gap: 0.6rem;
    border-top: 1px solid #e0e7ff;
    padding-top: 0.9rem;
  }
  .sf-m-link {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.83rem; color: #374151; text-decoration: none;
    transition: color 0.15s;
  }
  .sf-m-link:hover { color: #4338ca; }
  .sf-m-link svg { flex-shrink: 0; color: #6366f1; }
  .sf-m-yt:hover { color: #dc2626; }
  .sf-m-yt:hover svg { color: #dc2626; }
  .sf-m-li:hover { color: #2563eb; }
  .sf-m-li:hover svg { color: #2563eb; }

  .sf-m-cta {
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: #fff; text-decoration: none;
    font-size: 0.85rem; font-weight: 700;
    padding: 0.7rem 1.25rem; border-radius: 0.7rem;
    text-align: center; transition: opacity 0.15s;
  }
  .sf-m-cta:hover { opacity: 0.88; }

  .sf-m-copy {
    font-size: 0.72rem; color: #9ca3af;
    text-align: center; margin: 0;
    border-top: 1px solid #e0e7ff;
    padding-top: 0.75rem;
  }
}
  `]
})
export class AppFooterComponent {
  readonly year = new Date().getFullYear();
}
