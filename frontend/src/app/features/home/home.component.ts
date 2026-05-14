import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SensorService, SensorData, MoodInfo } from '../../core/services/sensor.service';
import { PlantService } from '../../core/services/plant.service';
import { WeatherService } from '../../core/services/weather.service';

interface Metric {
  key: string;
  label: string;
  icon: string;
  value: string;
  unit: string;
  percent: number;
  status: 'ok' | 'warn' | 'missing';
  tip?: string;
  sublabel?: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <!-- Weather card -->
      <div class="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 mb-6">
        @if (weather()) {
          <span class="text-3xl shrink-0 leading-none">{{ weather()!.conditionIcon }}</span>
          <div class="flex-1 min-w-0">
            <div class="text-lg font-semibold text-gray-900 leading-tight">{{ weather()!.temperature }}°C</div>
            <div class="text-xs text-gray-400 truncate">{{ weather()!.conditionLabel }} · {{ weather()!.city }}</div>
          </div>
          <div class="flex items-center gap-2.5 shrink-0 text-xs text-gray-500">
            <span>💧 {{ weather()!.humidity }}%</span>
            <span>🌬️ {{ weather()!.windSpeed }}m/s</span>
          </div>
          <span class="text-gray-300 text-sm ml-0.5">›</span>
        } @else {
          <span class="flex-1 text-sm text-gray-300">
            {{ weatherService.loading() ? 'Loading weather…' : 'Weather unavailable' }}
          </span>
        }
        <div class="w-1.5 h-1.5 rounded-full shrink-0 ml-1" [class]="sensorOnline() ? 'bg-green-400' : 'bg-red-400'"></div>
      </div>

      <!-- Mood ring — only when plants are registered -->
      @if (plants().length > 0) {
        <div class="flex flex-col items-center mb-6">
          <div class="w-20 h-20 rounded-full flex items-center justify-center mb-3 transition-colors"
               [class]="moodBg()">
            <span class="text-3xl">{{ moodEmoji() }}</span>
          </div>
          <div class="text-base font-medium text-gray-800">{{ mood().label }}</div>
          <div class="text-xs text-gray-400 mt-0.5">{{ mood().description }}</div>
        </div>

        <!-- Alert bubble — only when action is needed -->
        @if (showAlert()) {
          <div class="rounded-2xl p-4 mb-6 transition-colors" [class]="voiceBubbleBg()">
            <p class="text-sm leading-relaxed" [class]="voiceTextColor()">{{ voiceMessage() }}</p>
          </div>
        }
      }

      <!-- Onboarding card — only when no plants registered -->
      @if (plants().length === 0) {
        <div class="bg-green-50 border border-green-100 rounded-2xl p-5 mb-5">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-xl">
              🌱
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 mb-1">Add your first plant</p>
              <p class="text-xs text-gray-500 leading-relaxed">
                Tell GrowWatch what you're growing and you'll get personalised light advice,
                a mood ring, and alerts tailored to your plant's needs.
              </p>
              <a routerLink="/plants"
                 class="inline-block mt-3 text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
                + Add a plant
              </a>
            </div>
          </div>
        </div>
      }

      <!-- Metrics grid -->
      <div class="flex flex-col gap-2">
        @for (metric of metrics(); track metric.key) {
          <div class="bg-white rounded-xl p-3.5 border border-gray-100">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-base">{{ metric.icon }}</span>
                <span class="text-sm text-gray-500">{{ metric.label }}</span>
              </div>
              @if (metric.status !== 'missing') {
                <span class="text-sm font-medium text-gray-800">
                  {{ metric.value }}<span class="text-xs text-gray-400 ml-0.5">{{ metric.unit }}</span>
                </span>
              } @else {
                <span class="text-xs text-gray-300 italic">coming soon</span>
              }
            </div>
            @if (metric.status !== 'missing') {
              <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500"
                     [class]="metric.status === 'warn' ? 'bg-amber-400' : 'bg-green-400'"
                     [style.width.%]="metric.percent">
                </div>
              </div>
              @if (metric.tip) {
                <p class="text-xs text-amber-600 mt-1.5">{{ metric.tip }}</p>
              }
              @if (metric.sublabel) {
                <p class="text-xs text-gray-400 mt-1.5">{{ metric.sublabel }}</p>
              }
            } @else {
              <div class="h-1.5 bg-gray-50 rounded-full"></div>
            }
          </div>
        }
      </div>

