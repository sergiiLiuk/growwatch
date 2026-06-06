import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PullToRefreshDirective } from '../../shared/directives/pull-to-refresh.directive';
import { SensorService, HourlySensorData } from '../../core/services/sensor.service';
import { PlantService } from '../../core/services/plant.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WeatherService } from '../../core/services/weather.service';
import { analyzeForecast } from '../../core/utils/weather-risk';
import { TierService } from '../../core/services/tier.service';
import { EmptyStateComponent } from '../../shared/components/atoms/empty-state.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

interface DigestItem {
  icon: string;
  label: string;
  message: string;
  detail: string;
  status: 'ok' | 'warn';
}

@Component({
  selector: 'app-digest',
  imports: [DatePipe, EmptyStateComponent, PullToRefreshDirective, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 pb-6" gwPullToRefresh (gwPullRefresh)="reload()" *transloco="let t">

      <div class="sticky top-0 z-30 -mx-4 px-4 pt-5 pb-3 mb-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <h1 class="text-[18px] font-medium text-gray-800">{{ t('digest.title') }}</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">{{ today | date:'EEEE, d MMMM' }}</p>
      </div>

      @if (loading()) {
        <div class="flex flex-col gap-3">
          @for (i of [1,2,3,4]; track i) {
            <div class="bg-white rounded-xl p-4 border-[0.5px] border-gray-200 animate-pulse">
              <div class="flex gap-3">
                <div class="w-9 h-9 rounded-full bg-gray-100 shrink-0"></div>
                <div class="flex-1">
                  <div class="h-3 bg-gray-100 rounded w-3/4 mb-2"></div>
                  <div class="h-2.5 bg-gray-50 rounded w-full mb-1"></div>
                  <div class="h-2 bg-gray-50 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          }
        </div>
      } @else if (digestItems().length === 0) {
        <app-empty-state emoji="📋" [title]="t('digest.noDataToday')"
                         [subtitle]="t('digest.noDataHint')" />
      } @else {

        <!-- Summary bubble -->
        <div class="bg-gw-green-light p-4 rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-[2px]">
          <p class="text-[13px] text-gw-green-dark leading-relaxed">{{ summaryMessage() }}</p>
        </div>
        @if (hiddenPlantCount() > 0 || showAllPlants()) {
          <button (click)="showAllPlants.set(!showAllPlants())"
                  class="text-[11px] text-gw-green-dark/80 hover:text-gw-green-dark hover:underline mt-1.5 mb-5 ml-1">
            {{ showAllPlants() ? t('digest.showLess') : t('digest.showAllPlants', { n: monitoredPlantCount() }) }}
          </button>
        } @else {
          <div class="mb-5"></div>
        }

        <!-- Digest items -->
        <div class="flex flex-col gap-3">
          @for (item of digestItems(); track item.label) {
            <div class="bg-white rounded-xl p-4 border-[0.5px] border-gray-200 flex gap-3">
              <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-lg"
                   [class]="item.status === 'ok' ? 'bg-gw-green-light' : 'bg-gw-amber-light'">
                {{ item.icon }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-medium text-gray-600 mb-0.5">{{ item.label }}</div>
                <div class="text-[13px] text-gray-800 leading-relaxed">{{ item.message }}</div>
                <div class="text-[11px] text-gray-400 mt-1">{{ item.detail }}</div>
              </div>
            </div>
          }
        </div>

      }
    </div>
  `,
})
export class DigestComponent implements OnInit {
  private sensorService = inject(SensorService);
  private plantService = inject(PlantService);
  private userSettings = inject(UserSettingsService);
  private weatherService = inject(WeatherService);
  private tier = inject(TierService);
  private transloco = inject(TranslocoService);
  // Reactive locale signal so computeds re-run when language changes
  private localeKey = signal(this.transloco.getActiveLang());

  constructor() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));
  }

  today = new Date();
  loading = signal(true);
  hourlyData = signal<HourlySensorData[]>([]);
  plants = this.plantService.plants;
  private monitoredPlants = computed(() => this.plants().filter(p => p.monitored));
  private readonly MAX_PLANT_NAMES = 3;
  showAllPlants = signal(false);
  hiddenPlantCount = computed(() => Math.max(0, this.monitoredPlants().length - this.MAX_PLANT_NAMES));
  monitoredPlantCount = computed(() => this.monitoredPlants().length);

  digestItems = computed<DigestItem[]>(() => {
    this.localeKey(); // dependency so computed re-runs on language change
    const data = this.hourlyData();
    if (data.length === 0) return [];

    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);
    const items: DigestItem[] = [];

    const hasTemp = data.some(d => d.avgTemperature != null);
    if (hasTemp) {
      const userMin = this.userSettings.effectiveTempMin();
      const userMax = this.userSettings.effectiveTempMax();
      const avgTemp = data.filter(d => d.avgTemperature != null).reduce((s, d) => s + d.avgTemperature!, 0) / data.length;
      const minTemp = Math.min(...data.filter(d => d.minTemperature != null).map(d => d.minTemperature!));
      const maxTemp = Math.max(...data.filter(d => d.maxTemperature != null).map(d => d.maxTemperature!));
      const outOfRangeHours = data.filter(d =>
        (d.minTemperature != null && d.minTemperature < userMin) ||
        (d.maxTemperature != null && d.maxTemperature > userMax)
      ).length;
      const tempOk = outOfRangeHours === 0;
      const direction = minTemp < userMin && maxTemp > userMax ? t('digest.tempDirectionBoth')
                      : minTemp < userMin ? t('digest.tempDirectionBelow')
                      : maxTemp > userMax ? t('digest.tempDirectionAbove')
                      : '';
      items.push({
        icon: '🌡️', label: t('digest.tempLabel'), status: tempOk ? 'ok' : 'warn',
        message: tempOk
          ? t('digest.tempOkMsg', { min: userMin, max: userMax })
          : t('digest.tempWarnMsg', { direction, hours: outOfRangeHours, min: userMin, max: userMax }),
        detail: t('digest.tempDetail', { min: minTemp.toFixed(1), max: maxTemp.toFixed(1), avg: avgTemp.toFixed(1) }),
      });
    }

    const hasHumidity = data.some(d => d.avgHumidity != null);
    if (hasHumidity) {
      const avgHum = data.filter(d => d.avgHumidity != null).reduce((s, d) => s + d.avgHumidity!, 0) / data.length;
      const minHum = Math.min(...data.filter(d => d.minHumidity != null).map(d => d.minHumidity!));
      const humOk = minHum >= 40;
      items.push({
        icon: '💧', label: t('digest.humidityLabel'), status: humOk ? 'ok' : 'warn',
        message: humOk ? t('digest.humidityOkMsg') : t('digest.humidityWarnMsg'),
        detail: t('digest.humidityDetail', { avg: Math.round(avgHum), low: Math.round(minHum) }),
      });
    }

    const hasPressure = data.some(d => d.avgPressure != null);
    if (hasPressure) {
      const avgPressure = data.filter(d => d.avgPressure != null).reduce((s, d) => s + d.avgPressure!, 0) / data.length;
      items.push({
        icon: '🔵', label: t('digest.pressureLabel'), status: 'ok',
        message: t('digest.pressureMsg'),
        detail: t('digest.pressureDetail', { avg: Math.round(avgPressure) }),
      });
    }

    // Weather warnings — append risks for today only (plus tier and above)
    const forecast = this.tier.canSeeWeatherWarnings() ? this.weatherService.forecast() : null;
    if (forecast && forecast.length > 0) {
      const risks = analyzeForecast(forecast, {
        frost: this.userSettings.effectiveFrostThreshold(),
        heat: this.userSettings.effectiveHeatThreshold(),
        wind: this.userSettings.effectiveWindThreshold(),
      });
      for (const m of risks[0]?.messages ?? []) {
        items.push({
          icon: m.icon,
          label: t(`forecast.digest.${m.type}Label`),
          status: 'warn',
          message: t(m.bodyKey, m.bodyParams) + ' ' + t(m.actionKey),
          detail: t(`forecast.digest.${m.type}Detail`, m.bodyParams),
        });
      }
    }

    return items;
  });

  summaryMessage = computed(() => {
    this.localeKey();
    const items = this.digestItems();
    const plants = this.monitoredPlants();
    const visible = this.showAllPlants() ? plants : plants.slice(0, this.MAX_PLANT_NAMES);
    const hidden = plants.length - visible.length;
    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);

    let plantNames: string;
    if (plants.length === 0) {
      plantNames = t('digest.yourPlants');
    } else {
      plantNames = visible.map(p => p.name).join(' · ');
      if (hidden > 0) plantNames += ` ${t('digest.plusMore', { n: hidden })}`;
    }

    const warnings = items.filter(i => i.status === 'warn').length;
    if (warnings === 0) return t('digest.summaryGood', { plants: plantNames });
    if (warnings === 1) return t('digest.summaryOneWarning');
    return t('digest.summaryManyWarnings', { n: warnings, plants: plantNames });
  });

  /** Pull-to-refresh: re-pull today's hourly data and weather forecast. */
  reload() {
    this.loading.set(true);
    if (this.tier.canSeeWeatherWarnings()) this.weatherService.fetchForecast();
    this.sensorService.getHourlyData(24).subscribe(data => {
      const todayStr = new Date().toDateString();
      this.hourlyData.set(data.filter(d => new Date(d.hour).toDateString() === todayStr));
      this.loading.set(false);
    });
  }

  ngOnInit() {
    if (this.tier.canSeeWeatherWarnings() && !this.weatherService.forecast()) this.weatherService.fetchForecast();
    this.sensorService.getHourlyData(24).subscribe(data => {
      const todayStr = new Date().toDateString();
      this.hourlyData.set(data.filter(d => new Date(d.hour).toDateString() === todayStr));
      this.loading.set(false);
    });
  }
}
