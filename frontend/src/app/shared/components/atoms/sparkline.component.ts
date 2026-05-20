import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-sparkline',
  template: `
    <svg [attr.viewBox]="'0 0 100 ' + height()" preserveAspectRatio="none"
         class="w-full block" [style.height.px]="height()">
      <polyline [attr.points]="points()" fill="none" [attr.stroke]="strokeColor()"
                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                vector-effect="non-scaling-stroke" />
    </svg>
  `,
})
export class SparklineComponent {
  values = input<number[]>([]);
  status = input<'ok' | 'warn' | 'missing'>('ok');
  height = input<number>(36);

  strokeColor = computed(() => {
    if (this.status() === 'missing' || this.values().length < 2) return '#e5e7eb';
    return this.status() === 'warn' ? '#d97706' : '#9ca3af';
  });

  points = computed(() => {
    const vals = this.values();
    const h = this.height();
    if (vals.length < 2) return `0,${h / 2} 100,${h / 2}`;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max === min ? 1 : max - min;
    const padding = h * 0.1;
    const innerH = h - padding * 2;

    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * 100;
        const y = padding + innerH - ((v - min) / range) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });
}
