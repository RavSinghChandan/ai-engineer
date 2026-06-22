import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './components/nav/nav.component';
import { FooterComponent } from './components/footer/footer.component';
import { RunbookAgentComponent } from './components/runbook-agent/runbook-agent.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavComponent, FooterComponent, RunbookAgentComponent],
  template: `
    <app-nav />
    <main><router-outlet /></main>
    <app-footer />
    <app-runbook-agent />
  `,
  styles: [`:host { display: flex; flex-direction: column; min-height: 100vh; } main { flex: 1; min-height: calc(100vh - 56px); }`],
})
export class App {}
