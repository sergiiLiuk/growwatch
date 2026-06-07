import { Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  template: `
    <div class="text-center py-16">
      @if (icon()) {
        <div class="w-14 h-14 rounded-2xl bg-gw-green-light/60 flex items-center justify-center mx-auto mb-4">
          <app-icon [name]="icon()!" class="w-7 h-7 text-gw-green-dark" strokeWidth="1.6" />
        </div>
      } @else if (emoji()) {
        <div class="text-4xl mb-3">{{ emoji() }}</div>
      }
      <p class="text-[13px] text-gray-500">{{ title() }}</p>
      @if (subtitle()) {
        <p class="text-[11px] text-gray-400 mt-1">{{ subtitle() }}</p>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  emoji = input<string>('');
  icon = input<IconName | null>(null);
  title = input.required<string>();
  subtitle = input<string>('');
}
