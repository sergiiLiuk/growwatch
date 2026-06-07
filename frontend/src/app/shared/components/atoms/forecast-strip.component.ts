import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WeatherService } from '../../../core/services/weather.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { analyzeForecast } from '../../../core/utils/weather-risk';
import { IconComponent, IconName } from './icon.component';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-forecast-strip',
  imports: [RouterLink, IconComponent, TranslocoDirective],
  template: `
    <a routerLink="/forecast" class="block" *transloco="let t">
      <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">{{ t('forecast.title') }}</p>
      <div class="grid grid-cols-3 gap-3">
        @for (day of cells(); track day.date) {
          <div class="rounded-2xl p-3 border-[0.5px] flex flex-col items-center text-center transition-all cursor-pointer hover:border-gray-300 gw-card-shadow"
               [class]="cellClass(day.severity)">
            <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{{ day.dayLabel }}</span>
            <app-icon [name]="day.icon" class="w-7 h-7 my-1.5 text-gw-blue" strokeWidth="1.6" />
            <span class="text-[12px] font-medium text-gray-700 tabular-nums">{{ day.tempMax }}°/{{ day.tempMin }}°</span>
            @if (day.badges.length > 0) {
              <div class="flex gap-1.5 mt-1.5">
                @for (b of day.badges; track b) {
                  <app-icon [name]="b" class="w-3.5 h-3.5 text-gw-amber" />
                }
              </div>
            }
          </div>
        }
        @empty {
          @for (i of [0,1,2]; track i) {
            <div class="rounded-2xl p-3 border-[0.5px] border-gray-200 bg-white h-[88px] animate-pulse"></div>
          }
        }
      </div>
    </a>
  `,
})
export class ForecastStripComponent {
  private weather = inject(WeatherService);
  private settings = inject(UserSettingsService);

  cells = computed(() => {
    const forecast = this.weather.forecast();
    if (!forecast) return [];
    const risks = analyzeForecast(forecast, {
      frost: this.settings.effectiveFrostThreshold(),
      heat: this.settings.effectiveHeatThreshold(),
      wind: this.settings.effectiveWindThreshold(),
    });
    return forecast.map((d, i) => {
      const r = risks[i];
      return {
        date: d.date,
        dayLabel: this.dayLabel(d.date, i),
        icon: d.conditionIconName as IconName,
        tempMax: Math.round(d.tempMax),
        tempMin: Math.round(d.tempMin),
        severity: r.severity,
        badges: r.messages.map(m => m.iconName),
      };
    });
  });

  cellClass(severity: 'warn' | 'severe' | null): string {
    if (severity === 'severe') return 'bg-red-50 border-gw-red';
    if (severity === 'warn') return 'bg-gw-amber-light border-gw-amber';
    return 'bg-white border-gray-200';
  }

  private dayLabel(dateStr: string, index: number): string {
    if (index === 0) return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
    return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
  }
}
