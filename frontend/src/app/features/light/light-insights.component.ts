import { Component, OnDestroy, signal, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SensorService, SensorData, HourlySensorData, PLANT_LIGHT_RANGES } from '../../core/services/sensor.service';
import { PlantService } from '../../core/services/plant.service';
import { WeatherService } from '../../core/services/weather.service';
import { PageContainerComponent } from '../../shared/components/page-container/page-container.component';
import { StatusBadgeComponent, BadgeVariant } from '../../shared/components/atoms/status-badge.component';
import { ProgressBarComponent } from '../../shared/components/atoms/progress-bar.component';
import { isNight, isDawnOrDusk, isOffPeak } from '../../core/utils/time';

interface DayBar {
  dateStr: string;
  label: string;
  dateLabel: string;
  totalLuxHours: number;
  hasData: boolean;
  isToday: boolean;
  isFuture: boolean;
  barHeight: number;
  barClass: string;
  tooltip: string;
}

@Component({
  selector: 'app-light-insights',
  imports: [PageContainerComponent, StatusBadgeComponent, ProgressBarComponent],
  template: `
    <app-page-container>

      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ Home
      </button>

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">Light insights</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">Live reading and daily history</p>
      </div>

      <!-- Live reading -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Live reading</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
          @if (latestData()) {
            <div class="flex items-start justify-between mb-3">
              <div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-[32px] font-semibold text-gray-900 leading-none tabular-nums">
                    {{ Math.round(latestData()!.lightLevel).toLocaleString() }}
                  </span>
                  <span class="text-[14px] text-gray-400">lux</span>
                </div>
                <div class="text-[12px] text-gray-400 mt-1.5">{{ readingSubLabel() }}</div>
              </div>
              @if (!isOffPeak() || latestData()!.lightStatus.status !== 'TOO_LOW') {
                <app-status-badge [label]="displayBadgeLabel()" [variant]="displayBadgeVariant()"
                                  class="mt-1 shrink-0" />
              }
            </div>
            <div class="mb-2">
              <app-progress-bar [percent]="isOffPeak() && latestData()!.lightStatus.status === 'TOO_LOW' ? 25 : Math.min(latestData()!.lightStatus.percentageOfOptimal, 100)"
                                [status]="displayBadgeVariant() === 'amber' || displayBadgeVariant() === 'red' ? 'warn' : 'ok'"
                                size="md" />
            </div>
            <div class="text-[11px] text-gray-400">Updated {{ lastSeenLabel() }}</div>
          } @else {
            <div class="flex items-center gap-3 py-2">
              <div class="w-2 h-2 rounded-full bg-gray-300 shrink-0 animate-pulse"></div>
              <span class="text-[13px] text-gray-400">Waiting for sensor data…</span>
            </div>
          }
        </div>
      </div>

      <!-- Today's total -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Today</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
          @if (todayTotal(); as t) {
            <div class="flex items-baseline gap-1.5 mb-1">
              <span class="text-[28px] font-semibold text-gray-900 leading-none tabular-nums">
                {{ t.valueStr }}
              </span>
              <span class="text-[13px] text-gray-400">{{ t.unit }}</span>
            </div>
            <div class="text-[12px] text-gray-400">
              {{ t.hourCount }} {{ t.hourCount === 1 ? 'hour' : 'hours' }} logged · {{ t.readingCount }} readings
            </div>
          } @else {
            <p class="text-[13px] text-gray-400 py-1">No hourly data yet for today.</p>
            <p class="text-[11px] text-gray-300 mt-0.5">Hourly snapshots are saved at the start of each hour.</p>
          }
        </div>
      </div>

      <!-- Week history chart -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Week history</div>
          <div class="flex items-center gap-1">
            <button (click)="prevWeek()"
                    [disabled]="weekOffset() <= -12"
                    class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[18px] leading-none">
              ‹
            </button>
            <span class="text-[12px] text-gray-600 min-w-[116px] text-center select-none">{{ weekLabel() }}</span>
            <button (click)="nextWeek()"
                    [disabled]="weekOffset() >= 0"
                    class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[18px] leading-none">
              ›
            </button>
          </div>
        </div>

        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
          @if (loading()) {
            <!-- Skeleton -->
            <div class="flex items-end gap-2" style="height: 96px">
              @for (h of skeletonHeights; track $index) {
                <div class="flex-1 rounded-t-lg bg-gray-100 animate-pulse" [style.height.px]="h"></div>
              }
            </div>
            <div class="flex gap-2 mt-2.5">
              @for (l of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; track l) {
                <div class="flex-1 text-center text-[10px] text-gray-300">{{ l }}</div>
              }
            </div>
          } @else if (hasWeekData()) {
            <!-- Y-axis + bars -->
            <div class="flex">
              <!-- Y-axis labels -->
              <div class="relative shrink-0 pr-1" style="width: 32px; height: 96px">
                <span class="absolute top-0 right-0 text-[9px] text-gray-300 leading-none">{{ yAxisLabels().top }}</span>
                <span class="absolute top-1/2 right-0 -translate-y-1/2 text-[9px] text-gray-300 leading-none">{{ yAxisLabels().mid }}</span>
                <span class="absolute bottom-0 right-0 text-[9px] text-gray-300 leading-none">0</span>
              </div>
              <!-- Chart area -->
              <div class="flex-1 relative" style="height: 96px">
                <!-- Grid lines -->
                <div class="absolute inset-x-0 top-0 border-t border-gray-100"></div>
                <div class="absolute inset-x-0 top-1/2 border-t border-gray-100"></div>
                <div class="absolute inset-x-0 bottom-0 border-t border-gray-100"></div>
                <!-- Optimal reference lines (one per monitored plant type) -->
                @for (line of thresholdLines(); track line.label) {
                  <div class="absolute inset-x-0 z-10 flex items-center" [style.bottom.px]="line.lineY">
                    <div class="flex-1 border-t border-dashed border-gw-green/70"></div>
                    <span class="text-[8px] text-gw-green-dark pl-1 leading-none shrink-0">{{ line.label }}</span>
                  </div>
                }
                <!-- Bars -->
                <div class="flex items-end gap-2 h-full">
                  @for (day of chartBars(); track day.dateStr) {
                    <div class="flex-1 flex flex-col-reverse h-full" [title]="day.tooltip">
                      <div class="w-full rounded-t-lg transition-all duration-500"
                           [class]="day.barClass"
                           [style.height.px]="day.barHeight">
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
            <!-- Labels -->
            <div class="flex mt-2.5">
              <div style="width: 32px" class="shrink-0"></div>
              <div class="flex-1 flex gap-2">
                @for (day of chartBars(); track day.dateStr) {
                  <div class="flex-1 text-center text-[10px]"
                       [class]="day.isToday ? 'text-gw-green-dark font-semibold' : 'text-gray-400'">
                    {{ day.label }}
                  </div>
                }
              </div>
            </div>
            <!-- Week total -->
            <div class="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span class="text-[11px] text-gray-400">Week total</span>
              <span class="text-[12px] font-medium text-gray-700">{{ weekTotalStr() }}</span>
            </div>
          } @else {
            <div class="py-10 text-center">
              <div class="text-3xl mb-3">☀️</div>
              <p class="text-[13px] text-gray-500 font-medium">No data for this week</p>
              <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                Hourly snapshots accumulate over time.<br>Check back after the sensor has been running.
              </p>
            </div>
          }
        </div>
      </div>

    </app-page-container>
  `,
})
export class LightInsightsComponent implements OnDestroy {
  private sensorService = inject(SensorService);
  private plantService = inject(PlantService);
  private weatherService = inject(WeatherService);
  private router = inject(Router);
  private weekSub?: Subscription;
  private liveSub?: Subscription;

