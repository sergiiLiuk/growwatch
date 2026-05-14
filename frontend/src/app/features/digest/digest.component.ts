import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SensorService, HourlySensorData } from '../../core/services/sensor.service';
import { PlantService } from '../../core/services/plant.service';

interface DigestItem {
  icon: string;
  label: string;
  message: string;
  detail: string;
  status: 'ok' | 'warn';
}

@Component({
  selector: 'app-digest',
  imports: [CommonModule, DatePipe],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-lg font-medium text-gray-800">Daily digest</h1>
          <p class="text-xs text-gray-400 mt-0.5">{{ today | date:'EEEE, d MMMM' }}</p>
        </div>
      </div>

      @if (loading()) {
        <div class="flex flex-col gap-3">
          @for (i of [1,2,3,4]; track i) {
            <div class="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse">
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
        <div class="text-center py-16">
          <div class="text-4xl mb-3">📋</div>
          <p class="text-sm text-gray-500">No data yet for today.</p>
          <p class="text-xs text-gray-400 mt-1">Check back after your sensors have been running for a few hours.</p>
        </div>
      } @else {

        <!-- Summary bubble -->
        <div class="bg-green-50 rounded-2xl p-4 mb-5">
          <p class="text-sm text-green-800 leading-relaxed">{{ summaryMessage() }}</p>
        </div>

        <!-- Digest items -->
        <div class="flex flex-col gap-3">
          @for (item of digestItems(); track item.label) {
            <div class="bg-white rounded-2xl p-4 border border-gray-100 flex gap-3">
              <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-lg"
                   [class]="item.status === 'ok' ? 'bg-green-50' : 'bg-amber-50'">
                {{ item.icon }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium text-gray-600 mb-0.5">{{ item.label }}</div>
                <div class="text-sm text-gray-800 leading-relaxed">{{ item.message }}</div>
                <div class="text-xs text-gray-400 mt-1">{{ item.detail }}</div>
              </div>
            </div>
          }
        </div>

        <!-- Reading quality -->
        @if (readingQuality() !== null) {
          <div class="mt-4 flex items-center gap-2 px-1">
            <div class="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-green-400 rounded-full" [style.width.%]="readingQuality()"></div>
            </div>
            <span class="text-xs text-gray-400">{{ readingQuality() }}% signal quality today</span>
          </div>
        }
      }
    </div>
  `,
})
export class DigestComponent implements OnInit {
  private sensorService = inject(SensorService);
  private plantService = inject(PlantService);

  today = new Date();
  loading = signal(true);
  hourlyData = signal<HourlySensorData[]>([]);

  plants = this.plantService.plants;

  digestItems = computed<DigestItem[]>(() => {
    const data = this.hourlyData();
    if (data.length === 0) return [];

    const items: DigestItem[] = [];

    // Light
    const avgLight = data.reduce((s, d) => s + d.avgLight, 0) / data.length;
    const maxLight = Math.max(...data.map(d => d.maxLight));
    const maxHour = data.find(d => d.maxLight === maxLight);
    const optimalHours = data.filter(d => d.lightStatus?.status === 'OPTIMAL').length;
    const lightOk = optimalHours >= data.length * 0.5;

    items.push({
      icon: '☀️',
      label: 'Light',
      status: lightOk ? 'ok' : 'warn',
      message: lightOk
        ? `Good light day — ${optimalHours}h of optimal conditions for your plants.`
        : `Light was below optimal for most of the day. Consider supplemental lighting.`,
      detail: `avg ${Math.round(avgLight)} lux · peak ${Math.round(maxLight)} lux${maxHour ? ' at ' + new Date(maxHour.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`,
    });

    // Temperature (if available)
    const hasTemp = data.some(d => d.avgTemperature != null);
    if (hasTemp) {
      const avgTemp = data.filter(d => d.avgTemperature != null).reduce((s, d) => s + d.avgTemperature!, 0) / data.length;
      const minTemp = Math.min(...data.filter(d => d.minTemperature != null).map(d => d.minTemperature!));
      const maxTemp = Math.max(...data.filter(d => d.maxTemperature != null).map(d => d.maxTemperature!));
      const tempOk = minTemp >= 15 && maxTemp <= 30;
      items.push({
        icon: '🌡️', label: 'Temperature', status: tempOk ? 'ok' : 'warn',
        message: tempOk
          ? `Temperature was stable all day. No heat stress detected.`
          : `Temperature went outside the comfort zone. Keep an eye on ventilation.`,
        detail: `range ${minTemp.toFixed(1)}–${maxTemp.toFixed(1)}°C · avg ${avgTemp.toFixed(1)}°C`,
      });
    }

    // Humidity (if available)
    const hasHumidity = data.some(d => d.avgHumidity != null);
    if (hasHumidity) {
      const avgHum = data.filter(d => d.avgHumidity != null).reduce((s, d) => s + d.avgHumidity!, 0) / data.length;
      const minHum = Math.min(...data.filter(d => d.minHumidity != null).map(d => d.minHumidity!));
      const humOk = minHum >= 40;
      items.push({
        icon: '💧', label: 'Humidity', status: humOk ? 'ok' : 'warn',
        message: humOk
          ? `Humidity stayed comfortable throughout the day.`
          : `Humidity dipped below 40% — your plants prefer above 50%. Consider watering tomorrow.`,
        detail: `avg ${Math.round(avgHum)}% · low ${Math.round(minHum)}%`,
      });
    }

    // Pressure (if available)
    const hasPressure = data.some(d => d.avgPressure != null);
    if (hasPressure) {
      const avgPressure = data.filter(d => d.avgPressure != null).reduce((s, d) => s + d.avgPressure!, 0) / data.length;
      items.push({
        icon: '🔵', label: 'Pressure', status: 'ok',
        message: `Pressure was steady. No weather stress detected.`,
        detail: `avg ${Math.round(avgPressure)} hPa`,
      });
    }

    return items;
  });

  summaryMessage = computed(() => {
    const items = this.digestItems();
    const plants = this.plants();
    const plantNames = plants.length > 0 ? plants.map(p => p.name).join(' and ') : 'your plants';
    const warnings = items.filter(i => i.status === 'warn').length;

    if (warnings === 0) return `A good day for ${plantNames}. All conditions were within comfortable range.`;
    if (warnings === 1) return `Mostly a good day, but one thing needs your attention. Check the details below.`;
    return `${warnings} conditions were outside the ideal range today. ${plantNames} would appreciate some adjustments tomorrow.`;
  });

  readingQuality = computed(() => {
    const data = this.hourlyData();
    if (data.length === 0) return null;
    const total = data.reduce((s, d) => s + d.readingCount, 0);
    const expected = data.length * 720; // 720 readings per hour at 5s intervals
    return Math.round((total / expected) * 100);
  });

  ngOnInit() {
    this.sensorService.getHourlyData(24).subscribe(data => {
      // Filter to today only
      const todayStr = new Date().toDateString();
      const todayData = data.filter(d => new Date(d.hour).toDateString() === todayStr);
      this.hourlyData.set(todayData);
      this.loading.set(false);
    });
  }
}
