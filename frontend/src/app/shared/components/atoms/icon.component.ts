import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Central SVG icon registry. Use as <app-icon name="..." class="w-4 h-4 text-gray-400" />.
 *
 * Size is controlled by Tailwind w-/h- utilities on the host element; color is
 * inherited via `currentColor` from the host's text-* class. Default stroke
 * width is 1.5 to match the project's existing icon style. To override:
 *   <app-icon name="..." strokeWidth="2" />
 *
 * Adding a new icon: extend the IconName union and add a @case here. Keep
 * viewBox at 0 0 24 24 unless the source uses a different one (override via
 * viewBox input).
 */
export type IconName =
  // Brand
  | 'logo' | 'leaf'
  // Nav
  | 'home' | 'plants' | 'digest' | 'alerts' | 'settings' | 'logout' | 'admin'
  // Chevrons
  | 'chevron-right' | 'chevron-left' | 'chevron-down' | 'chevron-up'
  // Actions
  | 'pencil' | 'pencil-square' | 'trash' | 'trash-simple' | 'plus' | 'check' | 'dots-vertical'
  // Toggles / states
  | 'eye' | 'eye-off' | 'pause' | 'play' | 'clock' | 'alert-triangle'
  // Domain
  | 'wifi' | 'device' | 'refresh' | 'thermometer'
  // Search / filter
  | 'search' | 'sliders';

@Component({
  selector: 'app-icon',
  template: `
    <svg [attr.viewBox]="viewBox()"
         fill="none"
         stroke="currentColor"
         [attr.stroke-width]="strokeWidth()"
         stroke-linecap="round"
         stroke-linejoin="round"
         class="w-full h-full">
      @switch (name()) {
        @case ('logo') {
          <path d="M12 3c0 0-6 4-6 9a6 6 0 0 0 12 0c0-5-6-9-6-9z"/>
          <line x1="12" y1="12" x2="12" y2="21"/>
        }
        @case ('leaf') {
          <path d="M12 22V13"/>
          <path d="M12 13C12 13 7 10 7 6a5 5 0 0 1 10 0c0 4-5 7-5 7z"/>
        }
        @case ('home') {
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        }
        @case ('plants') {
          <path d="M12 3c0 0-6 4-6 9a6 6 0 0012 0c0-5-6-9-6-9z"/>
          <line x1="12" y1="12" x2="12" y2="21"/>
        }
        @case ('digest') {
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        }
        @case ('alerts') {
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        }
        @case ('settings') {
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        }
        @case ('logout') {
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        }
        @case ('admin') {
          <path d="M20 21v-2a4 4 0 00-3-3.87"/>
          <path d="M4 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
          <circle cx="10" cy="7" r="4"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        }
        @case ('chevron-right')  { <polyline points="9 18 15 12 9 6"/> }
        @case ('chevron-left')   { <polyline points="15 18 9 12 15 6"/> }
        @case ('chevron-down')   { <polyline points="6 9 12 15 18 9"/> }
        @case ('chevron-up')     { <polyline points="18 15 12 9 6 15"/> }
        @case ('pencil') {
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        }
        @case ('pencil-square') {
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        }
        @case ('trash') {
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/>
          <path d="M14 11v6"/>
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
        }
        @case ('trash-simple') {
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        }
        @case ('plus') {
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        }
        @case ('check') {
          <polyline points="20 6 9 17 4 12"/>
        }
        @case ('dots-vertical') {
          <circle cx="12" cy="6" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="12" cy="18" r="1.5"/>
        }
        @case ('eye') {
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        }
        @case ('eye-off') {
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        }
        @case ('pause') {
          <rect x="5" y="3" width="14" height="18" rx="2"/>
          <path d="M10 9v6"/>
          <path d="M14 9v6"/>
        }
        @case ('play') {
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        }
        @case ('alert-triangle') {
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        }
        @case ('wifi') {
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
          <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <circle cx="12" cy="20" r="1" fill="currentColor"/>
        }
        @case ('device') {
          <rect x="4" y="4" width="16" height="16" rx="3"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
        }
        @case ('refresh') {
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        }
        @case ('thermometer') {
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4 4 0 1 0 5 0z"/>
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        }
        @case ('sliders') {
          <line x1="4" y1="21" x2="4" y2="14"/>
          <line x1="4" y1="10" x2="4" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12" y2="3"/>
          <line x1="20" y1="21" x2="20" y2="16"/>
          <line x1="20" y1="12" x2="20" y2="3"/>
          <line x1="1" y1="14" x2="7" y2="14"/>
          <line x1="9" y1="8" x2="15" y2="8"/>
          <line x1="17" y1="16" x2="23" y2="16"/>
        }
      }
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  name = input.required<IconName>();
  viewBox = input<string>('0 0 24 24');
  strokeWidth = input<number | string>(1.5);
}
