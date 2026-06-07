import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WeatherService } from '../../core/services/weather.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { analyzeForecast, DailyRisk } from '../../core/utils/weather-risk';
import { PageContainerComponent } from '../../shared/components/page-container/page-container.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

interface DayCard {
  date: string;
  headline: string;
  icon: string;
  conditionLabel: string;
  tempMin: number;
  tempMax: number;
  windMax: number;
  risk: DailyRisk;
}

@Component({
  selector: 'app-forecast',
  imports: [PageContainerComponent, TranslocoDirective],
  template: `
    <app-page-container>
      <ng-container *transloco="let t">

      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ {{ t('nav.home') }}
      </button>

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">{{ t('forecast.title') }}</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">{{ t('forecast.subtitle') }}</p>
      </div>

      @if (weather.forecastLoading() && cards().length === 0) {
        <div class="flex flex-col gap-3">
          @for (i of [1,2,3]; track i) {
            <div class="bg-white rounded-xl p-4 shadow-gw-sm h-32 animate-pulse"></div>
          }
        </div>
      } @else if (cards().length === 0) {
        <div class="bg-white rounded-xl p-6 shadow-gw-sm text-center">
          <p class="text-[13px] text-gray-500">{{ t('forecast.noData') }}</p>
        </div>
      } @else {
        <div class="flex flex-col gap-3">
          @for (card of cards(); track card.date) {
            <div class="bg-white rounded-xl p-4 border-[0.5px]"
                 [class]="cardBorder(card.risk.severity)">
              <div class="flex items-start justify-between mb-2">
                <div>
                  <div class="text-[13px] font-medium text-gray-800">{{ card.headline }}</div>
                  <div class="text-[11px] text-gray-400 mt-0.5">{{ card.icon }} {{ card.conditionLabel }}</div>
                </div>
                <div class="text-right">
                  <div class="text-[14px] font-medium text-gray-800 tabular-nums">{{ card.tempMax }}°/{{ card.tempMin }}°</div>
                  <div class="text-[11px] text-gray-400 tabular-nums">{{ t('forecast.windTo', { wind: card.windMax }) }}</div>
                </div>
              </div>

              <div class="border-t border-gray-100 mt-3 pt-3">
                @if (card.risk.messages.length === 0) {
                  <div class="text-[12px] text-gw-green-dark">{{ t('forecast.noRisks') }}</div>
                } @else {
                  <div class="flex flex-col gap-3">
                    @for (m of card.risk.messages; track m.type) {
                      <div>
                        <div class="text-[13px] font-medium leading-snug"
                             [class]="m.severity === 'severe' ? 'text-gw-red' : 'text-gw-amber-dark'">
                          {{ m.icon }} {{ riskLabel(m.type) }}
                        </div>
                        <div class="text-[12px] text-gray-600 mt-1 leading-relaxed">
                          {{ t(m.bodyKey, m.bodyParams) }}
                        </div>
                        <div class="text-[12px] text-gray-500 mt-1 leading-relaxed">
                          {{ t(m.actionKey) }}
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      </ng-container>
    </app-page-container>
  `,
})
export class ForecastComponent implements OnInit {
  weather = inject(WeatherService);
  private settings = inject(UserSettingsService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);
  private localeKey = signal(this.transloco.getActiveLang());

  constructor() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));
  }

  cards = computed<DayCard[]>(() => {
    this.localeKey();
    const forecast = this.weather.forecast();
    if (!forecast) return [];
    const risks = analyzeForecast(forecast, {
      frost: this.settings.effectiveFrostThreshold(),
      heat: this.settings.effectiveHeatThreshold(),
      wind: this.settings.effectiveWindThreshold(),
    });
    return forecast.map((d, i) => ({
      date: d.date,
      headline: this.headline(d.date, i),
      icon: d.conditionIcon,
      conditionLabel: d.conditionLabel,
      tempMin: Math.round(d.tempMin),
      tempMax: Math.round(d.tempMax),
      windMax: Math.round(d.windMax),
      risk: risks[i],
    }));
  });

  cardBorder(severity: 'warn' | 'severe' | null): string {
    if (severity === 'severe') return 'border-gw-red';
    if (severity === 'warn') return 'border-gw-amber';
    return 'border-gray-200';
  }

  riskLabel(type: 'frost' | 'heat' | 'wind'): string {
    return this.transloco.translate(`forecast.badge.${type}`);
  }

  back() { this.router.navigate(['/']); }

  ngOnInit() {
    if (!this.weather.forecast()) this.weather.fetchForecast();
  }

  private headline(dateStr: string, index: number): string {
    const d = new Date(dateStr);
    const dayName = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    if (index === 0) return `${this.transloco.translate('forecast.today')} — ${dayName}`;
    if (index === 1) return `${this.transloco.translate('forecast.tomorrow')} — ${dayName}`;
    return dayName;
  }
}
