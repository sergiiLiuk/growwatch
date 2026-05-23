import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SensorService, HourlySensorData } from '../../core/services/sensor.service';
import { PlantService } from '../../core/services/plant.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { EmptyStateComponent } from '../../shared/components/atoms/empty-state.component';

interface DigestItem {
  icon: string;
  label: string;
  message: string;
  detail: string;
  status: 'ok' | 'warn';
}

@Component({
  selector: 'app-digest',
  imports: [DatePipe, EmptyStateComponent],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">Daily digest</h1>
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
        <app-empty-state emoji="📋" title="No data yet for today."
                         subtitle="Check back after your sensors have been running for a few hours." />
      } @else {

        <!-- Summary bubble -->
        <div class="bg-gw-green-light p-4 mb-5 rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-[2px]">
          <p class="text-[13px] text-gw-green-dark leading-relaxed">{{ summaryMessage() }}</p>
        </div>

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

  today = new Date();
  loading = signal(true);
  hourlyData = signal<HourlySensorData[]>([]);
  plants = this.plantService.plants;
  private monitoredPlants = computed(() => this.plants().filter(p => p.monitored));

  digestItems = computed<DigestItem[]>(() => {
    const data = this.hourlyData();
    if (data.length === 0) return [];

    const items: DigestItem[] = [];

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
      const direction = minTemp < userMin && maxTemp > userMax ? 'both too cold and too hot'
                      : minTemp < userMin ? 'below your minimum'
                      : maxTemp > userMax ? 'above your maximum'
                      : '';
      items.push({
        icon: '🌡️', label: 'Temperature', status: tempOk ? 'ok' : 'warn',
        message: tempOk
          ? `Temperature stayed within your ${userMin}–${userMax}°C range all day.`
          : `Temperature went ${direction} on ${outOfRangeHours} hour${outOfRangeHours === 1 ? '' : 's'} today (range ${userMin}–${userMax}°C).`,
        detail: `range ${minTemp.toFixed(1)}–${maxTemp.toFixed(1)}°C · avg ${avgTemp.toFixed(1)}°C`,
      });
    }

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
    const plants = this.monitoredPlants();
    const plantNames = plants.length > 0 ? plants.map(p => p.name).join(' and ') : 'your plants';
    const warnings = items.filter(i => i.status === 'warn').length;

    if (warnings === 0) return `A good day for ${plantNames}. All conditions were within comfortable range.`;
    if (warnings === 1) return `Mostly a good day, but one thing needs your attention. Check the details below.`;
    return `${warnings} conditions were outside the ideal range today. ${plantNames} would appreciate some adjustments tomorrow.`;
  });

  ngOnInit() {
    this.sensorService.getHourlyData(24).subscribe(data => {
      const todayStr = new Date().toDateString();
      this.hourlyData.set(data.filter(d => new Date(d.hour).toDateString() === todayStr));
      this.loading.set(false);
    });
  }
}
