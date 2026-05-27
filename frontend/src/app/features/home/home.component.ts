import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SensorCardComponent } from '../../shared/components/atoms/sensor-card.component';
import { ForecastStripComponent } from '../../shared/components/atoms/forecast-strip.component';
import { SensorService, SensorData, HourlySensorData, MoodInfo, PLANT_LIGHT_RANGES } from '../../core/services/sensor.service';
import { PlantService, Plant } from '../../core/services/plant.service';
import { WeatherService } from '../../core/services/weather.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { isNight, isDawnOrDusk } from '../../core/utils/time';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import dayjs from 'dayjs';

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
  imports: [RouterLink, SensorCardComponent, ForecastStripComponent, IconComponent, TranslocoDirective],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-6" *transloco="let t">

      <!-- Hero row: weather + phase -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">

        <!-- Weather card -->
        <div class="bg-gw-surface border border-gw-border rounded-2xl p-4 flex items-center gap-3">
          @if (weather()) {
            <span class="text-3xl shrink-0 leading-none">{{ weather()!.conditionIcon }}</span>
            <div class="flex-1 min-w-0">
              <div class="font-data text-[22px] font-medium text-gw-blue-dark leading-none">{{ weather()!.temperature }}°C</div>
              <div class="text-[11px] text-gray-400 truncate mt-0.5">{{ weather()!.conditionLabel }} · {{ weather()!.city }}</div>
            </div>
            <div class="flex flex-col items-end gap-0.5 shrink-0 text-[11px] text-gw-blue-dark">
              <span>💧 {{ weather()!.humidity }}%</span>
              <span>🌬️ {{ weather()!.windSpeed }} m/s</span>
              <span>🔵 {{ weather()!.pressure }} hPa</span>
            </div>
          } @else {
            <span class="flex-1 text-[13px] text-gray-400">
              {{ weatherService.loading() ? t('home.loadingWeather') : t('home.weatherUnavailable') }}
            </span>
          }
        </div>

        <!-- Phase / mood card -->
        <div class="rounded-2xl p-4 border border-transparent flex flex-col" [class]="moodBg()">
          <div class="flex items-start justify-between gap-2 mb-1">
            <span class="text-[10px] font-semibold tracking-widest uppercase opacity-50" [class]="moodIconColor()">{{ t('home.currentPhase') }}</span>
            @if (co2Status() === 'warn') {
              <span class="text-[10px] font-medium bg-gw-amber text-white px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">{{ t('home.co2Elevated') }}</span>
            }
          </div>
          <div class="font-display text-[22px] font-bold leading-tight" [class]="moodIconColor()">{{ mood().label }}</div>
          @if (mood().mood === 'offline') {
            <div class="text-[12px] mt-0.5 opacity-70" [class]="moodIconColor()">{{ mood().description }}</div>
          } @else if (phaseCountdown()) {
            <div class="text-[12px] mt-0.5 opacity-70" [class]="moodIconColor()">{{ phaseCountdown() }}</div>
          } @else {
            <div class="text-[12px] mt-0.5 opacity-70" [class]="moodIconColor()">{{ mood().description }}</div>
          }
          @if (showAlert()) {
            <p class="text-[11px] mt-2 leading-relaxed opacity-80" [class]="moodIconColor()">{{ voiceMessage() }}</p>
          }
          <!-- Subtle divider at bottom matching mockup -->
          <div class="mt-3 h-px opacity-20 rounded-full" [class]="moodIconColor() === 'text-gw-green-dark' ? 'bg-gw-green-dark' : 'bg-gw-amber-dark'"></div>
        </div>

      </div>

      <!-- Onboarding -->
      @if (!plantsLoading() && plants().length === 0) {
        <div class="bg-gw-surface border border-gw-border rounded-2xl p-5 mb-5">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
              <app-icon name="plants" class="w-5 h-5 text-gw-green-dark" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-display text-[15px] font-semibold text-gw-green-dark mb-1">{{ t('home.addYourFirstPlant') }}</p>
              <p class="text-[13px] text-gray-500 leading-relaxed">
                {{ t('home.addYourFirstPlantBody') }}
              </p>
              <a routerLink="/plants"
                 class="inline-block mt-3 text-[13px] font-medium bg-gw-green text-white px-4 py-2 rounded-xl hover:bg-gw-green-dark transition-colors">
                {{ t('home.addAPlant') }}
              </a>
            </div>
          </div>
        </div>
      }

      <!-- Sensors section -->
      <div class="mb-5">
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">{{ t('home.sensors') }}</p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <app-sensor-card
            [label]="t('home.temp')"
            [value]="tempValue()"
            unit="°C"
            [status]="tempStatus()"
            [sparkValues]="tempSpark()"
            [rangeMin]="tempRange().min"
            [rangeMax]="tempRange().max"
            link="/temperature" />
          <app-sensor-card
            [label]="t('home.humidity')"
            [value]="humidValue()"
            unit="%"
            [status]="humidStatus()"
            [sparkValues]="humidSpark()"
            [rangeMin]="humidRange().min"
            [rangeMax]="humidRange().max"
            link="/humidity" />
          <app-sensor-card
            [label]="t('home.co2')"
            [value]="co2Value()"
            unit="ppm"
            [status]="co2Status()"
            [sparkValues]="co2Spark()"
            [rangeMin]="co2Range().min"
            [rangeMax]="co2Range().max" />
          <app-sensor-card
            [label]="t('home.light')"
            [value]="lightValue()"
            unit="lx"
            [status]="lightStatus()"
            [sparkValues]="lightSpark()"
            [rangeMin]="lightRange().min"
            [rangeMax]="lightRange().max"
            link="/light" />
        </div>
      </div>

      <!-- 3-day forecast strip -->
      <div class="mb-5">
        <app-forecast-strip />
      </div>

      <!-- Bottom: Activity + Plants — stacked on mobile/tablet, two columns on lg+ -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- Recent activity -->
        <div>
          <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">{{ t('home.recentActivity') }}</p>
          <div class="bg-gw-surface border border-gw-border rounded-2xl divide-y divide-gw-border">
            @if (activityFeed().length === 0) {
              <p class="text-[12px] text-gray-400 p-4">{{ t('home.noEventsLast24h') }}</p>
            }
            @for (event of activityFeed(); track event.time + event.label) {
              <div class="flex items-center gap-3 px-4 py-3">
                <span class="w-1.5 h-1.5 rounded-full shrink-0" [class]="event.ok ? 'bg-gw-green' : 'bg-gw-amber'"></span>
                <span class="text-[11px] text-gray-400 tabular-nums shrink-0">{{ event.time }}</span>
                <span class="text-[12px] text-gray-700 flex-1">{{ event.label }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Plants strip -->
        <div>
          <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">{{ t('nav.plants') }}</p>
          <div class="flex gap-3 overflow-x-auto lg:overflow-x-visible lg:flex-wrap pb-1 -mx-1 px-1" style="scrollbar-width:none">
            @for (plant of plants(); track plant.id) {
              <a [routerLink]="['/plants', plant.id]"
                 class="flex-shrink-0 w-20 bg-gw-surface border border-gw-border rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center hover:border-gray-300 transition-colors">
                <span class="text-2xl leading-none">{{ plantEmoji(plant) }}</span>
                <span class="text-[11px] font-medium text-gray-700 truncate w-full text-center">{{ plant.name }}</span>
                <span class="text-[10px]" [class]="plantStatusClass(plant)">{{ plantStatus(plant) }}</span>
              </a>
            }
            <a routerLink="/plants"
               class="flex-shrink-0 w-20 bg-gw-surface border border-dashed border-gw-border rounded-2xl p-3 flex flex-col items-center justify-center gap-1 text-center hover:border-gray-400 transition-colors">
              <span class="text-xl text-gray-300">+</span>
              <span class="text-[11px] text-gray-400">{{ t('home.addPlant') }}</span>
            </a>
          </div>
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
  private transloco = inject(TranslocoService);
  private localeKey = signal(this.transloco.getActiveLang());
  private sub?: Subscription;
  private weatherTimer?: ReturnType<typeof setInterval>;

  latestData = signal<SensorData | null>(null);
  hourlyData = signal<HourlySensorData[]>([]);
  plants = this.plantService.plants;
  plantsLoading = this.plantService.plantsLoading;
  monitoredPlants = computed(() => this.plants().filter(p => p.monitored));
  weather = this.weatherService.weather;

  // ── Phase countdown ──────────────────────────────────────────────────────────

  phaseCountdown = computed<string>(() => {
    this.localeKey();
    const w = this.weather();
    if (!w?.sunrise || !w?.sunset) return '';
    const now = new Date();
    const sunrise = new Date(w.sunrise);
    const sunset  = new Date(w.sunset);

    let target: Date;
    let key: 'home.lightCycleStartsIn' | 'home.lightCycleEndsIn';

    if (now < sunrise) {
      target = sunrise; key = 'home.lightCycleStartsIn';
    } else if (now < sunset) {
      target = sunset;  key = 'home.lightCycleEndsIn';
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

  showAlert = computed(() => {
    const d = this.latestData();
    if (!d || this.monitoredPlants().length === 0) return false;
    if (isNight(this.weather()?.sunrise, this.weather()?.sunset) || isDawnOrDusk(this.weather()?.sunrise, this.weather()?.sunset)) return false;
    const s = d.lightStatus?.status;
    return s === 'TOO_LOW' || s === 'TOO_HIGH';
  });

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

  voiceMessage = computed(() => {
    this.localeKey();
    const t = (key: string, params?: Record<string, any>) => this.transloco.translate(key, params);
    const d = this.latestData();
    const plants = this.monitoredPlants();
    const w = this.weather();
    const names = plants.map(p => p.name).join(', ');
    if (!d) return t('voice.waitingSensor');
    const s = d.lightStatus?.status;
    if (s === 'TOO_LOW') {
      const sr = w?.sunrise; const ss = w?.sunset;
      if (isNight(sr, ss)) return t('voice.lowLightNight');
      if (isDawnOrDusk(sr, ss)) return new Date().getHours() < 12 ? t('voice.lowLightMorning') : t('voice.lowLightDropping');
      if (w && w.cloudCover >= 65) return t('voice.heavyCloudCover', { cover: w.cloudCover, plants: names });
      if (w && w.cloudCover >= 35) return t('voice.partialCloudCover', { plants: names });
      return t('voice.lightBelowOptimal', { plants: names });
    }
    if (s === 'TOO_HIGH') return t('voice.lightExceedsOptimal', { plants: names });
    if (s === 'OPTIMAL') {
      return d.humidity != null && d.humidity < 50
        ? t('voice.lightOptimalLowHum', { plants: names })
        : t('voice.lightOptimal', { plants: names });
    }
    return t('voice.monitoring', { plants: names });
  });

  // ── Sensor values ─────────────────────────────────────────────────────────────

  // Each value/status falls back to the most recent hourly average when no live reading is available.
  // The mood card (which depends on latestData being null to detect "waiting"/"silent") is unaffected.

  lightValue = computed(() => {
    const v = this.latestData()?.lightLevel ?? this.hourlyData()[0]?.avgLight;
    return v != null ? Math.round(v).toString() : '—';
  });

  lightStatus = computed<'ok' | 'warn' | 'missing'>(() => {
    const status = this.latestData()?.lightStatus?.status ?? this.hourlyData()[0]?.lightStatus?.status;
    if (!status) return 'missing';
    const suppressWarn = isNight(this.weather()?.sunrise, this.weather()?.sunset) || isDawnOrDusk(this.weather()?.sunrise, this.weather()?.sunset);
    return this.monitoredPlants().length > 0 && status !== 'OPTIMAL' && !suppressWarn ? 'warn' : 'ok';
  });

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

  co2Value = computed(() => {
    const c = this.latestData()?.co2 ?? this.hourlyData()[0]?.avgCo2;
    return c != null ? Math.round(c).toString() : '—';
  });
  co2Status = computed<'ok' | 'warn' | 'missing'>(() => {
    const c = this.latestData()?.co2 ?? this.hourlyData()[0]?.avgCo2;
    if (c == null) return 'missing';
    return c > 1500 ? 'warn' : 'ok';
  });

  // ── Sparklines ────────────────────────────────────────────────────────────────

  private chronological = computed(() => [...this.hourlyData()].reverse());

  lightSpark  = computed(() => this.chronological().map(h => h.avgLight).filter((v): v is number => v != null));
  tempSpark   = computed(() => this.chronological().map(h => h.avgTemperature).filter((v): v is number => v != null));
  humidSpark  = computed(() => this.chronological().map(h => h.avgHumidity).filter((v): v is number => v != null));
  co2Spark    = computed(() => this.chronological().map(h => h.avgCo2).filter((v): v is number => v != null));

  // ── Range labels (calibration cue under sparkline — shows optimal range, not historical) ──

  tempRange  = computed(() => ({ min: '15°', max: '30°' }));
  humidRange = computed(() => ({
    min: `${this.userSettings.effectiveHumidityMin()}%`,
    max: `${this.userSettings.effectiveHumidityMax()}%`,
  }));
  co2Range   = computed(() => ({ min: '0', max: '1500' }));

  // Light range depends on which plants are being monitored. With multiple plants,
  // we show the tightest intersection (highest min, lowest max) so all plants are satisfied.
  // Falls back to the backend default (TOMATO) when nothing is monitored.
  lightRange = computed(() => {
    const ranges = this.monitoredPlants()
      .map(p => PLANT_LIGHT_RANGES[p.type])
      .filter((r): r is { min: number; max: number; label: string } => !!r);
    if (ranges.length === 0) {
      const def = PLANT_LIGHT_RANGES['TOMATO'];
      return { min: def.min.toString(), max: def.max.toString() };
    }
    return {
      min: Math.max(...ranges.map(r => r.min)).toString(),
      max: Math.min(...ranges.map(r => r.max)).toString(),
    };
  });

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

      // CO₂ threshold crossings
      if (prev.avgCo2 != null && curr.avgCo2 != null) {
        if (prev.avgCo2 <= 1500 && curr.avgCo2 > 1500)
          events.push({ time, label: this.transloco.translate('home.co2Rising'), ok: false });
        else if (prev.avgCo2 > 1500 && curr.avgCo2 <= 1500)
          events.push({ time, label: this.transloco.translate('home.co2Normal'), ok: true });
      }

      // Light on/off transitions
      if (prev.avgLight != null && curr.avgLight != null) {
        if (prev.avgLight < 50 && curr.avgLight >= 50)
          events.push({ time, label: this.transloco.translate('home.lightCycleStarted'), ok: true });
        else if (prev.avgLight >= 50 && curr.avgLight < 50)
          events.push({ time, label: this.transloco.translate('home.lightCycleEnded'), ok: true });
      }
    }

    // Add a baseline "all sensors" event from earliest hour if no other events
    if (events.length === 0 && data.length > 0) {
      const first = data[0];
      const allOk = (first.avgCo2 == null || first.avgCo2 <= 1500) &&
                    (first.avgTemperature == null || (first.avgTemperature >= 15 && first.avgTemperature <= 30));
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
    const days = Math.max(0, dayjs().diff(plant.plantedDate, 'day'));
    return this.transloco.translate('home.dayCounter', { n: days });
  }

  plantStatusClass(plant: Plant): string {
    if (plant.monitored) {
      const m = this.mood().mood;
      if (m === 'thriving' || m === 'good') return 'text-gw-green-dark';
      if (m === 'stressed' || m === 'critical') return 'text-gw-amber-dark';
    }
    return 'text-gray-400';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ngOnInit() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));
    this.sensorService.getLatestSensorData().subscribe(d => this.latestData.set(d));
    this.sub = this.sensorService.subscribeToSensorData().subscribe(d => { if (d) this.latestData.set(d); });
    this.sensorService.getHourlyData(24).subscribe(d => this.hourlyData.set(d));
    this.weatherService.fetchWeather();
    this.weatherService.fetchForecast();
    this.weatherTimer = setInterval(() => {
      this.weatherService.fetchWeather();
      this.weatherService.fetchForecast();
    }, 30 * 60 * 1000);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.weatherTimer) clearInterval(this.weatherTimer);
  }
}
