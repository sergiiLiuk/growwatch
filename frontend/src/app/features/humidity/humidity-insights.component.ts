import { Component, OnDestroy, signal, computed, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SensorService, SensorData, HourlySensorData } from '../../core/services/sensor.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { TierService } from '../../core/services/tier.service';
import { PageContainerComponent } from '../../shared/components/page-container/page-container.component';
import { StatusBadgeComponent, BadgeVariant } from '../../shared/components/atoms/status-badge.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

const CHART_HEIGHT_PX = 96;
const Y_AXIS_MAX = 100;

interface DayBar {
  dateStr: string;
  label: string;
  dateLabel: string;
  hasData: boolean;
  isToday: boolean;
  isFuture: boolean;
  min: number | null;
  max: number | null;
  avg: number | null;
  barBottomPx: number;
  barHeightPx: number;
  avgY: number;
  barClass: string;
  tooltip: string;
}

interface OptimalLine {
  label: string;
  y: number;
}

@Component({
  selector: 'app-humidity-insights',
  imports: [PageContainerComponent, StatusBadgeComponent, RouterLink, TranslocoDirective],
  template: `
    <app-page-container>
      <ng-container *transloco="let t">

      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ {{ t('nav.home') }}
      </button>

      <div class="mb-3">
        <h1 class="text-[18px] font-medium text-gray-800">{{ t('insights.humidityTitle') }}</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">{{ t('insights.humiditySubtitle') }}</p>
      </div>

      <!-- Time-range segmented control. 30/90d gated by Plus/Pro. -->
      <div class="mb-5 flex gap-1 bg-gray-100 rounded-xl p-1">
        @for (r of rangeOptions; track r.value) {
          <button (click)="selectRange(r.value)"
                  [disabled]="r.value === '30d' && !tier.canSee30Days() || r.value === '90d' && !tier.canSee90Days()"
                  class="flex-1 text-[12px] font-medium py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  [class.bg-white]="range() === r.value"
                  [class.text-gw-green-dark]="range() === r.value"
                  [class.shadow-sm]="range() === r.value"
                  [class.text-gray-500]="range() !== r.value">
            {{ t('insights.range.' + r.value) }}
          </button>
        }
      </div>

      @if (range() === '30d' && !tier.canSee30Days() || range() === '90d' && !tier.canSee90Days()) {
        <a routerLink="/upgrade"
           class="mb-5 block bg-white border-[0.5px] border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-gw-green/60 hover:bg-gw-green-light/10 transition-colors">
          <div class="text-[13px] text-gray-700 font-medium">{{ t('insights.unlockTitle') }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ t('insights.unlockBody') }}</div>
        </a>
      }

      <!-- Live reading -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('insights.liveReading') }}</div>
        <div class="bg-white shadow-gw-sm rounded-xl p-4">
          @if (liveHumidity() != null) {
            <div class="flex items-start justify-between mb-3">
              <div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-[32px] font-semibold text-gray-900 leading-none tabular-nums">
                    {{ liveHumidity()!.toFixed(1) }}
                  </span>
                  <span class="text-[14px] text-gray-400">%</span>
                </div>
                <div class="text-[12px] text-gray-400 mt-1.5">{{ readingSubLabel() }}</div>
              </div>
              <app-status-badge [label]="badgeLabel()" [variant]="badgeVariant()"
                                class="mt-1 shrink-0" />
            </div>
            <div class="text-[11px] text-gray-400 mt-3">{{ t('insights.updated') }} {{ lastSeenLabel() }}</div>
          } @else {
            <div class="flex items-center gap-3 py-2">
              <div class="w-2 h-2 rounded-full bg-gray-300 shrink-0 animate-pulse"></div>
              <span class="text-[13px] text-gray-400">{{ t('insights.waitingForData') }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Today's range -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('insights.today') }}</div>
        <div class="bg-white shadow-gw-sm rounded-xl p-4">
          @if (todayStats(); as tt) {
            <div class="flex items-baseline gap-1.5 mb-1">
              <span class="text-[28px] font-semibold text-gray-900 leading-none tabular-nums">
                {{ tt.avg.toFixed(1) }}
              </span>
              <span class="text-[13px] text-gray-400">% avg</span>
            </div>
            <div class="text-[12px] text-gray-400">
              {{ t('settings.min') }} {{ tt.min.toFixed(1) }}% · {{ t('settings.max') }} {{ tt.max.toFixed(1) }}% ·
              {{ tt.hourCount === 1 ? t('insights.hourLogged', { n: tt.hourCount }) : t('insights.hoursLogged', { n: tt.hourCount }) }}
            </div>
          } @else {
            <p class="text-[13px] text-gray-400 py-1">{{ t('insights.noHourlyData') }}</p>
            <p class="text-[11px] text-gray-300 mt-0.5">{{ t('insights.hourlySnapshotsHint') }}</p>
          }
        </div>
      </div>

      <!-- Week history chart -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{{ t('insights.weekHistory') }}</div>
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

        <div class="bg-white shadow-gw-sm rounded-xl p-4">
          @if (loading()) {
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
            <div class="flex">
              <div class="relative shrink-0 pr-1" style="width: 32px; height: 96px">
                <span class="absolute top-0 right-0 text-[9px] text-gray-300 leading-none">{{ yAxisLabels().top }}%</span>
                <span class="absolute top-1/2 right-0 -translate-y-1/2 text-[9px] text-gray-300 leading-none">{{ yAxisLabels().mid }}%</span>
                <span class="absolute bottom-0 right-0 text-[9px] text-gray-300 leading-none">0%</span>
              </div>
              <div class="flex-1 relative" style="height: 96px">
                <div class="absolute inset-x-0 top-0 border-t border-gray-100"></div>
                <div class="absolute inset-x-0 top-1/2 border-t border-gray-100"></div>
                <div class="absolute inset-x-0 bottom-0 border-t border-gray-100"></div>
                @for (line of optimalLines(); track line.label) {
                  <div class="absolute inset-x-0 z-10 flex items-center" [style.bottom.px]="line.y">
                    <div class="flex-1 border-t border-dashed border-gw-green/70"></div>
                    <span class="text-[8px] text-gw-green-dark pl-1 leading-none shrink-0">{{ line.label }}</span>
                  </div>
                }
                <div class="absolute inset-0 flex gap-2">
                  @for (day of chartBars(); track day.dateStr) {
                    <div class="flex-1 relative" [title]="day.tooltip">
                      @if (day.hasData) {
                        <div class="absolute left-1/2 -translate-x-1/2 w-3 rounded-md transition-all duration-500"
                             [class]="day.barClass"
                             [style.bottom.px]="day.barBottomPx"
                             [style.height.px]="day.barHeightPx">
                        </div>
                        <div class="absolute left-1/2 -translate-x-1/2 bg-white rounded-full pointer-events-none"
                             style="width: 16px; height: 2px;"
                             [style.bottom.px]="day.avgY - 1">
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
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
            <div class="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-y-1">
              <span class="text-[11px] text-gray-400">{{ t('insights.weekAvg') }}</span>
              <span class="text-[12px] font-medium text-gray-700">{{ weekAvgStr() }}</span>
            </div>
            @if (weekExtremes(); as e) {
              <div class="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                <span>{{ t('insights.driest') }} {{ e.dryLabel }} · {{ e.dryStr }}</span>
                <span>{{ t('insights.wettest') }} {{ e.wetLabel }} · {{ e.wetStr }}</span>
              </div>
            }
          } @else {
            <div class="py-10 text-center">
              <div class="text-3xl mb-3">💧</div>
              <p class="text-[13px] text-gray-500 font-medium">{{ t('insights.noWeekData') }}</p>
              <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                {{ t('insights.noWeekDataHint') }}
              </p>
            </div>
          }
        </div>
      </div>

      </ng-container>
    </app-page-container>
  `,
})
export class HumidityInsightsComponent implements OnDestroy {
  private sensorService = inject(SensorService);
  private router = inject(Router);
  private userSettings = inject(UserSettingsService);
  private transloco = inject(TranslocoService);
  tier = inject(TierService);
  private localeKey = signal(this.transloco.getActiveLang());

