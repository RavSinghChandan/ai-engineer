import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="screen">
      <div class="watermark" aria-hidden="true"></div>

      <div class="inner">
        <!-- Brand -->
        <div class="brand">
          <div class="avatar">
            <img src="rav-photo.png" alt="Rav Singh Chandan" class="avatar-photo" />
          </div>
          <h1 class="title"><strong>AURA</strong> <em>with Rav</em></h1>
          <p class="tag">See life — as it is.</p>
          <p class="sub">360° Astro-Spiritual Intelligence Platform</p>
        </div>

        <!-- Services -->
        <div class="cards">
          <div class="card">
            <img src="jyoti.svg" alt="" />
            <h3>Astrology</h3>
            <p>Vedic, KP &amp; Western, read together</p>
          </div>
          <div class="card">
            <img src="aarav.svg" alt="" />
            <h3>Numerology</h3>
            <p>Your core numbers and what they mean</p>
          </div>
          <div class="card">
            <img src="jyoti-thinking.svg" alt="" />
            <h3>Palmistry</h3>
            <p>Lines and mounts from a photograph</p>
          </div>
          <div class="card">
            <img src="aarav-wow.svg" alt="" />
            <h3>Tarot &amp; Vastu</h3>
            <p>Your question, and the space you live in</p>
          </div>
        </div>

        <!-- Steps -->
        <div class="steps">
          <span><b>1</b> Create a free account</span>
          <span class="dot">·</span>
          <span><b>2</b> Share your birth details</span>
          <span class="dot">·</span>
          <span><b>3</b> Get your 360° reading</span>
        </div>

        <!-- Call to action -->
        <div class="cta">
          <a routerLink="/login" class="btn btn-primary">Get Started — it's free</a>
          <a routerLink="/login" class="btn btn-ghost">Sign In</a>
        </div>

        <!-- Compact footer -->
        <footer class="foot">
          <a href="https://topmate.io/aurawithrav" rel="noopener noreferrer external">Book a 1-on-1</a>
          <span>·</span>
          <a href="mailto:aurawithrav&#64;gmail.com">Email</a>
          <span>·</span>
          <a href="https://youtube.com/&#64;aurawithrav" rel="noopener noreferrer external">YouTube</a>
          <span class="copy">© 2026 Aura with Rav · Powered by AI</span>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* One screen, no scrolling: the shell owns the viewport height and the
       content is centred inside it. Falls back to normal flow if a phone is
       too short for the content to fit legibly. */
    .screen {
      position: relative;
      min-height: 100vh; min-height: 100dvh;
      display: grid; place-items: center;
      padding: 1rem; box-sizing: border-box;
      overflow: hidden;
    }
    .watermark {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(62vw, 520px); aspect-ratio: 1170 / 751;
      background: url('/rav-logo.png') center / contain no-repeat;
      opacity: .06; pointer-events: none; z-index: 0;
    }
    .inner {
      position: relative; z-index: 1;
      width: 100%; max-width: 940px;
      display: flex; flex-direction: column;
      align-items: center; gap: clamp(.7rem, 2vh, 1.4rem);
    }

    .brand { text-align: center; }
    .avatar {
      width: clamp(72px, 9vh, 104px); aspect-ratio: 1;
      margin: 0 auto .5rem; border-radius: 50%;
      background: #fff url('/rav-logo.png') center / 80% no-repeat;
      border: 3px solid rgba(99,102,241,.35);
      box-shadow: 0 4px 20px rgba(99,102,241,.18);
      overflow: hidden; position: relative;
    }
    .avatar-photo {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; object-position: center top;
      -webkit-mask-image: linear-gradient(to top, transparent 0%, black 38%);
      mask-image: linear-gradient(to top, transparent 0%, black 38%);
    }
    .title { font-size: clamp(1.6rem, 4.2vh, 2.5rem); margin: 0 0 .15rem; font-weight: 400; letter-spacing: -.5px; }
    .title strong { font-weight: 800; }
    .title em { color: #4f46e5; font-style: italic; }
    .tag { font-size: clamp(.92rem, 1.9vh, 1.1rem); font-weight: 600; margin: 0 0 .1rem; }
    .sub { color: #6b7280; margin: 0; font-size: clamp(.76rem, 1.5vh, .92rem); }

    .cards {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: clamp(.5rem, 1.2vw, .9rem); width: 100%;
    }
    .card {
      background: rgba(255,255,255,.8); border: 1px solid #e5e7eb;
      border-radius: 12px; padding: clamp(.6rem, 1.6vh, 1rem) .6rem;
      text-align: center;
    }
    .card img { width: clamp(34px, 5.2vh, 52px); height: clamp(34px, 5.2vh, 52px);
                object-fit: contain; margin-bottom: .35rem; }
    .card h3 { margin: 0 0 .2rem; font-size: clamp(.8rem, 1.7vh, .95rem); color: #4338ca; }
    .card p { margin: 0; color: #4b5563; font-size: clamp(.66rem, 1.35vh, .8rem); line-height: 1.4; }

    .steps {
      display: flex; flex-wrap: wrap; justify-content: center;
      align-items: center; gap: .5rem;
      color: #374151; font-size: clamp(.72rem, 1.5vh, .87rem);
    }
    .steps b {
      background: #4338ca; color: #fff; border-radius: 50%;
      width: 1.35em; height: 1.35em; display: inline-grid; place-items: center;
      font-size: .82em; margin-right: .3em; vertical-align: middle;
    }
    .steps .dot { color: #9ca3af; }

    .cta { display: flex; gap: .65rem; flex-wrap: wrap; justify-content: center; }
    .btn { padding: clamp(.6rem, 1.5vh, .85rem) clamp(1.1rem, 3vw, 1.9rem);
           border-radius: 10px; font-weight: 700; text-decoration: none;
           font-size: clamp(.82rem, 1.7vh, .97rem); white-space: nowrap; }
    .btn-primary { background: #4338ca; color: #fff; box-shadow: 0 4px 14px rgba(67,56,202,.25); }
    .btn-ghost { background: rgba(255,255,255,.75); color: #4338ca; border: 1.5px solid #c7d2fe; }

    .foot {
      display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
      gap: .45rem; font-size: clamp(.66rem, 1.3vh, .78rem); color: #6b7280;
    }
    .foot a { color: #4338ca; text-decoration: none; font-weight: 600; }
    .foot .copy { flex-basis: 100%; text-align: center; color: #9ca3af; }

    /* Phones: two columns of cards keeps everything on one screen. */
    @media (max-width: 640px) {
      .cards { grid-template-columns: repeat(2, 1fr); }
      .watermark { width: 86vw; opacity: .05; }
      .cta { width: 100%; flex-direction: column; }
      .btn { width: 100%; box-sizing: border-box; text-align: center; }
    }
    /* Very short screens: let the page scroll rather than crush the text. */
    @media (max-height: 560px) {
      .screen { min-height: auto; padding: 1.5rem 1rem; }
    }
  `],
})
export class HomePage {}
