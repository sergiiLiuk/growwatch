import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SensorCardComponent } from '../../shared/components/atoms/sensor-card.component';
import { OnboardingComponent, hasOnboarded } from '../onboarding/onboarding.component';
import { PullToRefreshDirective } from '../../shared/directives/pull-to-refresh.directive';
import { SensorService, SensorData, HourlySensorData, MoodInfo } from '../../core/services/sensor.service';
import { PlantService, Plant } from '../../core/services/plant.service';
import { getSeasonInfo } from '../../core/utils/season';
import { calculateStreak } from '../../core/utils/streak';
import { WeatherService } from '../../core/services/weather.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { PlantActionService, DailyBriefing } from '../../core/services/plant-action.service';
import { ReminderService, PlantReminder } from '../../core/services/reminder.service';
import dayjs from 'dayjs';
import { TierService } from '../../core/services/tier.service';
import { AuthService } from '../../core/services/auth.service';
import { isNight, isDawnOrDusk, daysAgo } from '../../core/utils/time';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

const PLANT_EMOJI: Record<string, string> = {
  TOMATO: '🍅', PEPPER: '🌶️', CUCUMBER: '🥒', ZUCCHINI: '🥒', EGGPLANT: '🍆',
  LETTUCE: '🥬', SPINACH: '🥬', KALE: '🥬', ARUGULA: '🥬', RADISH: '🌱',
  BASIL: '🌿', MINT: '🌿', PARSLEY: '🌿', CILANTRO: '🌿', CHIVE: '🌿',
  OREGANO: '🌿', THYME: '🌿', ROSEMARY: '🌿', STRAWBERRY: '🍓',
  GRAPES: '🍇', MELON: '🍈', WATERMELON: '🍉',
};

