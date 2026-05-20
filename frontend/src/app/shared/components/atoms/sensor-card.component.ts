import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SparklineComponent } from './sparkline.component';


@Component({
  selector: 'app-sensor-card',
  imports: [RouterLink, SparklineComponent],
  template: `
    <div class="rounded-2xl p-3 border transition-all h-full flex flex-col"
         [class]="cardClass()"
         [routerLink]="link() ?? null">
      <!-- Label row -->
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{{ label() }}</span>
        <span class="w-1.5 h-1.5 rounded-full shrink-0" [class]="dotClass()"></span>
      </div>
      <!-- Value -->
      @if (status() !== 'missing') {
        <div class="font-data text-[20px] font-medium text-gray-800 leading-none tabular-nums mb-3">
          {{ value() }}<span class="text-[11px] text-gray-400 ml-0.5">{{ unit() }}</span>
        </div>
      } @else {
        <div class="font-data text-[20px] text-gray-300 leading-none mb-3">—</div>
      }
      <!-- Sparkline -->
      <div class="mt-auto">
        <app-sparkline [values]="sparkValues()" [status]="status()" [height]="32" />
        <!-- Range labels -->
        @if (rangeMin() && rangeMax()) {
          <div class="flex justify-between mt-1">
            <span class="text-[9px] text-gray-300">{{ rangeMin() }}</span>
            <span class="text-[9px] text-gray-300">{{ rangeMax() }}</span>
          </div>
        }
      </div>
    </div>
  `,
  host: { '[class]': '"block"' },
})
export class SensorCardComponent {
  label = input.required<string>();
  value = input<string>('—');
  unit = input<string>('');
  status = input<'ok' | 'warn' | 'missing'>('missing');
  sparkValues = input<number[]>([]);
  rangeMin = input<string>('');
  rangeMax = input<string>('');
  link = input<string | null>(null);

  cardClass() {
    const warn = this.status() === 'warn';
    const base = warn ? 'bg-gw-amber-light border-gw-amber' : 'bg-gw-surface border-gw-border';
    const cursor = this.link() ? ' cursor-pointer hover:border-gray-300' : '';
    return base + cursor;
  }

  dotClass() {
    if (this.status() === 'ok') return 'bg-gw-green';
    if (this.status() === 'warn') return 'bg-gw-amber';
    return 'bg-gray-300';
  }
}
