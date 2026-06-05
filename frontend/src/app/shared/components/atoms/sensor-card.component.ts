import { Component, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SparklineComponent } from './sparkline.component';

type Tone = 'green' | 'blue' | 'purple' | 'orange';

const TONE_COLORS: Record<Tone, string> = {
  green:  '#16a34a',
  blue:   '#2563eb',
  purple: '#8b5cf6',
  orange: '#f97316',
};

const TONE_TEXT: Record<Tone, string> = {
  green:  'text-emerald-600',
  blue:   'text-blue-600',
  purple: 'text-violet-600',
  orange: 'text-orange-500',
};

@Component({
  selector: 'app-sensor-card',
  imports: [RouterLink, SparklineComponent],
  template: `
    <div class="rounded-2xl p-4 border border-gw-border bg-white transition-all h-full flex flex-col gw-card-shadow"
         [class.cursor-pointer]="!!link()"
         [class.hover:border-gray-200]="!!link()"
         [routerLink]="link() ?? null">

      <!-- Label -->
      <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{{ label() }}</span>

      <!-- Value -->
      @if (status() !== 'missing') {
        <div class="mt-1 text-[22px] font-bold text-gray-900 leading-none tabular-nums">
          {{ value() }}<span class="text-[12px] font-medium text-gray-400 ml-0.5">{{ unit() }}</span>
        </div>
      } @else {
        <div class="mt-1 text-[22px] font-bold text-gray-300 leading-none">—</div>
      }

      <!-- Sparkline -->
      <div class="mt-3 -mx-1">
        <app-sparkline [values]="sparkValues()" [status]="status()" [height]="34" [color]="sparkColor()" />
      </div>

      <!-- Status label (replaces range labels) -->
      @if (statusLabel()) {
        <span class="mt-1 text-[11px] font-medium" [class]="statusTextClass()">{{ statusLabel() }}</span>
      } @else if (rangeMin() && rangeMax()) {
        <div class="mt-1 flex justify-between">
          <span class="text-[9px] text-gray-300">{{ rangeMin() }}</span>
          <span class="text-[9px] text-gray-300">{{ rangeMax() }}</span>
        </div>
      }
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
  tone = input<Tone>('green');
  /** Optional colored label under the sparkline ("Optimal", "Needs attention" …). When set, replaces range labels. */
  statusLabel = input<string>('');

  sparkColor = computed(() => {
    if (this.status() === 'missing') return '#e5e7eb';
    if (this.status() === 'warn') return TONE_COLORS.orange;
    return TONE_COLORS[this.tone()];
  });

  statusTextClass = computed(() => {
    if (this.status() === 'warn') return TONE_TEXT.orange;
    if (this.status() === 'missing') return 'text-gray-400';
    return TONE_TEXT[this.tone()];
  });
}
