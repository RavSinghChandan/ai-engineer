import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppFooterComponent } from '../../components/shared/app-footer.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, AppFooterComponent],
  template: `
    <div class="home-wrap">
      <header class="hero">
        <img src="aura-logo.svg" alt="" class="hero-logo" onerror="this.style.display='none'" />
        <h1 class="hero-title"><strong>AURA</strong> <span>with Rav</span></h1>
        <p class="hero-tag">See life — as it is.</p>
        <p class="hero-sub">360° Astro-Spiritual Intelligence Platform</p>

        <div class="hero-cta">
          <a routerLink="/login" class="btn btn-primary">Get Started</a>
          <a routerLink="/login" class="btn btn-ghost">Sign In</a>
        </div>
        <p class="hero-note">Create a free account to get your first reading.</p>
      </header>

      <section class="feats">
        <article class="feat">
          <h3>Astrology</h3>
          <p>Vedic, KP and Western charts read together, not in isolation.</p>
        </article>
        <article class="feat">
          <h3>Numerology</h3>
          <p>Your core numbers, what they mean and how they interact.</p>
        </article>
        <article class="feat">
          <h3>Palmistry</h3>
          <p>Line and mount reading from a photograph of your palm.</p>
        </article>
        <article class="feat">
          <h3>Tarot &amp; Vastu</h3>
          <p>Guidance on the question in front of you, and the space you live in.</p>
        </article>
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
    .home-wrap { max-width: 960px; margin: 0 auto; padding: 0 1rem; }
    .hero { text-align: center; padding: 3.5rem 0 2.5rem; }
    .hero-logo { width: 92px; height: 92px; border-radius: 50%; margin-bottom: 1rem; }
    .hero-title { font-size: 2.6rem; margin: 0 0 .35rem; font-weight: 400; }
    .hero-title strong { font-weight: 800; }
    .hero-title span { color: #4f46e5; font-style: italic; }
    .hero-tag { font-size: 1.15rem; font-weight: 600; margin: 0 0 .25rem; }
    .hero-sub { color: #6b7280; margin: 0 0 1.75rem; }
    .hero-cta { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
    .hero-note { color: #6b7280; font-size: .85rem; margin-top: .9rem; }
    .btn { display: inline-block; padding: .8rem 1.9rem; border-radius: 9px;
           font-weight: 700; text-decoration: none; font-size: .98rem; }
    .btn-primary { background: #4338ca; color: #fff; }
    .btn-ghost { background: transparent; color: #4338ca; border: 1.5px solid #c7d2fe; }
    .btn-wide { margin-top: 1.5rem; }
    .feats { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
             gap: 1rem; padding: 1rem 0 2.5rem; }
    .feat { border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.15rem; }
    .feat h3 { margin: 0 0 .4rem; font-size: 1.02rem; color: #4338ca; }
    .feat p { margin: 0; color: #4b5563; font-size: .9rem; line-height: 1.5; }
    .how { text-align: center; padding: 0 0 3rem; }
    .how h2 { font-size: 1.5rem; margin: 0 0 1.25rem; }
    .how ol { list-style: none; padding: 0; margin: 0; display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .how li { display: flex; align-items: center; gap: .65rem; justify-content: center;
              color: #374151; font-size: .95rem; }
    .how li span { background: #4338ca; color: #fff; width: 26px; height: 26px;
                   border-radius: 50%; display: grid; place-items: center;
                   font-size: .8rem; font-weight: 700; flex: none; }
    @media (max-width: 560px) { .hero-title { font-size: 2rem; } }
  `],
})
export class HomePage {}
