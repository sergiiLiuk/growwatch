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
  link?: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <!-- Weather strip — blue family -->
      <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 mb-4">
        @if (weather()) {
          <span class="text-2xl shrink-0 leading-none">{{ weather()!.conditionIcon }}</span>
          <div class="flex-1 min-w-0">
            <div class="text-[18px] font-medium text-gw-blue-dark leading-tight">{{ weather()!.temperature }}°C</div>
            <div class="text-[11px] text-gray-400 truncate">{{ weather()!.conditionLabel }} · {{ weather()!.city }}</div>
          </div>
          <div class="flex items-center gap-3 shrink-0 text-[11px] text-gw-blue-dark">
            <span>💧 {{ weather()!.humidity }}%</span>
            <span>🌬️ {{ weather()!.windSpeed }}m/s</span>
          </div>
          <span class="text-gray-300 text-xs ml-1">›</span>
        } @else {
          <span class="flex-1 text-[13px] text-gray-300">
            {{ weatherService.loading() ? 'Loading weather…' : 'Weather unavailable' }}
          </span>
        }
      </div>

      <!-- Mood ring — only when plants are registered -->
      @if (plants().length > 0) {
        <div class="flex flex-col items-center mb-4">
          <div class="w-20 h-20 rounded-full flex items-center justify-center mb-3"
               [class]="moodBg()">
            <svg class="w-9 h-9" [class]="moodIconColor()" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3c0 0-6 4-6 9a6 6 0 0012 0c0-5-6-9-6-9z"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="text-[14px] font-medium text-gray-800">{{ mood().label }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ mood().description }}</div>
        </div>

        <!-- Voice bubble — only when action is needed -->
        @if (showAlert()) {
          <div class="p-4 mb-4 rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-[2px]"
               [class]="bubbleBg()">
            <p class="text-[13px] leading-relaxed" [class]="bubbleTextColor()">{{ voiceMessage() }}</p>
          </div>
        }
      }

      <!-- Onboarding card — only when no plants registered -->
      @if (!plantsLoading() && plants().length === 0) {
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-5 mb-4">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-gw-green-dark" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3c0 0-6 4-6 9a6 6 0 0012 0c0-5-6-9-6-9z"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-medium text-gray-800 mb-1">Add your first plant</p>
              <p class="text-[13px] text-gray-500 leading-relaxed">
                Tell GrowWatch what you're growing and you'll get personalised light advice,
                a mood ring, and alerts tailored to your plant's needs.
              </p>
              <a routerLink="/plants"
                 class="inline-block mt-3 text-[13px] font-medium bg-gw-green text-white px-3 py-1.5 rounded-lg hover:bg-gw-green-dark transition-colors">
                + Add a plant
              </a>
            </div>
          </div>
        </div>
      }

      <!-- Sensor metrics -->
      <div class="flex flex-col gap-2">
        @for (metric of metrics(); track metric.key) {
          <div class="bg-white rounded-xl p-4 border-[0.5px] border-gray-200 transition-colors"
               [class]="metric.link ? 'cursor-pointer hover:border-gray-300' : ''"
               [routerLink]="metric.link ?? null">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-base">{{ metric.icon }}</span>
                <span class="text-[13px] text-gray-500">{{ metric.label }}</span>
              </div>
              @if (metric.status !== 'missing') {
                <span class="text-[14px] font-medium text-gray-800">
                  {{ metric.value }}<span class="text-[11px] text-gray-400 ml-0.5">{{ metric.unit }}</span>
                </span>
              } @else {
                <span class="text-[11px] text-gray-300 italic">coming soon</span>
              }
            </div>
            @if (metric.status !== 'missing') {
              <div class="h-0.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500"
                     [class]="metric.status === 'warn' ? 'bg-gw-amber' : 'bg-gw-green'"
                     [style.width.%]="metric.percent">
                </div>
              </div>
              @if (metric.tip) {
                <p class="text-[11px] text-gw-amber-dark mt-1.5">{{ metric.tip }}</p>
              }
              @if (metric.sublabel) {
                <p class="text-[11px] text-gray-400 mt-1.5">{{ metric.sublabel }}</p>
              }
            } @else {
              <div class="h-0.5 bg-gray-50 rounded-full"></div>
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
  plantsLoading = this.plantService.plantsLoading;
  monitoredPlants = computed(() => this.plants().filter(p => p.monitored));
  weather = this.weatherService.weather;

  private hour(): number { return new Date().getHours(); }
  private isNight(): boolean { const h = this.hour(); return h >= 21 || h < 6; }
  private isDawnOrDusk(): boolean { const h = this.hour(); return (h >= 6 && h < 9) || (h >= 18 && h < 21); }

  showAlert = computed(() => {
    const d = this.latestData();
    if (!d || this.monitoredPlants().length === 0) return false;
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
    if (m === 'thriving' || m === 'good') return 'bg-gw-green-light';
    if (m === 'stressed') return 'bg-gw-amber-light';
    if (m === 'critical') return 'bg-gw-red-light';
    return 'bg-gray-100';
  });

  moodIconColor = computed(() => {
    const m = this.mood().mood;
    if (m === 'thriving' || m === 'good') return 'text-gw-green-dark';
    if (m === 'stressed') return 'text-gw-amber-dark';
    if (m === 'critical') return 'text-gw-red-dark';
    return 'text-gray-400';
  });

  bubbleBg = computed(() => {
    const m = this.mood().mood;
    return (m === 'stressed' || m === 'critical') ? 'bg-gw-amber-light' : 'bg-gw-green-light';
  });

  bubbleTextColor = computed(() => {
    const m = this.mood().mood;
    return (m === 'stressed' || m === 'critical') ? 'text-gw-amber-dark' : 'text-gw-green-dark';
  });

  voiceMessage = computed(() => {
    const d = this.latestData();
    const plants = this.monitoredPlants();
    const w = this.weather();
    const plantNames = plants.map(p => p.name).join(', ');

    if (!d) return "Waiting for sensor data. Make sure your ESP32 is connected.";

    const status = d.lightStatus?.status;

    if (status === 'TOO_LOW') {
      if (this.isNight()) return `Low light at night is expected. No action needed.`;
      if (this.isDawnOrDusk()) {
        return this.hour() < 12
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
    const hasPlants = this.monitoredPlants().length > 0;

    const suppressWarn = this.isNight() || this.isDawnOrDusk();
    const lightWarn = hasPlants && d?.lightStatus.status !== 'OPTIMAL' && !suppressWarn;
    const nightlyLow = suppressWarn && d?.lightStatus.status === 'TOO_LOW';

    const lightIcon = this.isNight() ? '🌙' : this.isDawnOrDusk() ? '🌅' : '☀️';

    // At night with low light show a modest fixed bar (sensor active, low is expected)
    // rather than a near-zero bar that looks like a fault
    const lightPct = d
      ? nightlyLow && hasPlants
        ? 25
        : hasPlants
          ? Math.min(d.lightStatus.percentageOfOptimal, 100)
          : Math.min(Math.round((d.lightLevel / 60000) * 100), 100)
      : 0;

    const lightSublabel = nightlyLow && hasPlants
      ? (this.isNight() ? 'Sensor active · nighttime' : 'Sensor active · low light period')
      : (!hasPlants && d ? this.luxIntensityLabel(d.lightLevel) : undefined);

    return [
      {
        key: 'light', label: 'Light', icon: lightIcon,
        value: d ? Math.round(d.lightLevel).toString() : '—',
        unit: 'lux',
        percent: lightPct,
        status: d ? (lightWarn ? 'warn' : 'ok') : 'missing',
        tip: lightWarn && d && hasPlants ? d.lightStatus.message : undefined,
        sublabel: lightSublabel,
        link: '/light',
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