interface ActivityEvent {
  time: string;
  label: string;
  ok: boolean;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, SensorCardComponent, OnboardingComponent, IconComponent, PullToRefreshDirective, TranslocoDirective],
  template: `
    @if (showOnboarding()) {
      <app-onboarding (done)="showOnboarding.set(false)" />
    }

    <div class="max-w-2xl mx-auto px-4 py-6" gwPullToRefresh (gwPullRefresh)="reload()" *transloco="let t">

      <!-- Header -->
      <div class="flex items-start justify-between mb-5">
        <div class="flex-1 min-w-0">
          <h1 class="font-h1 text-gw-text flex items-center gap-2">
            @if (greetingName()) {
              {{ t(greetingKey()) }}, {{ greetingName() }}!
            } @else {
              {{ t(greetingKey()) }}!
            }
            <span>🌿</span>
          </h1>
          <p class="font-body text-gw-muted mt-1">{{ t('home.subtitle') }}</p>
        </div>
        <a routerLink="/alerts"
           class="relative w-10 h-10 rounded-full bg-white shadow-gw-sm flex items-center justify-center text-gw-text hover:bg-gw-green-light/40 transition-colors"
           [attr.aria-label]="t('nav.alerts')">
          <app-icon name="alerts" class="w-5 h-5" />
        </a>
      </div>

      <!-- Verify-email banner -->
      @if (!emailVerified()) {
        <div class="mb-5 rounded-xl bg-amber-50 px-3 py-2 flex items-center gap-3 shadow-gw-sm">
          <span class="font-caption text-amber-800 flex-1">
            @if (resentVerification()) { {{ t('home.verifyEmailResent') }} }
            @else { {{ t('home.verifyEmailHint') }} }
          </span>
          @if (!resentVerification()) {
            <button (click)="resendVerification()" [disabled]="resendingVerification()"
                    class="text-[11px] font-medium text-amber-900 hover:underline disabled:opacity-40">
              {{ resendingVerification() ? t('home.verifyEmailSending') : t('home.verifyEmailResend') }}
            </button>
          }
        </div>
      }

      <!-- Weather card — tap to open 3-day forecast (Plus only) -->
      <a [routerLink]="weatherTarget()" class="block bg-white shadow-gw-sm rounded-2xl p-4 mb-2 hover:shadow-gw-md transition-shadow"
         [class.cursor-pointer]="weatherTarget() !== null">
        @if (weather(); as w) {
          <!-- Top row: condition + temp + location -->
          <div class="flex items-center gap-3 mb-3">
            <span class="text-4xl leading-none shrink-0">{{ w.conditionIcon }}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="font-display-md text-gw-text leading-none">{{ w.temperature }}°C</span>
                <span class="font-caption text-gw-muted truncate">{{ w.conditionLabel }}</span>
              </div>
              <div class="text-[12px] text-gw-blue mt-1 flex items-center gap-1">
                <span>📍</span><span class="truncate">{{ w.city }}</span>
              </div>
            </div>
            @if (weatherTarget()) {
              <span class="text-gw-subtle shrink-0">›</span>
            }
          </div>
          <!-- Bottom row: 3 stats with a hairline above -->
          <div class="grid grid-cols-3 gap-2 pt-3 border-t border-gw-border text-center">
            <div>
              <div class="font-h2 text-gw-text tabular-nums">{{ w.humidity }}<span class="text-[11px] text-gw-muted">%</span></div>
              <div class="text-[10px] text-gw-muted mt-0.5 flex items-center justify-center gap-1"><span>💧</span>{{ t('home.humidity') }}</div>
            </div>
            <div class="border-l border-gw-border">
              <div class="font-h2 text-gw-text tabular-nums">{{ w.windSpeed }} <span class="text-[11px] text-gw-muted">m/s</span></div>
              <div class="text-[10px] text-gw-muted mt-0.5 flex items-center justify-center gap-1"><span>🌬️</span>{{ t('home.wind') }}</div>
            </div>
            <div class="border-l border-gw-border">
              <div class="font-h2 text-gw-text tabular-nums">{{ w.pressure }} <span class="text-[11px] text-gw-muted">hPa</span></div>
              <div class="text-[10px] text-gw-muted mt-0.5 flex items-center justify-center gap-1"><span>📊</span>{{ t('home.pressure') }}</div>
            </div>
          </div>
        } @else {
          <p class="font-body text-gw-muted text-center py-2">
            {{ weatherService.loading() ? t('home.loadingWeather') : t('home.weatherUnavailable') }}
          </p>
        }
      </a>

      @if (weatherAgoLabel()) {
        <p class="text-center text-[11px] text-gw-subtle mb-4">{{ weatherAgoLabel() }}</p>
      } @else {
        <div class="mb-4"></div>
      }

      <!-- Greenhouse status — large success/attention card with optional illustration -->
      @if (plants().length > 0) {
        <div class="mb-5 rounded-2xl p-5 flex items-center gap-4 shadow-gw-sm"
             [class.bg-gw-green-light]="statusGood()"
             [class.bg-gw-amber-light]="!statusGood()">
          <div class="w-12 h-12 rounded-full bg-white shadow-gw-sm flex items-center justify-center text-2xl shrink-0"
               [class.text-gw-green-dark]="statusGood()"
               [class.text-gw-amber-dark]="!statusGood()">
            {{ statusGood() ? '✓' : '!' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-h1" [class.text-gw-green-dark]="statusGood()" [class.text-gw-amber-dark]="!statusGood()">
              {{ statusGood() ? t('home.allCaughtUp') : t('home.needsAttention') }}
            </div>
            <p class="font-body mt-1" [class.text-gw-green-dark]="statusGood()" [class.text-gw-amber-dark]="!statusGood()">
              {{ statusGood() ? t('home.allCaughtUpBody') : t('home.needsAttentionBody', { n: dueCount() }) }}
            </p>
          </div>
          <span class="hidden sm:block text-5xl leading-none opacity-80">🏡</span>
        </div>
      } @else if (!plantsLoading()) {
        <div class="bg-white shadow-gw-sm rounded-2xl p-5 mb-5 flex items-start gap-4">
          <div class="w-10 h-10 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
            <app-icon name="plants" class="w-5 h-5 text-gw-green-dark" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-h2 text-gw-green-dark">{{ t('home.addYourFirstPlant') }}</p>
            <p class="font-body text-gw-muted mt-1">{{ t('home.addYourFirstPlantBody') }}</p>
            <a routerLink="/plants"
               class="inline-block mt-3 font-caption font-medium bg-gw-green text-white px-4 py-2 rounded-xl hover:bg-gw-green-dark transition-colors">
              {{ t('home.addAPlant') }}
            </a>
          </div>
        </div>
      }

      <!-- Plus upsell strip — only for free users with plants -->
      @if (tier.isFree() && tier.canSeeSubscription() && plants().length > 0) {
        <a routerLink="/upgrade"
           class="flex items-center gap-3 mb-5 rounded-xl bg-white shadow-gw-sm px-4 py-3 hover:bg-gw-green-light/30 transition-colors">
          <span class="w-8 h-8 rounded-full bg-gw-green-light/60 flex items-center justify-center text-gw-green-dark text-base shrink-0">⭐</span>
          <span class="font-body text-gw-muted flex-1">{{ t('home.upgradeStrip') }}</span>
          <span class="font-body font-medium text-gw-green-dark flex items-center gap-1">{{ t('home.seePlans') }} <span>›</span></span>
        </a>
      }

      <!-- AI brief — for Plus/Pro -->
      @if (tier.canSeeAi() && briefing(); as b) {
        <div class="mb-5 rounded-2xl bg-gw-green-light p-4 shadow-gw-sm">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <span>✨</span>
              <span class="font-caption font-semibold tracking-widest uppercase text-gw-green-dark/70">
                {{ b.cycle === 'morning' ? t('home.morningBrief') : t('home.eveningBrief') }}
              </span>
            </div>
            <span class="font-caption text-gw-green-dark/50 tabular-nums">{{ formatBriefingTime(b.generatedAt) }}</span>
          </div>
          <p class="font-body text-gw-green-dark leading-relaxed">{{ b.overview }}</p>
        </div>
      }

      <!-- Sensors — Pro only -->
      @if (tier.canSeeSensors()) {
        <div class="mb-5">
          <p class="font-caption font-semibold text-gw-subtle uppercase tracking-widest mb-3">{{ t('home.sensors') }}</p>
          <div class="grid grid-cols-2 gap-3">
            <app-sensor-card
              [label]="t('home.temp')" [value]="tempValue()" unit="°C"
              [status]="tempStatus()" [sparkValues]="tempSpark()"
              [statusLabel]="t('home.statusLabel.' + tempStatus())"
              tone="green" link="/temperature" />
            <app-sensor-card
              [label]="t('home.humidity')" [value]="humidValue()" unit="%"
              [status]="humidStatus()" [sparkValues]="humidSpark()"
              [statusLabel]="t('home.statusLabel.' + humidStatus())"
              tone="blue" link="/humidity" />
          </div>
        </div>
      }

      <!-- Recent activity -->
      <div class="mb-5">
        <p class="font-caption font-semibold text-gw-subtle uppercase tracking-widest mb-3">{{ t('home.recentActivity') }}</p>
        @if (activityFeed().length === 0) {
          <a routerLink="/digest" class="block bg-white shadow-gw-sm rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-gw-green-light/20 transition-colors">
            <div class="w-9 h-9 rounded-full bg-gw-green-light/60 flex items-center justify-center text-gw-green-dark shrink-0">
              <app-icon name="calendar" class="w-4 h-4" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-h2 text-gw-text">{{ t('home.noEventsLast24h') }}</div>
              <div class="font-caption text-gw-muted">{{ t('home.youreAllSet') }}</div>
            </div>
            <span class="text-gw-subtle">›</span>
          </a>
        } @else {
          <div class="bg-white shadow-gw-sm rounded-2xl divide-y divide-gw-border">
            @for (event of activityFeed(); track event.time + event.label) {
              <div class="flex items-center gap-3 px-4 py-3">
                <span class="w-1.5 h-1.5 rounded-full shrink-0" [class]="event.ok ? 'bg-gw-green' : 'bg-gw-amber'"></span>
                <span class="font-caption text-gw-muted tabular-nums shrink-0">{{ event.time }}</span>
                <span class="font-body text-gw-text flex-1">{{ event.label }}</span>
              </div>
            }
          </div>
        }
      </div>

      <!-- Plants strip -->
      <div class="mb-5">
        <p class="font-caption font-semibold text-gw-subtle uppercase tracking-widest mb-3">{{ t('nav.plants') }}</p>
        <div class="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style="scrollbar-width:none">
          @for (plant of plants(); track plant.id) {
            <a [routerLink]="['/plants', plant.id]"
               class="relative flex-shrink-0 w-32 bg-white shadow-gw-sm rounded-2xl p-3 flex flex-col items-center gap-2 text-center hover:shadow-gw-md transition-shadow">
              <span class="absolute top-2 right-2 text-[10px] font-semibold text-gw-green-dark bg-gw-green-light/70 px-2 py-0.5 rounded-full leading-none">
                {{ t('season.weekShort', { n: plantSeason(plant).week }) }}
              </span>
              <span class="text-4xl leading-none mt-2">{{ plantEmoji(plant) }}</span>
              <span class="font-h2 text-gw-text truncate w-full">{{ plant.name }}</span>
              <span class="inline-flex items-center gap-1 text-[11px] text-gw-muted bg-gw-parchment rounded-full px-2 py-0.5">
                <span>📅</span>{{ t('home.dayN', { n: plantDays(plant) }) }}
              </span>
              <span class="inline-flex items-center gap-1.5 text-[11px]" [class]="plantStatusClass(plant)">
                <span class="w-1.5 h-1.5 rounded-full" [class]="plantStatusDotClass(plant)"></span>{{ plantStatus(plant) }}
              </span>
            </a>
          }
          <a routerLink="/plants"
             class="flex-shrink-0 w-32 bg-white rounded-2xl p-3 flex flex-col items-center justify-center gap-2 text-center hover:bg-gw-green-light/20 transition-colors"
             style="border: 1.5px dashed var(--color-gw-border)">
            <span class="text-2xl text-gw-green">+</span>
            <span class="font-caption text-gw-muted">{{ t('home.addPlant') }}</span>
          </a>
        </div>
      </div>

    </div>
  `,
})
export class HomeComponent implements OnInit, OnDestroy {
  private sensorService = inject(SensorService);
  private plantService = inject(PlantService);
  weatherService = inject(WeatherService);
  private userSettings = inject(UserSettingsService);
  private plantActions = inject(PlantActionService);
  private transloco = inject(TranslocoService);
  tier = inject(TierService);
  private auth = inject(AuthService);