  readonly rangeOptions: { value: '7d' | '30d' | '90d' }[] = [
    { value: '7d' }, { value: '30d' }, { value: '90d' },
  ];
  range = signal<'7d' | '30d' | '90d'>('7d');

  selectRange(v: '7d' | '30d' | '90d') {
    if (v === '30d' && !this.tier.canSee30Days()) return;
    if (v === '90d' && !this.tier.canSee90Days()) return;
    this.range.set(v);
  }
  private weekSub?: Subscription;
  private liveSub?: Subscription;
  private tickTimer?: ReturnType<typeof setInterval>;

  latestData = signal<SensorData | null>(null);
  todayHourlyData = signal<HourlySensorData[]>([]);
  weekHourlyData = signal<HourlySensorData[]>([]);
  weekOffset = signal(0);
  loading = signal(false);
  private tick = signal(0);

  skeletonHeights = [40, 56, 48, 72, 64, 36, 24];

  liveHumidity = computed(() => this.latestData()?.humidity ?? null);

  badgeVariant = computed<BadgeVariant>(() => {
    const h = this.liveHumidity();
    if (h == null) return 'gray';
    if (h < this.userSettings.effectiveHumidityMin() || h > this.userSettings.effectiveHumidityMax()) return 'amber';
    return 'green';
  });

