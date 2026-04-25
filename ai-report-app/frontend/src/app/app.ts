import { Component } from '@angular/core';
import { ReportFormComponent } from './components/report-form/report-form.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReportFormComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
