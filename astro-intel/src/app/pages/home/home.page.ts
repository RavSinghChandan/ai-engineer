import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Public landing page for aurawithrav.com.
 *
 * Design goals: a calm, premium, light feel that suits a numerology practice —
 * warm ivory ground, the AURA emblem tiled softly across the whole background,
 * gold and ink accents — and a clear path to sign in or create an account. The
 * layout is a two-column hero on desktop (brand + value on the left, a card on
 * the right) that stacks to a single column on phones, which carry most
 * traffic.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="page">
      <!-- Tiled emblem watermark + soft colour washes -->
      <div class="canvas" aria-hidden="true">
        <div class="weave"></div>
        <div class="wash wash-a"></div>
        <div class="wash wash-b"></div>
      </div>

      <header class="nav">
        <a class="logo" routerLink="/">
          <img src="rav-emblem.png" alt="" class="logo-mark" />
          <span class="logo-text">AURA <em>with Rav</em></span>
        </a>
        <a routerLink="/login" class="nav-signin">Sign in</a>
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
            <a routerLink="/login" class="btn btn-primary">
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

        <!-- RIGHT: card that sells the "what you get" and routes to auth -->
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

          <a routerLink="/login" class="btn btn-primary btn-block">
            Create your free account
          </a>
          <p class="panel-foot">
            Already have one?
            <a routerLink="/login">Sign in</a>
          </p>
        </aside>
      </section>

      <footer class="foot">
        <span class="foot-brand">AURA with Rav</span>
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

    /* ---- palette (light) ------------------------------------------------ */
    :host {
      --ivory: #fbf8f2;          /* warm paper ground */
      --ivory-2: #f4eee3;
      --gold: #b08d3f;           /* the logo gold, darkened for contrast */
      --gold-soft: #d8bd7e;
      --ink: #2b2a33;            /* body text */
      --ink-soft: #6b6878;
      --line: rgba(43,42,51,.12);
      --card: rgba(255,255,255,.82);
    }

    .page {
      position: relative; min-height: 100vh; min-height: 100dvh;
      display: flex; flex-direction: column;
      color: var(--ink);
      background: var(--ivory);
      overflow: hidden;
      font-synthesis: none;
      /* Cover the app-wide brand stamp; this page carries its own mark. */
      z-index: 1;
    }

    /* ---- tiled emblem watermark ----------------------------------------- */
    .canvas { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
    .weave {
      position: absolute; inset: -10%;
      background-image: url('/rav-emblem.png');
      background-repeat: repeat;
      background-size: clamp(120px, 14vw, 190px) auto;
      /* Low opacity keeps it a watermark, not a pattern that fights the text. */
      opacity: .07;
      /* Slow drift so the page feels alive without distracting. */
      animation: drift 90s linear infinite;
    }
    @keyframes drift {
      from { transform: translate3d(0, 0, 0); }
      to   { transform: translate3d(-190px, -190px, 0); }
    }
    .wash { position: absolute; border-radius: 50%; filter: blur(90px); }
    .wash-a {
      width: 60vw; height: 60vw; max-width: 760px; max-height: 760px;
      top: -20vw; right: -14vw;
      background: radial-gradient(circle, rgba(216,189,126,.34), transparent 70%);
    }
    .wash-b {
      width: 52vw; height: 52vw; max-width: 660px; max-height: 660px;
      bottom: -22vw; left: -16vw;
      background: radial-gradient(circle, rgba(176,141,63,.18), transparent 68%);
    }
    @media (prefers-reduced-motion: reduce) {
      .weave { animation: none; }
    }

    /* ---- top nav -------------------------------------------------------- */
    .nav {
      position: relative; z-index: 2;
      display: flex; align-items: center; justify-content: space-between;
      padding: 1.15rem clamp(1.1rem, 4vw, 3rem);
    }
    .logo { display: inline-flex; align-items: center; gap: .6rem; text-decoration: none; color: var(--ink); }
    .logo-mark { width: 34px; height: 34px; object-fit: contain; }
    .logo-text { font-weight: 700; letter-spacing: .3px; font-size: 1.05rem; }
    .logo-text em { color: var(--gold); font-style: italic; font-weight: 500; }
    .nav-signin {
      color: var(--ink); text-decoration: none; font-weight: 600; font-size: .95rem;
      padding: .55rem 1.1rem; border: 1px solid var(--line); border-radius: 999px;
      background: rgba(255,255,255,.7);
      transition: border-color .2s, background .2s;
    }
    .nav-signin:hover { border-color: var(--gold); background: #fff; }

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
      text-transform: uppercase; color: var(--gold);
      border: 1px solid rgba(176,141,63,.35); border-radius: 999px;
      background: rgba(255,255,255,.6);
      padding: .4rem .85rem; margin-bottom: 1.4rem;
    }
    .headline {
      font-size: clamp(2.4rem, 6vw, 4rem); line-height: 1.04;
      font-weight: 800; letter-spacing: -1.5px; margin: 0 0 1.1rem;
    }
    .grad {
      background: linear-gradient(100deg, var(--gold), #8c6d28);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede {
      font-size: clamp(1rem, 1.5vw, 1.18rem); line-height: 1.65;
      color: var(--ink-soft); max-width: 34ch; margin: 0 0 2rem;
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
      color: #fff;
      background: linear-gradient(100deg, #c39a45, var(--gold));
      box-shadow: 0 10px 26px rgba(176,141,63,.30);
    }
    .btn-primary:hover { box-shadow: 0 14px 34px rgba(176,141,63,.42); }
    .btn-ghost {
      color: var(--ink); background: rgba(255,255,255,.75);
      border: 1px solid var(--line);
    }
    .btn-ghost:hover { background: #fff; border-color: var(--gold); }
    .btn-block { width: 100%; }

    .trust { display: flex; align-items: center; gap: .8rem; }
    .faces .face {
      width: 44px; height: 44px; border-radius: 50%; object-fit: cover;
      object-position: center top; border: 2px solid #fff;
      box-shadow: 0 3px 12px rgba(43,42,51,.18);
    }
    .trust p { margin: 0; font-size: .9rem; color: var(--ink-soft); }
    .trust strong { color: var(--ink); }

    /* ---- card ----------------------------------------------------------- */
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: clamp(1.4rem, 2.5vw, 2rem);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 20px 50px rgba(43,42,51,.10);
    }
    .panel-head h2 { margin: 0 0 .2rem; font-size: 1.3rem; font-weight: 700; }
    .panel-head p { margin: 0 0 1.3rem; color: var(--ink-soft); font-size: .92rem; }

    .features { list-style: none; margin: 0 0 1.5rem; padding: 0; display: grid; gap: 1rem; }
    .features li { display: flex; gap: .9rem; align-items: flex-start; }
    .num {
      flex: none; width: 40px; height: 40px; border-radius: 12px;
      display: grid; place-items: center; font-weight: 800; font-size: .95rem;
      color: var(--gold);
      background: rgba(176,141,63,.10);
      border: 1px solid rgba(176,141,63,.28);
    }
    .features h3 { margin: 0 0 .15rem; font-size: 1rem; font-weight: 700; color: var(--ink); }
    .features p { margin: 0; font-size: .88rem; line-height: 1.5; color: var(--ink-soft); }

    .panel-foot { text-align: center; margin: .9rem 0 0; font-size: .9rem; color: var(--ink-soft); }
    .panel-foot a { color: var(--gold); font-weight: 700; text-decoration: none; }
    .panel-foot a:hover { text-decoration: underline; }

    /* ---- footer --------------------------------------------------------- */
    .foot {
      position: relative; z-index: 1;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: .6rem 1.4rem; padding: 1.4rem clamp(1.1rem, 4vw, 3rem) 1.8rem;
      border-top: 1px solid var(--line); color: var(--ink-soft); font-size: .85rem;
    }
    .foot-brand { color: var(--ink); font-weight: 700; letter-spacing: .3px; }
    .foot-links { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; }
    .foot-links a { color: var(--gold); text-decoration: none; font-weight: 600; padding: .4rem 0; }
    .foot-links a:hover { color: #8c6d28; }
    .foot-copy { color: rgba(107,104,120,.75); }

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
export class HomePage implements OnInit, OnDestroy {
  // The app shell paints a fixed gold brand stamp on every page. This page
  // carries its own tiled emblem, so hide the stamp while it is open.
  ngOnInit(): void { document.body.classList.add('home-active'); }
  ngOnDestroy(): void { document.body.classList.remove('home-active'); }
}
