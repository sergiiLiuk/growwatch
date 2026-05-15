import { Component, input } from '@angular/core';

export type BadgeVariant = 'green' | 'amber' | 'red' | 'gray';

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="text-[11px] font-medium px-2.5 py-1 rounded-full"
          [class]="variantClass()">
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  label = input.required<string>();
  variant = input<BadgeVariant>('gray');

  variantClass() {
    switch (this.variant()) {
      case 'green': return 'bg-gw-green-light text-gw-green-dark';
      case 'amber': return 'bg-gw-amber-light text-gw-amber-dark';
      case 'red':   return 'bg-gw-red-light text-gw-red-dark';
      default:      return 'bg-gray-100 text-gray-400';
    }
  }
}
