import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { SensorService, SensorData } from '../../core/services/sensor.service';
import { PlantService } from '../../core/services/plant.service';

export interface Alert {
  id: string;
  type: 'info' | 'warn' | 'danger';
  title: string;
  message: string;
  timestamp: Date;
}

@Component({
  selector: 'app-alerts',
  imports: [CommonModule, DatePipe],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-lg font-medium text-gray-800">Alerts</h1>
          <p class="text-xs text-gray-400 mt-0.5">{{ todayCount() }} today</p>
        </div>
        @if (alerts().length > 0) {
          <button (click)="clearAll()" class="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Clear all
          </button>
        }
      </div>

      @if (alerts().length === 0) {
        <div class="text-center py-16">
          <div class="text-4xl mb-3">🔔</div>
          <p class="text-sm text-gray-500">No alerts yet.</p>
          <p class="text-xs text-gray-400 mt-1">You'll be notified when your plants need attention.</p>
        </div>
      } @else {

        <!-- Today -->
        @if (todayAlerts().length > 0) {
          <div class="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Today</div>
          <div class="flex flex-col gap-2 mb-5">
            @for (alert of todayAlerts(); track alert.id) {
              <div class="bg-white border border-gray-100 rounded-2xl p-4 flex gap-3">
                <div class="mt-1 w-2 h-2 rounded-full shrink-0"
                     [class]="dotColor(alert.type)"></div>
                <div class="flex-1">
                  <div class="text-sm font-medium text-gray-800">{{ alert.title }}</div>
                  <div class="text-xs text-gray-500 mt-0.5 leading-relaxed">{{ alert.message }}</div>
                  <div class="text-xs text-gray-300 mt-1.5">{{ alert.timestamp | date:'HH:mm' }}</div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Earlier -->
        @if (earlierAlerts().length > 0) {
          <div class="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Earlier</div>
          <div class="flex flex-col gap-2">
            @for (alert of earlierAlerts(); track alert.id) {
              <div class="bg-white border border-gray-100 rounded-2xl p-4 flex gap-3 opacity-70">
                <div class="mt-1 w-2 h-2 rounded-full shrink-0"
                     [class]="dotColor(alert.type)"></div>
                <div class="flex-1">
                  <div class="text-sm font-medium text-gray-800">{{ alert.title }}</div>
                  <div class="text-xs text-gray-500 mt-0.5 leading-relaxed">{{ alert.message }}</div>
                  <div class="text-xs text-gray-300 mt-1.5">{{ alert.timestamp | date:'EEE HH:mm' }}</div>
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
  private sub?: Subscription;
  private lastData: SensorData | null = null;
  private readonly STORAGE_KEY = 'growwatch-alerts';

  alerts = signal<Alert[]>(this.loadAlerts());
  plants = this.plantService.plants;

  todayAlerts = computed(() => {
    const today = new Date().toDateString();
    return this.alerts().filter(a => a.timestamp.toDateString() === today);
  });

  earlierAlerts = computed(() => {
    const today = new Date().toDateString();
    return this.alerts().filter(a => a.timestamp.toDateString() !== today);
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
    if (type === 'warn') return 'bg-amber-400';
    if (type === 'danger') return 'bg-red-400';
    return 'bg-green-400';
  }

  clearAll() {
    this.alerts.set([]);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private checkConditions(data: SensorData) {
    const plants = this.plants();
    const plantNames = plants.length > 0 ? plants.map(p => p.name).join(', ') : 'your plants';

    // Light alerts
    if (data.lightStatus?.status === 'TOO_LOW') {
      this.addAlert('warn', 'Low light', `Light is below optimal for ${plantNames}. Consider supplemental lighting.`);
    } else if (data.lightStatus?.status === 'TOO_HIGH') {
      this.addAlert('warn', 'Intense light', `Light intensity is very high — ${plantNames} might appreciate some shade.`);
    } else if (data.lightStatus?.status === 'OPTIMAL' && this.lastData?.lightStatus?.status !== 'OPTIMAL') {
      this.addAlert('info', 'Great light conditions', `Light is now optimal for ${plantNames}.`);
    }

    // Humidity alerts
    if (data.humidity != null && data.humidity < 40) {
      this.addAlert('warn', 'Low humidity', `Humidity at ${Math.round(data.humidity)}% — ${plantNames} prefer above 50%. Consider misting.`);
    }

    // Temperature alerts
    if (data.temperature != null) {
      if (data.temperature < 10) {
        this.addAlert('danger', 'Temperature too low', `${data.temperature.toFixed(1)}°C — this is too cold for most greenhouse plants.`);
      } else if (data.temperature > 35) {
        this.addAlert('danger', 'Temperature too high', `${data.temperature.toFixed(1)}°C — heat stress risk for ${plantNames}.`);
      }
    }

    this.lastData = data;
  }

  ngOnInit() {
    // Check for sensor going offline after 30s of no data
    let offlineTimer: any;
    const resetOfflineTimer = () => {
      clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => {
        this.addAlert('danger', 'Sensor offline', 'No reading received for over 30 seconds. Check your ESP32.');
      }, 30000);
    };

    this.sub = this.sensorService.subscribeToSensorData().subscribe(data => {
      if (data) {
        resetOfflineTimer();
        this.checkConditions(data);
      }
    });

    resetOfflineTimer();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
