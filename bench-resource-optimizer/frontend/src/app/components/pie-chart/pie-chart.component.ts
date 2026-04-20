import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="donut-wrap">
      <svg viewBox="0 0 120 120" [attr.width]="size" [attr.height]="size">
        <!-- Track ring -->
        <circle cx="60" cy="60" r="50"
                fill="none"
                stroke="#e2e8f0"
                stroke-width="14"/>

        <!-- Completed ring -->
        <circle cx="60" cy="60" r="50"
                fill="none"
                [attr.stroke]="ringColor"
                stroke-width="14"
                stroke-linecap="round"
                [attr.stroke-dasharray]="circumference"
                [attr.stroke-dashoffset]="dashOffset"
                transform="rotate(-90 60 60)"
                style="transition: stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1), stroke 0.4s ease"/>

        <!-- Remaining micro-ticks (purely decorative) -->
        <circle cx="60" cy="60" r="50"
                fill="none"
                stroke="#f1f5f9"
                stroke-width="1"
                stroke-dasharray="2 6"
                transform="rotate(-90 60 60)"/>

        <!-- Center: percentage -->
        <text x="60" y="53"
              text-anchor="middle"
              font-size="24"
              font-weight="800"
              [attr.fill]="ringColor">{{ score }}%</text>

        <!-- Center: label -->
        <text x="60" y="70"
              text-anchor="middle"
              font-size="10"
              font-weight="500"
              fill="#64748b">{{ label }}</text>
      </svg>

      <!-- Legend pill -->
      <div class="legend">
        <span class="legend-dot" [style.background]="ringColor"></span>
        <span class="legend-text">{{ completedCount }} / {{ totalCount }} tasks</span>
      </div>
    </div>
  `,
  styles: [`
    .donut-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #64748b;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `],
})
export class PieChartComponent implements OnChanges {
  @Input() score = 0;
  @Input() completedCount = 0;
  @Input() totalCount = 0;
  @Input() label = 'Readiness';
  @Input() size = 160;

  readonly RADIUS = 50;
  readonly circumference = +(2 * Math.PI * this.RADIUS).toFixed(2); // 314.16

  dashOffset = this.circumference;

  ngOnChanges() {
    this.dashOffset = +(
      this.circumference - (this.score / 100) * this.circumference
    ).toFixed(2);
  }

  get ringColor(): string {
    if (this.score >= 85) return '#22c55e';
    if (this.score >= 50) return '#f59e0b';
    if (this.score > 0)  return '#3b82f6';
    return '#94a3b8';
  }
}
