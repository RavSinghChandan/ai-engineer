import {
  Component, inject, signal, input, output,
  ElementRef, HostListener, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeocodeService, GeoSearchItem } from '../../services/geocode.service';

export interface CitySelection {
  display_name: string;
  city:         string;
  country:      string;
  lat:          number;
  lon:          number;
  timezone:     string;
}

@Component({
  selector: 'app-city-autocomplete',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="city-ac-wrap" [class.ac-open]="showDropdown()">

      <!-- Input -->
      <div class="inp-wrap"
           [class.inp-err]="showError()"
           [class.inp-ok]="selected() && !showError()">
        <svg class="inp-ico" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5s4.5-4.75 4.5-8.5c0-2.485-2.015-4.5-4.5-4.5Z"
                stroke="currentColor" stroke-width="1.2"/>
          <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.2"/>
        </svg>

        <input #inputEl
               class="inp inp-icon"
               type="text"
               autocomplete="off"
               [placeholder]="placeholder()"
               [value]="inputValue()"
               (input)="onInput($any($event.target).value)"
               (focus)="onFocus()"
               (blur)="onBlur()"
               (keydown)="onKeydown($event)" />

        @if (loading()) {
          <span class="ac-spinner"></span>
        } @else if (selected()) {
          <span class="inp-check">✓</span>
        }
      </div>

      <!-- Dropdown -->
      @if (showDropdown() && suggestions().length) {
        <ul class="ac-dropdown" role="listbox">
          @for (item of suggestions(); track item.display_name; let i = $index) {
            <li class="ac-item"
                [class.ac-item-active]="i === activeIdx()"
                role="option"
                (mousedown)="selectItem(item)">
              <span class="ac-city">{{ item.city }}</span>
              <span class="ac-meta">
                @if (item.country) { {{ item.country }} · }
                {{ item.lat.toFixed(2) }}°&nbsp;{{ item.lon.toFixed(2) }}°
              </span>
            </li>
          }
        </ul>
      }

      @if (showDropdown() && !suggestions().length && inputValue().length >= 2 && !loading()) {
        <div class="ac-no-results">No cities found — try a different spelling</div>
      }

      <!-- Geo badge shown after selection -->
      @if (selected()) {
        <span class="geo-badge">
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#10b981" stroke-width="1.4"/>
            <path d="M3.5 6l2 2L8.5 4" stroke="#10b981" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ selected()!.display_name | slice:0:52 }}
          · {{ selected()!.lat.toFixed(2) }}°N {{ selected()!.lon.toFixed(2) }}°E
        </span>
      }
    </div>
  `,
  styles: [`
    .city-ac-wrap { position: relative; }

    .ac-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0; right: 0;
      background: var(--surface, #1e1e2e);
      border: 1px solid var(--border, rgba(255,255,255,.12));
      border-radius: 10px;
      list-style: none;
      margin: 0; padding: 4px 0;
      z-index: 9999;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
      max-height: 260px;
      overflow-y: auto;
    }

    .ac-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 9px 14px;
      cursor: pointer;
      transition: background .12s;
    }
    .ac-item:hover, .ac-item-active {
      background: rgba(139,92,246,.15);
    }
    .ac-city {
      font-size: .86rem;
      font-weight: 500;
      color: var(--text-primary, #e2e8f0);
      white-space: nowrap;
    }
    .ac-meta {
      font-size: .74rem;
      color: var(--text-muted, #94a3b8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ac-no-results {
      padding: 10px 14px;
      font-size: .8rem;
      color: var(--text-muted, #94a3b8);
    }

    .ac-spinner {
      width: 14px; height: 14px;
      border: 2px solid rgba(139,92,246,.3);
      border-top-color: #8b5cf6;
      border-radius: 50%;
      animation: ac-spin .7s linear infinite;
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
    }
    @keyframes ac-spin { to { transform: translateY(-50%) rotate(360deg); } }

    .geo-badge {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: .72rem;
      color: #10b981;
      margin-top: 5px;
      padding: 0 2px;
    }
  `],
})
export class CityAutocompleteComponent implements OnDestroy {
  private geoSvc = inject(GeocodeService);
  private elRef  = inject(ElementRef);

  placeholder = input<string>('Type city name…');
  showError   = input<boolean>(false);

  citySelected = output<CitySelection | null>();
  valueChange  = output<string>();

  inputValue  = signal('');
  suggestions = signal<GeoSearchItem[]>([]);
  loading     = signal(false);
  showDropdown = signal(false);
  activeIdx   = signal(-1);
  selected    = signal<CitySelection | null>(null);

  private _timer: ReturnType<typeof setTimeout> | null = null;

  onInput(val: string) {
    this.inputValue.set(val);
    this.selected.set(null);
    this.activeIdx.set(-1);
    this.citySelected.emit(null);
    this.valueChange.emit(val);

    if (this._timer) clearTimeout(this._timer);
    if (!val || val.trim().length < 2) {
      this.suggestions.set([]);
      this.showDropdown.set(false);
      return;
    }
    this._timer = setTimeout(() => this._fetchSuggestions(val), 350);
  }

  private async _fetchSuggestions(q: string) {
    this.loading.set(true);
    this.showDropdown.set(true);
    const results = await this.geoSvc.search(q);
    this.loading.set(false);
    this.suggestions.set(results);
  }

  onFocus() {
    if (this.suggestions().length) this.showDropdown.set(true);
  }

  onBlur() {
    // Small delay so mousedown on dropdown fires first
    setTimeout(() => this.showDropdown.set(false), 180);
  }

  onKeydown(e: KeyboardEvent) {
    const items = this.suggestions();
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIdx.update(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIdx.update(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && this.activeIdx() >= 0) {
      e.preventDefault();
      this.selectItem(items[this.activeIdx()]);
    } else if (e.key === 'Escape') {
      this.showDropdown.set(false);
    }
  }

  selectItem(item: GeoSearchItem) {
    const sel: CitySelection = {
      display_name: item.display_name,
      city:         item.city,
      country:      item.country,
      lat:          item.lat,
      lon:          item.lon,
      timezone:     item.timezone,
    };
    this.inputValue.set(item.display_name);
    this.selected.set(sel);
    this.showDropdown.set(false);
    this.suggestions.set([]);
    this.activeIdx.set(-1);
    this.citySelected.emit(sel);
    this.valueChange.emit(item.display_name);
  }

  // Close dropdown when clicking outside
  @HostListener('document:mousedown', ['$event'])
  onDocClick(e: MouseEvent) {
    if (!this.elRef.nativeElement.contains(e.target)) {
      this.showDropdown.set(false);
    }
  }

  ngOnDestroy() {
    if (this._timer) clearTimeout(this._timer);
  }
}
