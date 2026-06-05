import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-sparkline',
  template: `
    <svg [attr.viewBox]="'0 0 100 ' + height()" preserveAspectRatio="none"
         class="w-full block" [style.height.px]="height()">
      <defs>
        <linearGradient [attr.id]="gradientId()" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" [attr.stop-color]="strokeColor()" stop-opacity="0.22" />
          <stop offset="100%" [attr.stop-color]="strokeColor()" stop-opacity="0" />
        </linearGradient>
      </defs>
      @if (values().length >= 2) {
        <path [attr.d]="areaPath()" [attr.fill]="'url(#' + gradientId() + ')'" stroke="none" />
      }
      <polyline [attr.points]="points()" fill="none" [attr.stroke]="strokeColor()"
                stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                vector-effect="non-scaling-stroke" />
    </svg>
  `,
})
export class SparklineComponent {
  values = input<number[]>([]);
  status = input<'ok' | 'warn' | 'missing'>('ok');
  height = input<number>(36);
  /** Optional per-metric color. Overrides the status-based default. */
  color = input<string | null>(null);

  strokeColor = computed(() => {
    if (this.values().length < 2) return '#e5e7eb';
    if (this.color()) return this.color()!;
    if (this.status() === 'missing') return '#e5e7eb';
    return this.status() === 'warn' ? '#ea580c' : '#16a34a';
  });

  // Stable id per instance to avoid SVG gradient bleed when multiple sparklines render
  private static seq = 0;
  private id = ++SparklineComponent.seq;
  gradientId = computed(() => `spark-grad-${this.id}`);

  private scaled = computed(() => {
    const vals = this.values();
    const h = this.height();
    if (vals.length < 2) return [] as Array<{ x: number; y: number }>;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max === min ? 1 : max - min;
    const padding = h * 0.15;
    const innerH = h - padding * 2;
    return vals.map((v, i) => ({
      x: (i / (vals.length - 1)) * 100,
      y: padding + innerH - ((v - min) / range) * innerH,
    }));
  });

  points = computed(() => {
    const pts = this.scaled();
    if (pts.length === 0) return `0,${this.height() / 2} 100,${this.height() / 2}`;
    return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  });

  areaPath = computed(() => {
    const pts = this.scaled();
    if (pts.length === 0) return '';
    const h = this.height();
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return `${line} L100,${h} L0,${h} Z`;
  });
}
