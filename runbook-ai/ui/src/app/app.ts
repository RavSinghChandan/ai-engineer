import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './components/nav/nav.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavComponent],
  template: `
    <app-nav />
    <main><router-outlet /></main>
  `,
  styles: [`main { min-height: calc(100vh - 60px); }`],
})
export class App {}