  Math = Math;

  latestData = signal<SensorData | null>(null);
  todayHourlyData = signal<HourlySensorData[]>([]);
  weekHourlyData = signal<HourlySensorData[]>([]);
  weekOffset = signal(0);
  loading = signal(false);

  skeletonHeights = [32, 56, 40, 72, 88, 24, 16];

  todayTotal = computed(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const hours = this.todayHourlyData().filter(h => {
      const hd = new Date(h.hour);
      return hd >= todayStart && hd <= todayEnd;
    });
    if (hours.length === 0) return null;
    const luxHours = hours.reduce((sum, h) => sum + h.avgLight, 0);
    const readingCount = hours.reduce((sum, h) => sum + h.readingCount, 0);
    const { valueStr, unit } = this.formatLuxH(luxHours);
    return { valueStr, unit, hourCount: hours.length, readingCount };
  });

  lastSeenLabel = computed(() => {
    const d = this.latestData();
    if (!d) return '—';
    const secs = Math.floor((Date.now() - new Date(d.timestamp).getTime()) / 1000);
    if (secs < 10) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  });

  weekLabel = computed(() => {
    const { from, to } = this.weekBounds(this.weekOffset());
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(from)} – ${fmt(to)}`;
  });

  private rawDayData = computed(() => {
    const { from } = this.weekBounds(this.weekOffset());
    const hourly = this.weekHourlyData();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(from); day.setDate(from.getDate() + i);
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      const dayHours = hourly.filter(h => { const hd = new Date(h.hour); return hd >= dayStart && hd <= dayEnd; });
      return {
        day, dayStart,
        totalLuxHours: dayHours.reduce((s, h) => s + h.avgLight, 0),
        hasData: dayHours.length > 0,
        isToday: dayStart.getTime() === today.getTime(),
        isFuture: dayStart > today,
      };
    });
  });

  private weekMaxLuxH = computed(() => this.rawDayData().reduce((m, r) => Math.max(m, r.totalLuxHours), 0));

  optimalThresholds = computed(() => {
    const seen = new Set<number>();
    const result: { luxH: number; label: string }[] = [];
    for (const p of this.plantService.plants().filter(p => p.monitored)) {
      const range = PLANT_LIGHT_RANGES[p.type];
      if (!range) continue;
      const luxH = range.min * p.dailyLightHours;
      if (seen.has(luxH)) continue;
      seen.add(luxH);
      result.push({ luxH, label: `${range.label} min.` });
    }
    return result;
  });

  private effectiveChartMax = computed(() => {
    const maxThreshold = this.optimalThresholds().reduce((m, t) => Math.max(m, t.luxH), 0);
    return Math.max(this.weekMaxLuxH(), maxThreshold, 1);
  });

  yAxisLabels = computed(() => {
    const max = this.effectiveChartMax();
    return { top: this.formatYTick(max), mid: this.formatYTick(max / 2) };
  });

  thresholdLines = computed(() => {
    const eMax = this.effectiveChartMax();
    return this.optimalThresholds().map(t => ({
      ...t,
      lineY: Math.min(Math.round((t.luxH / eMax) * 96), 96),
    }));
  });

  chartBars = computed<DayBar[]>(() => {
    const MAX_PX = 96;
    const eMax = this.effectiveChartMax();
    return this.rawDayData().map(r => {
      const barHeight = r.hasData && eMax > 0 ? Math.max(4, Math.round((r.totalLuxHours / eMax) * MAX_PX)) : 0;
      const barClass = !r.hasData || r.isFuture ? 'bg-gray-100' : r.isToday ? 'bg-gw-green' : 'bg-gw-green/50';
      const { valueStr, unit } = this.formatLuxH(r.totalLuxHours);
      const tooltip = r.hasData && !r.isFuture
        ? `${r.day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}: ${valueStr} ${unit}`
        : r.isFuture ? 'Upcoming' : 'No data';
      return {
        dateStr: r.day.toISOString().split('T')[0],
        label: r.day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3),
        dateLabel: r.day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        totalLuxHours: r.totalLuxHours,
        hasData: r.hasData,
        isToday: r.isToday,
        isFuture: r.isFuture,
        barHeight,
        barClass,
        tooltip,
      };
    });
  });

  hasWeekData = computed(() => this.chartBars().some(d => d.hasData && !d.isFuture));

  weekTotalStr = computed(() => {
    const total = this.chartBars().reduce((s, d) => s + d.totalLuxHours, 0);
    const { valueStr, unit } = this.formatLuxH(total);
    return `${valueStr} ${unit}`;
  });

  constructor() {
    // Today's data — last 48 h is enough; todayTotal filters by date
    this.sensorService.getHourlyData(48).subscribe(d => this.todayHourlyData.set(d));

    // Live sensor
    this.sensorService.getLatestSensorData().subscribe(d => this.latestData.set(d));
    this.liveSub = this.sensorService.subscribeToSensorData().subscribe(d => { if (d) this.latestData.set(d); });

    // Reactive week fetch — re-runs when weekOffset changes.
    // Fetch enough hours to cover the selected week plus all weeks back to it.
    effect(() => {
      const offset = this.weekOffset();
      const hoursNeeded = (Math.abs(offset) + 1) * 7 * 24;

      this.weekSub?.unsubscribe();
      this.loading.set(true);
      this.weekHourlyData.set([]);

      this.weekSub = this.sensorService.getHourlyData(hoursNeeded).subscribe({
        next: data => { this.weekHourlyData.set(data); this.loading.set(false); },
        error: () => { this.weekHourlyData.set([]); this.loading.set(false); },
      });
    });
  }

  ngOnDestroy() {
    this.weekSub?.unsubscribe();
    this.liveSub?.unsubscribe();
  }

  back() { this.router.navigate(['/']); }
  prevWeek() { if (this.weekOffset() > -12) this.weekOffset.update(v => v - 1); }
  nextWeek() { if (this.weekOffset() < 0) this.weekOffset.update(v => v + 1); }

  private weekBounds(offset: number): { from: Date; to: Date } {
    const now = new Date();
    const dow = now.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysFromMonday);
    thisMonday.setHours(0, 0, 0, 0);

    const from = new Date(thisMonday);
    from.setDate(thisMonday.getDate() + offset * 7);

    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);

    return { from, to };
  }

  private formatLuxH(v: number): { valueStr: string; unit: string } {
    if (v === 0) return { valueStr: '—', unit: '' };
    if (v < 1000) return { valueStr: `${Math.round(v)}`, unit: 'lux·h' };
    return { valueStr: `${(v / 1000).toFixed(1)}`, unit: 'klux·h' };
  }

  private formatYTick(v: number): string {
    if (v === 0) return '0';
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return Math.round(v).toString();
  }

  private solar() { const w = this.weatherService.weather(); return { sr: w?.sunrise, ss: w?.sunset }; }

  isOffPeak(): boolean { const { sr, ss } = this.solar(); return isOffPeak(sr, ss); }

  readingSubLabel = computed(() => {
    const d = this.latestData();
    if (!d) return '';
    const { sr, ss } = this.solar();
    if (d.lightStatus.status === 'TOO_LOW' && isNight(sr, ss)) return 'Low light is expected at night';
    if (d.lightStatus.status === 'TOO_LOW' && isDawnOrDusk(sr, ss)) return 'Light is low for this time of day';
    return d.lightStatus.message;
  });

  displayBadgeLabel = computed(() => {
    const d = this.latestData();
    if (!d) return '';
    const s = d.lightStatus.status;
    const { sr, ss } = this.solar();
    if (s === 'TOO_LOW' && isNight(sr, ss)) return 'Night';
    if (s === 'TOO_LOW' && isDawnOrDusk(sr, ss)) return 'Low light';
    return this.statusLabel(s);
  });

  displayBadgeVariant = computed<BadgeVariant>(() => {
    const d = this.latestData();
    if (!d) return 'gray';
    const s = d.lightStatus.status;
    if (s === 'TOO_LOW' && this.isOffPeak()) return 'gray';
    if (s === 'OPTIMAL')  return 'green';
    if (s === 'TOO_LOW')  return 'amber';
    if (s === 'TOO_HIGH') return 'red';
    return 'gray';
  });

  displayBarClass = computed(() => {
    const d = this.latestData();
    if (!d) return 'bg-gray-300';
    const s = d.lightStatus.status;
    if (s === 'TOO_LOW' && this.isOffPeak()) return 'bg-gray-300';
    return this.statusBarClass(s);
  });

  statusLabel(status: string): string {
    if (status === 'OPTIMAL')  return 'Optimal';
    if (status === 'TOO_LOW')  return 'Too low';
    if (status === 'TOO_HIGH') return 'Too high';
    return status;
  }

  statusBadgeClass(status: string): string {
    if (status === 'OPTIMAL')  return 'bg-gw-green-light text-gw-green-dark';
    if (status === 'TOO_LOW')  return 'bg-gw-amber-light text-gw-amber-dark';
    if (status === 'TOO_HIGH') return 'bg-gw-red-light text-gw-red-dark';
    return 'bg-gray-100 text-gray-500';
  }

  statusBarClass(status: string): string {
    if (status === 'OPTIMAL')  return 'bg-gw-green';
    if (status === 'TOO_LOW')  return 'bg-gw-amber';
    if (status === 'TOO_HIGH') return 'bg-gw-red';
    return 'bg-gray-300';
  }
}