  // First-launch onboarding overlay. Skipped on subsequent visits.
  showOnboarding = signal(!hasOnboarded());

  /** Re-fetch the live sensor, plant list, and streak. Wired to pull-to-refresh. */
  reload() {
    this.sensorService.getLatestSensorData().subscribe(d => this.latestData.set(d));
    this.sensorService.getHourlyData(24).subscribe(d => this.hourlyData.set(d));
    this.plantService.reload();
    this.plantActions.listAll(200).subscribe(list => this.streakDays.set(calculateStreak(list.map(a => a.createdAt))));
    this.weatherService.fetchWeather();
    this.weatherFetchedAt.set(Date.now());
    this.reminderService?.list().subscribe(list => this.dueReminders.set(list));
  }

  // Cross-plant care streak — refreshed on init; recomputed when actions change.
  streakDays = signal(0);

  // Email verification banner: visible only when the signed-in user hasn't verified.
  emailVerified = computed(() => this.auth.user()?.emailVerified ?? true);
  resendingVerification = signal(false);
  resentVerification = signal(false);

  async resendVerification() {
    if (this.resendingVerification()) return;
    this.resendingVerification.set(true);
    try {
      await this.auth.requestEmailVerification();
      this.resentVerification.set(true);
    } catch (err) {
      console.error('Resend verification failed:', err);
    } finally {
      this.resendingVerification.set(false);
    }
  }
  briefing = signal<DailyBriefing | null>(null);

  formatBriefingTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  private localeKey = signal(this.transloco.getActiveLang());
  private sub?: Subscription;
  private weatherTimer?: ReturnType<typeof setInterval>;

  latestData = signal<SensorData | null>(null);
  hourlyData = signal<HourlySensorData[]>([]);
  plants = this.plantService.plants;
  plantsLoading = this.plantService.plantsLoading;
  monitoredPlants = computed(() => this.plants().filter(p => p.monitored));
  weather = this.weatherService.weather;

  // Seasonal tip — static, locale-reactive, no backend cost. Shown to free users
  // in place of the AI briefing they don't have access to.
  seasonalTip = computed(() => {
    this.localeKey();
    const month = new Date().getMonth();
    return this.transloco.translate(`home.seasonalTips.${month}`);
  });

  // ── Phase countdown ──────────────────────────────────────────────────────────

  phaseCountdown = computed<string>(() => {
    this.localeKey();
    const w = this.weather();
    if (!w?.sunrise || !w?.sunset) return '';
    const now = new Date();
    const sunrise = new Date(w.sunrise);
    const sunset = new Date(w.sunset);

    let target: Date;
    let key: 'home.lightCycleStartsIn' | 'home.lightCycleEndsIn';

    if (now < sunrise) {
      target = sunrise; key = 'home.lightCycleStartsIn';
    } else if (now < sunset) {
      target = sunset; key = 'home.lightCycleEndsIn';
    } else {
      // After today's sunset — calculate tomorrow's sunrise by adding 24h as approximation
      target = new Date(sunrise.getTime() + 24 * 60 * 60 * 1000);
      key = 'home.lightCycleStartsIn';
    }

    const diff = target.getTime() - now.getTime();
    if (diff <= 0) return '';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const time = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return this.transloco.translate(key, { time });
  });

