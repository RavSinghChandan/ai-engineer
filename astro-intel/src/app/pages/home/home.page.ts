import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Public landing page for aurawithrav.com.
 *
 * Design goals: a calm, premium, celestial feel that suits a numerology
 * practice — deep indigo night sky, soft gold accents, generous space — and a
 * clear path to sign in or create an account. The layout is a two-column hero
 * on desktop (brand + value on the left, a glass sign-in panel on the right)
 * that stacks cleanly to a single column on phones, which carry most traffic.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="page">
      <!-- Celestial background: layered gradients + a slow starfield -->
      <div class="sky" aria-hidden="true">
        <div class="glow glow-a"></div>
        <div class="glow glow-b"></div>
        <div class="stars"></div>
        <div class="ring"></div>
      </div>

      <header class="nav">
        <a class="logo" routerLink="/">
          <span class="logo-mark">✦</span>
          <span class="logo-text">AURA <em>with Rav</em></span>
        </a>
        <a routerLink="/login" [queryParams]="{ tab: 'signin' }" class="nav-signin">Sign in</a>
      </header>

      <section class="hero">
        <!-- LEFT: the pitch -->
        <div class="pitch">
          <span class="eyebrow">Numerology, read in plain language</span>
          <h1 class="headline">
            See your life<br />
            <span class="grad">as it truly is.</span>
          </h1>
          <p class="lede">
            Your name and date of birth hold a pattern. I read it across the
            Indian, Chaldean and Pythagorean systems — then tell you what it
            means for your career, relationships and timing, without the jargon.
          </p>

          <div class="cta">
            <a routerLink="/login" [queryParams]="{ tab: 'signup' }" class="btn btn-primary">
              Get my reading — free
            </a>
            <a href="https://topmate.io/aurawithrav" rel="noopener noreferrer external" class="btn btn-ghost">
              Book a 1-on-1
            </a>
          </div>

          <div class="trust">
            <div class="faces">
              <img src="rav-photo.png" alt="Rav Singh Chandan" class="face" />
            </div>
            <p>Personally read by <strong>Rav</strong> · thousands of charts interpreted</p>
          </div>
        </div>

        <!-- RIGHT: glass panel that sells the "what you get" and routes to auth -->
        <aside class="panel">
          <div class="panel-head">
            <h2>What you'll receive</h2>
            <p>Start free. No card, no pressure.</p>
          </div>

          <ul class="features">
            <li>
              <span class="num">01</span>
              <div>
                <h3>Your core numbers</h3>
                <p>Life Path, Destiny and Soul Urge — calculated, then explained.</p>
              </div>
            </li>
            <li>
              <span class="num">02</span>
              <div>
                <h3>Three systems compared</h3>
                <p>Indian, Chaldean and Pythagorean — side by side, not cherry-picked.</p>
              </div>
            </li>
            <li>
              <span class="num">03</span>
              <div>
                <h3>Ask anything</h3>
                <p>Career, relationships, health or timing — answered against your chart.</p>
              </div>
            </li>
            <li>
              <span class="num">04</span>
              <div>
                <h3>A full life report</h3>
                <p>A complete written reading with practical, do-this-next remedies.</p>
              </div>
            </li>
          </ul>

          <a routerLink="/login" [queryParams]="{ tab: 'signup' }" class="btn btn-primary btn-block">
            Create your free account
          </a>
          <p class="panel-foot">
            Already have one?
            <a routerLink="/login" [queryParams]="{ tab: 'signin' }">Sign in</a>
          </p>
        </aside>
      </section>

      <footer class="foot">
        <span class="foot-brand">✦ AURA with Rav</span>
        <nav class="foot-links">
          <a href="https://topmate.io/aurawithrav" rel="noopener noreferrer external">Book a 1-on-1</a>
          <a href="mailto:aurawithrav&#64;gmail.com">Email</a>
          <a href="https://youtube.com/&#64;aurawithrav" rel="noopener noreferrer external">YouTube</a>
        </nav>
        <span class="foot-copy">© 2026 Aura with Rav · See life as it is</span>
      </footer>
    </main>
  `,
  styles: [`
    :host { display: block; }

    /* ---- palette -------------------------------------------------------- */
    :host {
      --ink: #0b0720;            /* deep night */
      --ink-2: #150c33;
      --violet: #7c6cff;
      --violet-soft: #a99bff;
      --gold: #f3c96b;
      --gold-soft: #ffe6ad;
      --text: #eae6ff;
      --text-dim: #b3abd6;
      --line: rgba(255,255,255,.10);
      --glass: rgba(255,255,255,.055);
    }

    .page {
      position: relative; min-height: 100vh; min-height: 100dvh;
      display: flex; flex-direction: column;
      color: var(--text);
      background: var(--ink);
      overflow: hidden;
      font-synthesis: none;
    }

    /* ---- celestial backdrop -------------------------------------------- */
    .sky { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
    .glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .55; }
    .glow-a {
      width: 60vw; height: 60vw; max-width: 780px; max-height: 780px;
      top: -18vw; right: -12vw;
      background: radial-gradient(circle, rgba(124,108,255,.75), transparent 68%);
    }
    .glow-b {
      width: 52vw; height: 52vw; max-width: 680px; max-height: 680px;
      bottom: -20vw; left: -14vw;
      background: radial-gradient(circle, rgba(243,201,107,.30), transparent 66%);
    }
    /* starfield made from layered radial-gradient dots */
    .stars {
      position: absolute; inset: 0; opacity: .55;
      background-image:
        radial-gradient(1.4px 1.4px at 12% 22%, #fff, transparent),
        radial-gradient(1.2px 1.2px at 82% 14%, #fff, transparent),
        radial-gradient(1.6px 1.6px at 46% 68%, #fff, transparent),
        radial-gradient(1px 1px at 68% 42%, #fff, transparent),
        radial-gradient(1.3px 1.3px at 28% 84%, #fff, transparent),
        radial-gradient(1px 1px at 92% 76%, #fff, transparent),
        radial-gradient(1.1px 1.1px at 8% 56%, #fff, transparent),
        radial-gradient(1.4px 1.4px at 58% 8%, #fff, transparent);
      animation: twinkle 6s ease-in-out infinite alternate;
    }
    @keyframes twinkle { from { opacity: .35; } to { opacity: .7; } }
    /* faint zodiac ring, upper-centre */
    .ring {
      position: absolute; top: 8%; left: 50%; transform: translateX(-50%);
      width: min(120vw, 1100px); aspect-ratio: 1; border-radius: 50%;
      border: 1px solid rgba(255,255,255,.05);
      box-shadow: 0 0 0 1px rgba(255,255,255,.03) inset,
                  0 0 140px rgba(124,108,255,.12) inset;
    }
    @media (prefers-reduced-motion: reduce) {
      .stars { animation: none; }
    }

    /* ---- top nav -------------------------------------------------------- */
    .nav {
      position: relative; z-index: 2;
      display: flex; align-items: center; justify-content: space-between;
      padding: 1.15rem clamp(1.1rem, 4vw, 3rem);
    }
    .logo { display: inline-flex; align-items: center; gap: .55rem; text-decoration: none; color: var(--text); }
    .logo-mark { color: var(--gold); font-size: 1.15rem; }
    .logo-text { font-weight: 700; letter-spacing: .3px; font-size: 1.05rem; }
    .logo-text em { color: var(--violet-soft); font-style: italic; font-weight: 500; }
    .nav-signin {
      color: var(--text); text-decoration: none; font-weight: 600; font-size: .95rem;
      padding: .55rem 1.1rem; border: 1px solid var(--line); border-radius: 999px;
      transition: border-color .2s, background .2s;
    }
    .nav-signin:hover { border-color: var(--violet-soft); background: rgba(124,108,255,.12); }

    /* ---- hero ----------------------------------------------------------- */
    .hero {
      position: relative; z-index: 1; flex: 1;
      display: grid; grid-template-columns: 1.05fr .95fr;
      align-items: center; gap: clamp(2rem, 5vw, 5rem);
      width: 100%; max-width: 1200px; margin: 0 auto;
      padding: clamp(1.5rem, 4vh, 3.5rem) clamp(1.1rem, 4vw, 3rem);
    }

    .eyebrow {
      display: inline-block; font-size: .8rem; letter-spacing: .16em;
      text-transform: uppercase; color: var(--gold-soft);
      border: 1px solid rgba(243,201,107,.28); border-radius: 999px;
      padding: .4rem .85rem; margin-bottom: 1.4rem;
    }
    .headline {
      font-size: clamp(2.4rem, 6vw, 4rem); line-height: 1.04;
      font-weight: 800; letter-spacing: -1.5px; margin: 0 0 1.1rem;
    }
    .grad {
      background: linear-gradient(100deg, var(--violet-soft), var(--gold));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede {
      font-size: clamp(1rem, 1.5vw, 1.18rem); line-height: 1.65;
      color: var(--text-dim); max-width: 34ch; margin: 0 0 2rem;
    }

    .cta { display: flex; flex-wrap: wrap; gap: .85rem; margin-bottom: 2rem; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      font-weight: 700; text-decoration: none; border-radius: 14px;
      padding: 1rem 1.7rem; font-size: 1rem; min-height: 54px;
      box-sizing: border-box; transition: transform .15s, box-shadow .2s, background .2s;
    }
    .btn:active { transform: translateY(1px); }
    .btn-primary {
      color: #1a1140;
      background: linear-gradient(100deg, var(--gold-soft), var(--gold));
      box-shadow: 0 10px 30px rgba(243,201,107,.28);
    }
    .btn-primary:hover { box-shadow: 0 14px 40px rgba(243,201,107,.42); }
    .btn-ghost {
      color: var(--text); background: rgba(255,255,255,.06);
      border: 1px solid var(--line);
    }
    .btn-ghost:hover { background: rgba(255,255,255,.12); border-color: var(--violet-soft); }
    .btn-block { width: 100%; }

    .trust { display: flex; align-items: center; gap: .8rem; }
    .faces .face {
      width: 44px; height: 44px; border-radius: 50%; object-fit: cover;
      object-position: center top; border: 2px solid rgba(255,255,255,.5);
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
    }
    .trust p { margin: 0; font-size: .9rem; color: var(--text-dim); }
    .trust strong { color: var(--text); }

    /* ---- glass panel ---------------------------------------------------- */
    .panel {
      background: var(--glass);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: clamp(1.4rem, 2.5vw, 2rem);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      box-shadow: 0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
    }
    .panel-head h2 { margin: 0 0 .2rem; font-size: 1.3rem; font-weight: 700; }
    .panel-head p { margin: 0 0 1.3rem; color: var(--text-dim); font-size: .92rem; }

    .features { list-style: none; margin: 0 0 1.5rem; padding: 0; display: grid; gap: 1rem; }
    .features li { display: flex; gap: .9rem; align-items: flex-start; }
    .num {
      flex: none; width: 40px; height: 40px; border-radius: 12px;
      display: grid; place-items: center; font-weight: 800; font-size: .95rem;
      color: var(--gold-soft);
      background: rgba(124,108,255,.14);
      border: 1px solid rgba(124,108,255,.3);
    }
    .features h3 { margin: 0 0 .15rem; font-size: 1rem; font-weight: 700; color: var(--text); }
    .features p { margin: 0; font-size: .88rem; line-height: 1.5; color: var(--text-dim); }

    .panel-foot { text-align: center; margin: .9rem 0 0; font-size: .9rem; color: var(--text-dim); }
    .panel-foot a { color: var(--gold-soft); font-weight: 700; text-decoration: none; }
    .panel-foot a:hover { text-decoration: underline; }

    /* ---- footer --------------------------------------------------------- */
    .foot {
      position: relative; z-index: 1;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: .6rem 1.4rem; padding: 1.4rem clamp(1.1rem, 4vw, 3rem) 1.8rem;
      border-top: 1px solid var(--line); color: var(--text-dim); font-size: .85rem;
    }
    .foot-brand { color: var(--text); font-weight: 700; }
    .foot-links { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; }
    .foot-links a { color: var(--violet-soft); text-decoration: none; font-weight: 600; padding: .4rem 0; }
    .foot-links a:hover { color: var(--gold-soft); }
    .foot-copy { color: rgba(179,171,214,.6); }

    /* ---- responsive ----------------------------------------------------- */
    @media (max-width: 900px) {
      .hero {
        grid-template-columns: 1fr; gap: 2rem;
        padding-top: 1.5rem; padding-bottom: 2.5rem;
      }
      .pitch { text-align: center; display: flex; flex-direction: column; align-items: center; }
      .lede { max-width: 46ch; }
      .cta { justify-content: center; }
      .headline { font-size: clamp(2.3rem, 9vw, 3.2rem); }
    }
    @media (max-width: 560px) {
      .nav { padding: 1rem 1.1rem; }
      .logo-text { font-size: .98rem; }
      .cta { flex-direction: column; width: 100%; }
      .btn { width: 100%; }
      .panel { border-radius: 18px; }
      .foot { flex-direction: column; gap: .35rem; text-align: center; }
      /* 44px minimum tap targets on phones */
      .nav-signin { min-height: 44px; display: inline-flex; align-items: center; }
      .foot-links { gap: 0 1rem; }
      .foot-links a { min-height: 44px; display: inline-flex; align-items: center; }
      .panel-foot a { display: inline-block; padding: .3rem .4rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .btn { transition: none; }
    }
  `],
})
export class HomePage {}