    </div>
  `,
})
export class HomeComponent implements OnInit, OnDestroy {
  private sensorService = inject(SensorService);
  private plantService = inject(PlantService);
  weatherService = inject(WeatherService);
  private sub?: Subscription;
  private weatherTimer?: ReturnType<typeof setInterval>;

  latestData = signal<SensorData | null>(null);
  plants = this.plantService.plants;
  weather = this.weatherService.weather;

  private hour(): number { return new Date().getHours(); }
  private isNight(): boolean { const h = this.hour(); return h >= 21 || h < 6; }
  private isDawnOrDusk(): boolean { const h = this.hour(); return (h >= 6 && h < 9) || (h >= 18 && h < 21); }

  showAlert = computed(() => {
    const d = this.latestData();
    if (!d || this.plants().length === 0) return false;
    if (this.isNight() || this.isDawnOrDusk()) return false;
    const status = d.lightStatus?.status;
    return status === 'TOO_LOW' || status === 'TOO_HIGH';
  });

  mood = computed<MoodInfo>(() => {
    const base = this.sensorService.getMood(this.latestData());
    if (base.mood === 'stressed' && this.isNight()) {
      return { mood: 'good', label: 'Resting', description: 'Low light is expected at night' };
    }
    if (base.mood === 'stressed' && this.isDawnOrDusk()) {
      return { mood: 'good', label: 'Low light', description: 'Light levels are low for this time of day' };
    }
    return base;
  });

  sensorOnline = computed(() => {
    const d = this.latestData();
    if (!d) return false;
    const ms = Date.now() - new Date(d.timestamp).getTime();
    if (isNaN(ms)) return true;
    return ms < 30000;
  });

  moodBg = computed(() => {
    const m = this.mood().mood;
    if (m === 'thriving') return 'bg-green-100';
    if (m === 'good') return 'bg-emerald-100';
    if (m === 'stressed') return 'bg-amber-100';
    if (m === 'critical') return 'bg-red-100';
    return 'bg-gray-100';
  });

  moodEmoji = computed(() => {
    const m = this.mood().mood;
    if (m === 'thriving') return '🌿';
    if (m === 'good') return '🌱';
    if (m === 'stressed') return '🍂';
    if (m === 'critical') return '🥀';
    return '💤';
  });

  voiceBubbleBg = computed(() => {
    const m = this.mood().mood;
    if (m === 'thriving' || m === 'good') return 'bg-green-50';
    if (m === 'stressed') return 'bg-amber-50';
    if (m === 'critical') return 'bg-red-50';
    return 'bg-gray-50';
  });

  voiceTextColor = computed(() => {
    const m = this.mood().mood;
    if (m === 'thriving' || m === 'good') return 'text-green-800';
    if (m === 'stressed') return 'text-amber-800';
    if (m === 'critical') return 'text-red-800';
    return 'text-gray-500';
  });

  voiceMessage = computed(() => {
    const d = this.latestData();
    const plants = this.plants();
    const w = this.weather();
    const plantNames = plants.map(p => p.name).join(', ');

    if (!d) return "Waiting for sensor data. Make sure your ESP32 is connected.";

    const status = d.lightStatus?.status;

    if (status === 'TOO_LOW') {
      if (this.isNight()) {
        return `Low light at night is expected. No action needed.`;
      }
      if (this.isDawnOrDusk()) {
        const h = this.hour();
        return h < 12
          ? `Light is low for early morning. Check again later in the day.`
          : `Light is dropping as expected for this time of day.`;
      }
      if (w && w.cloudCover >= 65) {
        return `Light is below the optimal range for ${plantNames}. Heavy cloud cover (${w.cloudCover}%) is limiting available light.`;
      }
      if (w && w.cloudCover >= 35) {
        return `Light is below the optimal range for ${plantNames}. Partial cloud cover is reducing available light.`;
      }
      return `Light is below the optimal range for ${plantNames}. Consider supplemental lighting.`;
    }

    if (status === 'TOO_HIGH') {
      return `Light exceeds the optimal range for ${plantNames}. Consider adding shade.`;
    }

    if (status === 'OPTIMAL') {
      const humidityNote = d.humidity != null && d.humidity < 50 ? ' Humidity is below 50% — consider misting.' : '';
      return `Light is within the optimal range for ${plantNames}.${humidityNote}`;
    }

    return `Monitoring ${plantNames}.`;
  });

  private luxIntensityLabel(lux: number): string {
    if (lux < 1000)  return 'Very dim — like a cloudy indoor day';
    if (lux < 5000)  return 'Dim — shaded outdoor conditions';
    if (lux < 20000) return 'Moderate — bright indirect light';
    if (lux < 40000) return 'Bright — partial sun';
    return 'Intense — full direct sunlight';
  }

  metrics = computed<Metric[]>(() => {
    const d = this.latestData();
    const hasPlants = this.plants().length > 0;

    const lightPct = d
      ? hasPlants
        ? Math.min(d.lightStatus.percentageOfOptimal, 100)
        : Math.min(Math.round((d.lightLevel / 60000) * 100), 100)
      : 0;
    const suppressWarn = this.isNight() || this.isDawnOrDusk();
    const lightWarn = hasPlants && d?.lightStatus.status !== 'OPTIMAL' && !suppressWarn;

    return [
      {
        key: 'light', label: 'Light', icon: '☀️',
        value: d ? Math.round(d.lightLevel).toString() : '—',
        unit: 'lux',
        percent: lightPct,
        status: d ? (lightWarn ? 'warn' : 'ok') : 'missing',
        tip: lightWarn && d && hasPlants ? d.lightStatus.message : undefined,
        sublabel: !hasPlants && d ? this.luxIntensityLabel(d.lightLevel) : undefined,
      },
      {
        key: 'temp', label: 'Temperature', icon: '🌡️',
        value: d?.temperature != null ? d.temperature.toFixed(1) : '—',
        unit: '°C',
        percent: d?.temperature != null ? Math.min(((d.temperature - 10) / 25) * 100, 100) : 0,
        status: d?.temperature != null ? (d.temperature < 15 || d.temperature > 30 ? 'warn' : 'ok') : 'missing',
      },
      {
        key: 'humidity', label: 'Humidity', icon: '💧',
        value: d?.humidity != null ? Math.round(d.humidity).toString() : '—',
        unit: '%',
        percent: d?.humidity ?? 0,
        status: d?.humidity != null ? (d.humidity < 40 || d.humidity > 80 ? 'warn' : 'ok') : 'missing',
        tip: d?.humidity != null && d.humidity < 40 ? 'Below optimal — consider misting' : undefined,
      },
      {
        key: 'co2', label: 'CO₂', icon: '🌬️',
        value: d?.co2 != null ? Math.round(d.co2).toString() : '—',
        unit: 'ppm',
        percent: d?.co2 != null ? Math.min((d.co2 / 2000) * 100, 100) : 0,
        status: d?.co2 != null ? (d.co2 > 1500 ? 'warn' : 'ok') : 'missing',
      },
      {
        key: 'pressure', label: 'Pressure', icon: '🔵',
        value: d?.pressure != null ? Math.round(d.pressure).toString() : '—',
        unit: 'hPa',
        percent: d?.pressure != null ? Math.min(((d.pressure - 950) / 100) * 100, 100) : 0,
        status: d?.pressure != null ? 'ok' : 'missing',
      },
    ];
  });

  ngOnInit() {
    this.sensorService.getLatestSensorData().subscribe(d => this.latestData.set(d));
    this.sub = this.sensorService.subscribeToSensorData().subscribe(d => {
      if (d) this.latestData.set(d);
    });
    this.weatherService.fetchWeather();
    this.weatherTimer = setInterval(() => this.weatherService.fetchWeather(), 30 * 60 * 1000);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.weatherTimer) clearInterval(this.weatherTimer);
  }
}