  // ── Mood ─────────────────────────────────────────────────────────────────────

  // If the latest hourly record is older than this, escalate from "waiting" → "offline"
  private readonly SILENT_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2h

  mood = computed<MoodInfo>(() => {
    this.localeKey();
    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);
    const live = this.latestData();

    // No live reading — split between "just waiting" and "truly silent for hours"
    if (!live) {
      const h = this.hourlyData()[0];
      if (!h) {
        return { mood: 'waiting', label: t('mood.waiting'), description: t('mood.waitingDesc') };
      }
      const ageMs = Date.now() - new Date(h.hour).getTime();
      if (ageMs > this.SILENT_THRESHOLD_MS) {
        return { mood: 'offline', label: t('mood.sensorSilent'), description: t('mood.sensorSilentDesc', { ago: this.formatAge(ageMs) }) };
      }
      return { mood: 'waiting', label: t('mood.waiting'), description: t('mood.waitingDesc') };
    }

    const base = this.sensorService.getMood(live);
    const sr = this.weather()?.sunrise;
    const ss = this.weather()?.sunset;
    if (base.mood === 'stressed' && isNight(sr, ss))
      return { mood: 'good', label: t('mood.resting'), description: t('mood.restingDesc') };
    if (base.mood === 'stressed' && isDawnOrDusk(sr, ss))
      return { mood: 'good', label: t('mood.lowLight'), description: t('mood.lowLightDesc') };
    return base;
  });

  private formatAge(ms: number): string {
    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return t('home.minutesAgo', { n: minutes });
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 24) return t('home.hoursAgo', { n: hours });
    const days = Math.floor(ms / 86_400_000);
    return t('home.daysAgo', { n: days });
  }

  moodBg = computed(() => {
    const m = this.mood().mood;
    if (m === 'thriving' || m === 'good') return 'bg-gw-green-light';
    if (m === 'stressed') return 'bg-gw-amber-light';
    if (m === 'critical' || m === 'offline') return 'bg-gw-red-light';
    return 'bg-gray-100'; // waiting
  });

  moodIconColor = computed(() => {
    const m = this.mood().mood;
    if (m === 'thriving' || m === 'good') return 'text-gw-green-dark';
    if (m === 'stressed') return 'text-gw-amber-dark';
    if (m === 'critical' || m === 'offline') return 'text-gw-red-dark';
    return 'text-gray-400'; // waiting
  });

  // ── Sensor values ─────────────────────────────────────────────────────────────

  // Each value/status falls back to the most recent hourly average when no live reading is available.
  // The mood card (which depends on latestData being null to detect "waiting"/"silent") is unaffected.

  tempValue = computed(() => {
    const t = this.latestData()?.temperature ?? this.hourlyData()[0]?.avgTemperature;
    return t != null ? t.toFixed(1) : '—';
  });
  tempStatus = computed<'ok' | 'warn' | 'missing'>(() => {
    const t = this.latestData()?.temperature ?? this.hourlyData()[0]?.avgTemperature;
    if (t == null) return 'missing';
    return t < 15 || t > 30 ? 'warn' : 'ok';
  });

  humidValue = computed(() => {
    const h = this.latestData()?.humidity ?? this.hourlyData()[0]?.avgHumidity;
    return h != null ? Math.round(h).toString() : '—';
  });
  humidStatus = computed<'ok' | 'warn' | 'missing'>(() => {
    const h = this.latestData()?.humidity ?? this.hourlyData()[0]?.avgHumidity;
    if (h == null) return 'missing';
    return h < this.userSettings.effectiveHumidityMin() || h > this.userSettings.effectiveHumidityMax() ? 'warn' : 'ok';
  });

  // ── Sparklines ────────────────────────────────────────────────────────────────

  private chronological = computed(() => [...this.hourlyData()].reverse());

  tempSpark = computed(() => this.chronological().map(h => h.avgTemperature).filter((v): v is number => v != null));
  humidSpark = computed(() => this.chronological().map(h => h.avgHumidity).filter((v): v is number => v != null));

  // ── Range labels (calibration cue under sparkline — shows optimal range, not historical) ──

  tempRange = computed(() => ({ min: '15°', max: '30°' }));
  humidRange = computed(() => ({
    min: `${this.userSettings.effectiveHumidityMin()}%`,
    max: `${this.userSettings.effectiveHumidityMax()}%`,
  }));

  // ── Activity feed ─────────────────────────────────────────────────────────────

  activityFeed = computed<ActivityEvent[]>(() => {
    this.localeKey();
    const data = this.chronological();
    if (data.length < 2) return [];

    const events: ActivityEvent[] = [];

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const time = this.fmtHour(curr.hour);

      // Temperature threshold crossings (in/out of optimal range)
      if (prev.avgTemperature != null && curr.avgTemperature != null) {
        const prevOk = prev.avgTemperature >= 15 && prev.avgTemperature <= 30;
        const currOk = curr.avgTemperature >= 15 && curr.avgTemperature <= 30;
        if (prevOk && !currOk) events.push({ time, label: this.transloco.translate('home.tempOutOfRange'), ok: false });
        else if (!prevOk && currOk) events.push({ time, label: this.transloco.translate('home.tempBackInRange'), ok: true });
      }
    }

    // Add a baseline "all sensors" event from earliest hour if no other events
    if (events.length === 0 && data.length > 0) {
      const first = data[0];
      const allOk = first.avgTemperature == null || (first.avgTemperature >= 15 && first.avgTemperature <= 30);
      events.push({ time: this.fmtHour(first.hour), label: allOk ? this.transloco.translate('home.allInRange') : this.transloco.translate('home.monitoringStarted'), ok: allOk });
    }

    return events.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5);
  });

  private fmtHour(hour: string): string {
    try {
      const d = new Date(hour);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // ── Plants ────────────────────────────────────────────────────────────────────

  plantSeason(plant: Plant) { return getSeasonInfo(plant.plantedDate, plant.type); }

  plantEmoji(plant: Plant): string {
    return PLANT_EMOJI[plant.type] ?? '🌱';
  }

  plantStatus(plant: Plant): string {
    if (plant.monitored) {
      const m = this.mood().mood;
      if (m === 'thriving') return this.transloco.translate('mood.thriving');
      if (m === 'good') return this.transloco.translate('mood.healthy');
      if (m === 'stressed') return this.transloco.translate('mood.stressed');
      if (m === 'critical') return this.transloco.translate('mood.critical');
    }
    const days = daysAgo(plant.plantedDate);
    return this.transloco.translate('home.dayCounter', { n: days });
  }

  plantStatusClass(plant: Plant): string {
    if (plant.monitored) {
      const m = this.mood().mood;
      if (m === 'thriving' || m === 'good') return 'text-gw-green-dark';
      if (m === 'stressed' || m === 'critical') return 'text-gw-amber-dark';
    }
    return 'text-gw-muted';
  }

  plantStatusDotClass(plant: Plant): string {
    if (plant.monitored) {
      const m = this.mood().mood;
      if (m === 'thriving' || m === 'good') return 'bg-gw-green';
      if (m === 'stressed' || m === 'critical') return 'bg-gw-amber';
    }
    return 'bg-gw-subtle';
  }

  plantDays(plant: Plant): number {
    return daysAgo(plant.plantedDate);
  }

  // ── Header helpers ────────────────────────────────────────────────────────────

  /** Translation key for the time-of-day greeting. Re-evaluates when `now` ticks. */
  greetingKey = computed(() => {
    const h = new Date(this.now()).getHours();
    if (h < 5) return 'home.greeting.night';
    if (h < 12) return 'home.greeting.morning';
    if (h < 18) return 'home.greeting.afternoon';
    return 'home.greeting.evening';
  });

  /** User's display name from settings (returns empty string when not set). */
  greetingName = computed(() => (this.userSettings.name() ?? '').trim());

  /** Route the weather card links to — `/forecast` for Plus+, null otherwise. */
  weatherTarget = computed(() => this.tier.canSeeWeatherWarnings() ? '/forecast' : null);

  /** Wall-clock tick (every 30 s) used by greeting + weather-ago labels. */
  private now = signal(Date.now());
  private weatherFetchedAt = signal<number | null>(null);
  private nowTimer?: ReturnType<typeof setInterval>;

  /** "Updated N min ago" label for the weather card. */
  weatherAgoLabel = computed(() => {
    const fetched = this.weatherFetchedAt();
    if (!fetched) return '';
    const ms = this.now() - fetched;
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return this.transloco.translate('home.updatedJustNow');
    if (minutes < 60) return this.transloco.translate('home.updatedMinutesAgo', { n: minutes });
    const hours = Math.floor(minutes / 60);
    return this.transloco.translate('home.updatedHoursAgo', { n: hours });
  });

  // ── Greenhouse status (caught up vs. needs attention) ────────────────────────

  private dueReminders = signal<PlantReminder[]>([]);

  dueCount = computed(() => {
    const endOfToday = dayjs().endOf('day');
    return this.dueReminders().filter(r => {
      if (!r.enabled) return false;
      const snoozedUntil = r.snoozedUntil ? dayjs(r.snoozedUntil) : null;
      if (snoozedUntil && snoozedUntil.isAfter(endOfToday)) return false;
      return dayjs(r.nextDueAt).isBefore(endOfToday);
    }).length;
  });

  statusGood = computed(() => this.dueCount() === 0);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  private reminderService = inject(ReminderService);

  ngOnInit() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));
    this.sensorService.getLatestSensorData().subscribe(d => this.latestData.set(d));
    this.sub = this.sensorService.subscribeToSensorData().subscribe(d => { if (d) this.latestData.set(d); });
    this.sensorService.getHourlyData(24).subscribe(d => this.hourlyData.set(d));
    this.fetchWeatherAndMarkTime();
    if (this.tier.canSeeWeatherWarnings()) this.weatherService.fetchForecast();
    if (this.tier.canSeeAi()) this.plantActions.getDailyBriefing().subscribe(b => this.briefing.set(b));
    this.plantActions.listAll(200).subscribe(list => this.streakDays.set(calculateStreak(list.map(a => a.createdAt))));
    this.reminderService.list().subscribe(list => this.dueReminders.set(list));
    this.weatherTimer = setInterval(() => {
      this.fetchWeatherAndMarkTime();
      this.weatherService.fetchForecast();
    }, 30 * 60 * 1000);
    // Tick once a minute so the "updated N min ago" + greeting recompute over time
    this.nowTimer = setInterval(() => this.now.set(Date.now()), 60_000);
  }

  /** Trigger a weather fetch and stamp the time so the "Updated N min ago" label works. */
  private fetchWeatherAndMarkTime() {
    this.weatherService.fetchWeather();
    this.weatherFetchedAt.set(Date.now());
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.weatherTimer) clearInterval(this.weatherTimer);
    if (this.nowTimer) clearInterval(this.nowTimer);
  }
}