  badgeLabel = computed(() => {
    this.localeKey();
    const h = this.liveHumidity();
    if (h == null) return '';
    if (h < this.userSettings.effectiveHumidityMin()) return this.transloco.translate('insights.tooDry');
    if (h > this.userSettings.effectiveHumidityMax()) return this.transloco.translate('insights.tooHumid');
    return this.transloco.translate('insights.optimal');
  });

  readingSubLabel = computed(() => {
    this.localeKey();
    const h = this.liveHumidity();
    if (h == null) return '';
    const min = this.userSettings.effectiveHumidityMin();
    const max = this.userSettings.effectiveHumidityMax();
    if (h < min) return this.transloco.translate('insights.belowHumidityFloor', { min });
    if (h > max) return this.transloco.translate('insights.aboveHumidityCeiling', { max });
    return this.transloco.translate('insights.withinHumidityRange', { min, max });
  });

  lastSeenLabel = computed(() => {
    this.tick(); this.localeKey();
    const d = this.latestData();
    if (!d) return '—';
    const secs = Math.floor((Date.now() - new Date(d.timestamp).getTime()) / 1000);
    if (secs < 10) return this.transloco.translate('insights.justNow');
    if (secs < 60) return this.transloco.translate('insights.secondsAgo', { n: secs });
    const mins = Math.floor(secs / 60);
    if (mins < 60) return this.transloco.translate('insights.minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return this.transloco.translate('insights.hoursAgo', { n: hours });
    return this.transloco.translate('insights.daysAgo', { n: Math.floor(hours / 24) });
  });

  todayStats = computed(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const hours = this.todayHourlyData().filter(h => {
      if (h.avgHumidity == null) return false;
      const hd = new Date(h.hour);
      return hd >= todayStart && hd <= todayEnd;
    });
    if (hours.length === 0) return null;
    const avg = hours.reduce((s, h) => s + (h.avgHumidity ?? 0), 0) / hours.length;
    const min = Math.min(...hours.map(h => h.minHumidity ?? h.avgHumidity ?? Infinity));
    const max = Math.max(...hours.map(h => h.maxHumidity ?? h.avgHumidity ?? -Infinity));
    return { avg, min, max, hourCount: hours.length };
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
      const dayHours = hourly.filter(h => {
        if (h.avgHumidity == null) return false;
        const hd = new Date(h.hour);
        return hd >= dayStart && hd <= dayEnd;
      });
      const hasData = dayHours.length > 0;
      const avg = hasData ? dayHours.reduce((s, h) => s + (h.avgHumidity ?? 0), 0) / dayHours.length : null;
      const min = hasData ? Math.min(...dayHours.map(h => h.minHumidity ?? h.avgHumidity ?? Infinity)) : null;
      const max = hasData ? Math.max(...dayHours.map(h => h.maxHumidity ?? h.avgHumidity ?? -Infinity)) : null;
      return {
        day, dayStart, hasData, avg, min, max,
        isToday: dayStart.getTime() === today.getTime(),
        isFuture: dayStart > today,
      };
    });
  });

  yAxisLabels = computed(() => ({ top: '100', mid: '50' }));

  optimalLines = computed<OptimalLine[]>(() => {
    return [this.userSettings.effectiveHumidityMin(), this.userSettings.effectiveHumidityMax()].map(v => ({
      label: `${v}%`,
      y: Math.round((v / Y_AXIS_MAX) * CHART_HEIGHT_PX),
    }));
  });

  chartBars = computed<DayBar[]>(() => {
    return this.rawDayData().map(r => {
      const valToY = (v: number) => (v / Y_AXIS_MAX) * CHART_HEIGHT_PX;
      let barBottomPx = 0, barHeightPx = 0, avgY = 0;
      let barClass = 'bg-gray-100';

      if (r.hasData && r.min != null && r.max != null && r.avg != null) {
        barBottomPx = Math.max(0, valToY(r.min));
        barHeightPx = Math.max(4, valToY(r.max) - valToY(r.min));
        avgY = valToY(r.avg);

        const withinOptimal = r.min >= this.userSettings.effectiveHumidityMin() && r.max <= this.userSettings.effectiveHumidityMax();
        const avgOutsideOptimal = r.avg < this.userSettings.effectiveHumidityMin() || r.avg > this.userSettings.effectiveHumidityMax();
        const isFaded = !r.isToday;
        if (avgOutsideOptimal) barClass = isFaded ? 'bg-gw-red/50' : 'bg-gw-red';
        else if (!withinOptimal) barClass = isFaded ? 'bg-gw-amber/50' : 'bg-gw-amber';
        else barClass = isFaded ? 'bg-gw-green/50' : 'bg-gw-green';
      }

      const tooltip = r.hasData && !r.isFuture && r.min != null && r.max != null && r.avg != null
        ? this.transloco.translate('insights.humidityDayTooltip', {
            day: r.day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
            avg: r.avg.toFixed(1),
            min: r.min.toFixed(1),
            max: r.max.toFixed(1),
          })
        : r.isFuture ? this.transloco.translate('insights.upcoming') : this.transloco.translate('insights.noData');

      return {
        dateStr: r.day.toISOString().split('T')[0],
        label: r.day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3),
        dateLabel: r.day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        hasData: r.hasData,
        isToday: r.isToday,
        isFuture: r.isFuture,
        min: r.min, max: r.max, avg: r.avg,
        barBottomPx, barHeightPx, avgY, barClass, tooltip,
      };
    });
  });

  hasWeekData = computed(() => this.chartBars().some(d => d.hasData && !d.isFuture));

  weekAvgStr = computed(() => {
    const days = this.chartBars().filter(d => d.hasData && d.avg != null && !d.isFuture);
    if (days.length === 0) return '—';
    const avg = days.reduce((s, d) => s + (d.avg ?? 0), 0) / days.length;
    return `${avg.toFixed(1)} %`;
  });

  weekExtremes = computed(() => {
    const days = this.chartBars().filter(d => d.hasData && !d.isFuture && d.min != null && d.max != null);
    if (days.length === 0) return null;
    const driest = days.reduce((min, d) => (d.min! < min.min! ? d : min));
    const wettest = days.reduce((max, d) => (d.max! > max.max! ? d : max));
    return {
      dryLabel: driest.label,
      dryStr: `${driest.min!.toFixed(1)} %`,
      wetLabel: wettest.label,
      wetStr: `${wettest.max!.toFixed(1)} %`,
    };
  });

  constructor() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));
    this.sensorService.getHourlyData(48).subscribe(d => this.todayHourlyData.set(d));

    this.sensorService.getLatestSensorData().subscribe(d => this.latestData.set(d));
    this.liveSub = this.sensorService.subscribeToSensorData().subscribe(d => { if (d) this.latestData.set(d); });

    this.tickTimer = setInterval(() => this.tick.update(v => v + 1), 30_000);

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
    if (this.tickTimer) clearInterval(this.tickTimer);
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
}
