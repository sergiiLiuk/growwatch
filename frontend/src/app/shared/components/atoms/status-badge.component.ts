import { Component, input } from '@angular/core';

export type BadgeVariant = 'green' | 'amber' | 'red' | 'gray';

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
          [class]="variantClass()">
      @if (dot()) {
        <span class="relative flex shrink-0 w-1.5 h-1.5">
          @if (pulse()) {
            <span class="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" [class]="dotClass()"></span>
          }
          <span class="relative inline-flex w-1.5 h-1.5 rounded-full" [class]="dotClass()"></span>
        </span>
      }
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  label = input.required<string>();
  variant = input<BadgeVariant>('gray');
  /** Show a coloured dot before the label. */
  dot = input<boolean>(false);
  /** Pulse the dot (use for live/online states). */
  pulse = input<boolean>(false);

  variantClass() {
    switch (this.variant()) {
      case 'green': return 'bg-gw-green-light text-gw-green-dark';
      case 'amber': return 'bg-gw-amber-light text-gw-amber-dark';
      case 'red':   return 'bg-gw-red-light text-gw-red-dark';
      default:      return 'bg-gray-100 text-gray-400';
    }
  }

  dotClass() {
    switch (this.variant()) {
      case 'green': return 'bg-gw-green';
      case 'amber': return 'bg-gw-amber';
      case 'red':   return 'bg-gw-red';
      default:      return 'bg-gray-400';
    }
  }
}
