import { Component, input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  template: `
    <div class="bg-gray-100 rounded-full overflow-hidden"
         [class]="size() === 'md' ? 'h-1.5' : 'h-0.5'">
      <div class="h-full rounded-full transition-all duration-500"
           [class]="status() === 'warn' ? 'bg-gw-amber' : 'bg-gw-green'"
           [style.width.%]="percent()">
      </div>
    </div>
  `,
})
export class ProgressBarComponent {
  percent = input.required<number>();
  status = input<'ok' | 'warn'>('ok');
  size = input<'sm' | 'md'>('sm');
}
