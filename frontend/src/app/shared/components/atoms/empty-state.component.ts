import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="text-center py-16">
      <div class="text-4xl mb-3">{{ emoji() }}</div>
      <p class="text-[13px] text-gray-500">{{ title() }}</p>
      @if (subtitle()) {
        <p class="text-[11px] text-gray-400 mt-1">{{ subtitle() }}</p>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  emoji = input.required<string>();
  title = input.required<string>();
  subtitle = input<string>('');
}
