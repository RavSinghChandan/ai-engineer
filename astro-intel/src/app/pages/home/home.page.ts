import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppFooterComponent } from '../../components/shared/app-footer.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, AppFooterComponent],
  template: `
    <div class="home">
      <!-- the logo sits behind everything as a faint watermark -->
      <div class="watermark" aria-hidden="true"></div>

      <header class="hero">
        <div class="avatar">
          <img src="rav-photo.png" alt="Rav Singh Chandan" class="avatar-photo" />
        </div>
        <h1 class="title"><strong>AURA</strong> <em>with Rav</em></h1>
        <p class="tag">See life — as it is.</p>
        <p class="sub">360° Astro-Spiritual Intelligence Platform</p>

        <div class="cta">
          <a routerLink="/login" class="btn btn-primary">Get Started — it's free</a>
          <a routerLink="/login" class="btn btn-ghost">Sign In</a>
        </div>
      </header>

      <section class="feats">
        <article class="feat">
          <img src="jyoti.svg" alt="" class="feat-img" />
          <h3>Astrology</h3>
          <p>Vedic, KP and Western charts read together, not in isolation.</p>
        </article>
        <article class="feat">
          <img src="aarav.svg" alt="" class="feat-img" />
          <h3>Numerology</h3>
          <p>Your core numbers, what they mean and how they interact.</p>
        </article>
        <article class="feat">
          <img src="jyoti-thinking.svg" alt="" class="feat-img" />
          <h3>Palmistry</h3>
          <p>Line and mount reading from a photograph of your palm.</p>
        </article>
        <article class="feat">
          <img src="aarav-wow.svg" alt="" class="feat-img" />
          <h3>Tarot &amp; Vastu</h3>
          <p>Guidance on the question in front of you, and the space you live in.</p>
        </article>
      </section>

      <section class="guides">
        <img src="aarav-happy.svg" alt="" class="guide" />
        <div class="guides-text">
          <h2>Two guides, one reading</h2>
          <p>
            Aarav and Jyoti walk you through every step — asking what matters,
            explaining what the charts say, and leaving out what does not help.
          </p>
        </div>
        <img src="jyoti-wow.svg" alt="" class="guide" />
      </section>

      <section class="how">
        <h2>How it works</h2>
        <ol>
          <li><span>1</span> Create your free account</li>
          <li><span>2</span> Share your birth details</li>
          <li><span>3</span> Receive your 360° reading</li>
        </ol>
        <a routerLink="/login" class="btn btn-primary btn-wide">Create your free account</a>
      </section>

      <app-footer />
    </div>
  `,
  styles: [`
    .home { position: relative; max-width: 1000px; margin: 0 auto; padding: 0 1rem; overflow-x: hidden; }

    /* watermark — the logo, very faint, fixed behind the content */
    /* Absolutely positioned rather than a fixed background: background-attachment
       is unreliable on mobile Safari and drifts off-centre. */
    .watermark {
      position: absolute; top: 40px; left: 50%;
      transform: translateX(-50%);
      width: min(74vw, 560px); aspect-ratio: 1170 / 751;
      z-index: 0; pointer-events: none;
      background: url('/rav-logo.png') center / contain no-repeat;
      opacity: .07;
    }
    .home > * { position: relative; z-index: 1; }

    .hero { text-align: center; padding: 3rem 0 2.25rem; }
    .avatar {
      width: 132px; height: 132px; margin: 0 auto 1rem; border-radius: 50%;
      background: #fff url('/rav-logo.png') center / 80% no-repeat;
      border: 3px solid rgba(99,102,241,.35);
      box-shadow: 0 4px 22px rgba(99,102,241,.18);
      overflow: hidden; position: relative;
    }
    .avatar-photo {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; object-position: center top;
      -webkit-mask-image: linear-gradient(to top, transparent 0%, black 38%);
      mask-image: linear-gradient(to top, transparent 0%, black 38%);
    }
    .title { font-size: 2.6rem; margin: 0 0 .3rem; font-weight: 400; letter-spacing: -.5px; }
    .title strong { font-weight: 800; }
    .title em { color: #4f46e5; font-style: italic; }
    .tag { font-size: 1.15rem; font-weight: 600; margin: 0 0 .2rem; }
    .sub { color: #6b7280; margin: 0 0 1.6rem; font-size: .95rem; }

    .cta { display: flex; gap: .7rem; justify-content: center; flex-wrap: wrap; }
    .btn { display: inline-block; padding: .85rem 1.8rem; border-radius: 10px;
           font-weight: 700; text-decoration: none; font-size: .97rem; }
    .btn-primary { background: #4338ca; color: #fff; box-shadow: 0 4px 14px rgba(67,56,202,.25); }
    .btn-ghost { background: rgba(255,255,255,.7); color: #4338ca; border: 1.5px solid #c7d2fe; }
    .btn-wide { margin-top: 1.4rem; }

    .feats { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
             gap: 1rem; padding: .5rem 0 2.5rem; }
    .feat { background: rgba(255,255,255,.72); border: 1px solid #e5e7eb;
            border-radius: 14px; padding: 1.25rem 1.1rem; text-align: center; }
    .feat-img { width: 62px; height: 62px; object-fit: contain; margin-bottom: .6rem; }
    .feat h3 { margin: 0 0 .35rem; font-size: 1.02rem; color: #4338ca; }
    .feat p { margin: 0; color: #4b5563; font-size: .88rem; line-height: 1.5; }

    .guides { display: flex; align-items: center; gap: 1.25rem; justify-content: center;
              background: rgba(238,242,255,.75); border-radius: 16px;
              padding: 1.5rem 1.25rem; margin-bottom: 2.5rem; }
    .guide { width: 92px; height: 92px; object-fit: contain; flex: none; }
    .guides-text { text-align: center; }
    .guides-text h2 { margin: 0 0 .4rem; font-size: 1.25rem; }
    .guides-text p { margin: 0; color: #4b5563; font-size: .9rem; line-height: 1.55; }

    .how { text-align: center; padding: 0 0 3rem; }
    .how h2 { font-size: 1.5rem; margin: 0 0 1.2rem; }
    .how ol { list-style: none; padding: 0; margin: 0; display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: .9rem; }
    .how li { display: flex; align-items: center; gap: .6rem; justify-content: center;
              color: #374151; font-size: .93rem; }
    .how li span { background: #4338ca; color: #fff; width: 26px; height: 26px;
                   border-radius: 50%; display: grid; place-items: center;
                   font-size: .78rem; font-weight: 700; flex: none; }

    @media (max-width: 620px) {
      .title { font-size: 2rem; }
      .avatar { width: 108px; height: 108px; }
      .cta { flex-direction: column; align-items: stretch; padding: 0 .5rem; }
      .btn { width: 100%; box-sizing: border-box; text-align: center; }
      .guides { flex-direction: column; gap: .75rem; }
      .guide { width: 74px; height: 74px; }
      .watermark { top: 20px; width: 86vw; opacity: .06; }
    }
  `],
})
export class HomePage {}
