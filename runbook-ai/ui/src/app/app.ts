import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './components/nav/nav.component';
import { RunbookAgentComponent } from './components/runbook-agent/runbook-agent.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavComponent, RunbookAgentComponent],
  template: `
    <app-nav />
    <main><router-outlet /></main>
    <app-runbook-agent />
  `,
  styles: [`main { min-height: calc(100vh - 60px); }`],
})
export class App {}
