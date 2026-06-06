import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PullToRefreshDirective } from '../../shared/directives/pull-to-refresh.directive';
import { Subscription } from 'rxjs';
import { SensorService, SensorData } from '../../core/services/sensor.service';
import { PlantService } from '../../core/services/plant.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WeatherService } from '../../core/services/weather.service';
import { analyzeForecast } from '../../core/utils/weather-risk';
import { TierService } from '../../core/services/tier.service';
import { ReminderService, PlantReminder } from '../../core/services/reminder.service';
import { EmptyStateComponent } from '../../shared/components/atoms/empty-state.component';
import { STORAGE_KEYS } from '../../core/constants/storage-keys';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

export interface Alert {
  id: string;
  type: 'info' | 'warn' | 'danger';
  title: string;
  message: string;
  timestamp: Date;
}

@Component({
  selector: 'app-alerts',
  imports: [DatePipe, EmptyStateComponent, PullToRefreshDirective, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 pb-6" gwPullToRefresh (gwPullRefresh)="reload()" *transloco="let t">

      <div class="sticky top-0 z-30 -mx-4 px-4 pt-5 pb-3 mb-3 flex items-center justify-between bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div>
          <h1 class="text-[18px] font-medium text-gray-800">{{ t('alerts.title') }}</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">{{ t('alerts.todayCount', { n: todayCount() }) }}</p>
        </div>
        @if (allAlerts().length > 0) {
          <button (click)="clearAll()" class="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            {{ t('alerts.clearAll') }}
          </button>
        }
      </div>

      @if (allAlerts().length === 0) {
        <app-empty-state emoji="🔔" [title]="t('alerts.noAlerts')"
                         [subtitle]="t('alerts.noAlertsHint')" />
      } @else {

        <!-- Today -->
        @if (todayAlerts().length > 0) {
          <div class="text-[11px] text-gray-400 mb-3 font-medium uppercase tracking-wide">{{ t('common.today') }}</div>
          <div class="flex flex-col gap-2 mb-5">
            @for (alert of todayAlerts(); track alert.id) {
              <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex gap-3">
                <div class="mt-1 w-2 h-2 rounded-full shrink-0"
                     [class]="dotColor(alert.type)"></div>
                <div class="flex-1">
                  <div class="text-[14px] font-medium text-gray-800">{{ alert.title }}</div>
                  <div class="text-[13px] text-gray-500 mt-0.5 leading-relaxed">{{ alert.message }}</div>
                  <div class="text-[11px] text-gray-300 mt-1.5">{{ alert.timestamp | date:'HH:mm' }}</div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Earlier -->
        @if (earlierAlerts().length > 0) {
          <div class="text-[11px] text-gray-400 mb-3 font-medium uppercase tracking-wide">{{ t('common.earlier') }}</div>
          <div class="flex flex-col gap-2">
            @for (alert of earlierAlerts(); track alert.id) {
              <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex gap-3 opacity-60">
                <div class="mt-1 w-2 h-2 rounded-full shrink-0"
                     [class]="dotColor(alert.type)"></div>
                <div class="flex-1">
                  <div class="text-[14px] font-medium text-gray-800">{{ alert.title }}</div>
                  <div class="text-[13px] text-gray-500 mt-0.5 leading-relaxed">{{ alert.message }}</div>
                  <div class="text-[11px] text-gray-300 mt-1.5">{{ alert.timestamp | date:'EEE HH:mm' }}</div>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class AlertsComponent implements OnInit, OnDestroy {
  private sensorService = inject(SensorService);
  private plantService = inject(PlantService);
  private userSettings = inject(UserSettingsService);
  private weatherService = inject(WeatherService);
  private tier = inject(TierService);
  private reminderService = inject(ReminderService);
  private transloco = inject(TranslocoService);
  private dueReminders = signal<PlantReminder[]>([]);
  private sub?: Subscription;
  private readonly STORAGE_KEY = STORAGE_KEYS.ALERTS;
  private localeKey = signal(this.transloco.getActiveLang());

  alerts = signal<Alert[]>(this.loadAlerts());
  plants = this.plantService.plants;
  private monitoredPlants = computed(() => this.plants().filter(p => p.monitored));

  weatherAlerts = computed<Alert[]>(() => {
    this.localeKey();
    if (!this.tier.canSeeWeatherWarnings()) return [];
    const forecast = this.weatherService.forecast();
    if (!forecast || forecast.length === 0) return [];
    const risks = analyzeForecast(forecast, {
      frost: this.userSettings.effectiveFrostThreshold(),
      heat: this.userSettings.effectiveHeatThreshold(),
      wind: this.userSettings.effectiveWindThreshold(),
    });
    const today = risks[0];
    if (!today || today.messages.length === 0) return [];
    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);
    return today.messages.map(m => ({
      id: `weather-${today.date}-${m.type}`,
      type: (m.severity === 'severe' ? 'danger' : 'warn') as Alert['type'],
      title: t(`forecast.alert.${m.type}Title`),
      message: t(m.bodyKey, m.bodyParams) + ' ' + t(m.actionKey),
      timestamp: new Date(),
    }));
  });

  reminderAlerts = computed<Alert[]>(() => {
    this.localeKey();
    const plants = this.plants();
    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);
    const now = new Date();
    return this.dueReminders()
      .filter(r => ReminderService.isDue(r, now))
      .map(r => {
        const plant = plants.find(p => p.id === r.plantId);
        const name = plant?.name ?? '—';
        const titleKey = r.actionType === 'water' ? 'reminders.alertWaterTitle' : 'reminders.alertFertilizeTitle';
        const bodyKey = r.actionType === 'water' ? 'reminders.alertWaterBody' : 'reminders.alertFertilizeBody';
        return {
          id: `reminder-${r.id}`,
          type: 'warn' as Alert['type'],
          title: t(titleKey, { name }),
          message: t(bodyKey, { name }),
          timestamp: r.nextDueAt,
        };
      });
  });

  allAlerts = computed<Alert[]>(() => [...this.reminderAlerts(), ...this.weatherAlerts(), ...this.alerts()]);

  todayAlerts = computed(() => {
    const today = new Date().toDateString();
    return this.allAlerts().filter(a => a.timestamp.toDateString() === today);
  });

  earlierAlerts = computed(() => {
    const today = new Date().toDateString();
    return this.allAlerts().filter(a => a.timestamp.toDateString() !== today);
  });

  todayCount = computed(() => this.todayAlerts().length);

  private loadAlerts(): Alert[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw).map((a: any) => ({ ...a, timestamp: new Date(a.timestamp) }));
    } catch { return []; }
  }

  private saveAlerts() {
    // Keep last 50 alerts
    const trimmed = this.alerts().slice(0, 50);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed));
  }

  private addAlert(type: Alert['type'], title: string, message: string) {
    const alert: Alert = { id: crypto.randomUUID(), type, title, message, timestamp: new Date() };
    this.alerts.update(a => [alert, ...a]);
    this.saveAlerts();
  }

  dotColor(type: Alert['type']) {
    if (type === 'warn') return 'bg-gw-amber';
    if (type === 'danger') return 'bg-gw-red';
    return 'bg-gw-green';
  }

  clearAll() {
    this.alerts.set([]);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private checkConditions(data: SensorData) {
    const plants = this.monitoredPlants();
    const plantNames = plants.length > 0
      ? plants.map(p => p.name).join(', ')
      : this.transloco.translate('alerts.yourPlants');
    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);

    // Humidity alerts
    if (data.humidity != null && data.humidity < 40) {
      this.addAlert('warn', t('alerts.lowHumidity'),
        t('alerts.lowHumidityMsg', { value: Math.round(data.humidity), plants: plantNames }));
    }

    // Temperature alerts — uses user-configured thresholds (defaults 15-30°C)
    if (data.temperature != null) {
      const min = this.userSettings.effectiveTempMin();
      const max = this.userSettings.effectiveTempMax();
      if (data.temperature < min) {
        this.addAlert('warn', t('alerts.tempTooLow'),
          t('alerts.tempTooLowMsg', { value: data.temperature.toFixed(1), min, plants: plantNames }));
      } else if (data.temperature > max) {
        this.addAlert('warn', t('alerts.tempTooHigh'),
          t('alerts.tempTooHighMsg', { value: data.temperature.toFixed(1), max, plants: plantNames }));
      }
    }

  }

  /** Pull-to-refresh: re-fetch reminders and weather (sensor sub already live). */
  reload() {
    this.reminderService.list().subscribe(list => this.dueReminders.set(list));
    if (this.tier.canSeeWeatherWarnings()) this.weatherService.fetchForecast();
  }

  ngOnInit() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));
    if (this.tier.canSeeWeatherWarnings() && !this.weatherService.forecast()) this.weatherService.fetchForecast();
    this.reminderService.list().subscribe(list => this.dueReminders.set(list));
    this.sub = this.sensorService.subscribeToSensorData().subscribe(data => {
      if (!data) return;
      if (!this.userSettings.effectiveAlertsEnabled()) return;
      this.checkConditions(data);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
