import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SensorService, SensorData } from '../../core/services/sensor.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">Settings</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">Notifications and sensor</p>
      </div>

      <!-- Sensor status -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Sensor</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div class="w-2 h-2 rounded-full shrink-0"
               [class]="sensorOnline() ? 'bg-gw-green' : 'bg-gw-red'"></div>
          <div class="flex-1">
            <div class="text-[14px] font-medium text-gray-800">ESP32 · Greenhouse 1</div>
            <div class="text-[11px] text-gray-400 mt-0.5">
              {{ sensorOnline() ? 'Online · ' + lastSeen() : 'Offline · ' + lastSeen() }}
            </div>
          </div>
          <div class="text-[11px] text-gray-400">
            {{ latestData()?.lightLevel != null ? Math.round(latestData()!.lightLevel) + ' lux' : '—' }}
          </div>
        </div>
      </div>

      <!-- Notifications -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Notifications</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl overflow-hidden">
          @for (pref of notifPrefs; track pref.key; let last = $last) {
            <div class="flex items-center gap-3 p-4" [class.border-b]="!last" [class.border-gray-100]="!last">
              <div class="flex-1">
                <div class="text-[14px] font-medium text-gray-800">{{ pref.label }}</div>
                <div class="text-[11px] text-gray-400 mt-0.5">{{ pref.description }}</div>
              </div>
              <button (click)="pref.enabled = !pref.enabled"
                      class="w-10 h-6 rounded-full transition-colors relative shrink-0"
                      [class]="pref.enabled ? 'bg-gw-green' : 'bg-gray-200'">
                <div class="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                     [class]="pref.enabled ? 'left-5' : 'left-1'"></div>
              </button>
            </div>
          }
        </div>
      </div>

      <!-- Digest time -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Daily digest time</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div class="text-[13px] text-gray-500 flex-1">Send digest at</div>
          <input type="time" [(ngModel)]="digestTime"
                 class="text-[13px] text-gray-800 border-[0.5px] border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-gw-green transition-colors" />
        </div>
      </div>

      <!-- About -->
      <div>
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">About</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl overflow-hidden">
          <div class="flex items-center gap-3 p-4 border-b border-gray-100">
            <div class="text-[13px] text-gray-500 flex-1">App</div>
            <div class="text-[13px] text-gray-800">GrowWatch</div>
          </div>
          <div class="flex items-center gap-3 p-4 border-b border-gray-100">
            <div class="text-[13px] text-gray-500 flex-1">Version</div>
            <div class="text-[13px] text-gray-800">0.1.0 MVP</div>
          </div>
          <div class="flex items-center gap-3 p-4">
            <div class="text-[13px] text-gray-500 flex-1">Data interval</div>
            <div class="text-[13px] text-gray-800">5 seconds live · 1h persisted</div>
          </div>
        </div>
      </div>

    </div>
  `,
})
export class SettingsComponent implements OnInit, OnDestroy {
  private sensorService = inject(SensorService);
  private sub?: Subscription;

  Math = Math;
  latestData = signal<SensorData | null>(null);
  digestTime = '20:00';

  notifPrefs = [
    { key: 'digest',  label: 'Daily digest',   description: 'Evening summary of your greenhouse', enabled: true },
    { key: 'alerts',  label: 'Smart alerts',   description: 'When plants need your attention',    enabled: true },
    { key: 'offline', label: 'Sensor offline', description: 'If ESP32 stops sending data',        enabled: true },
  ];

  sensorOnline = signal(false);
  lastSeen = signal('—');

  private updateStatus(data: SensorData | null) {
    if (!data) { this.sensorOnline.set(false); return; }
    const secs = Math.floor((Date.now() - new Date(data.timestamp).getTime()) / 1000);
    this.sensorOnline.set(secs < 30);
    if (secs < 10) this.lastSeen.set('just now');
    else if (secs < 60) this.lastSeen.set(`${secs}s ago`);
    else this.lastSeen.set(`${Math.floor(secs / 60)}m ago`);
  }

  ngOnInit() {
    this.sensorService.getLatestSensorData().subscribe(d => {
      this.latestData.set(d);
      this.updateStatus(d);
    });
    this.sub = this.sensorService.subscribeToSensorData().subscribe(d => {
      if (d) { this.latestData.set(d); this.updateStatus(d); }
    });
    setInterval(() => this.updateStatus(this.latestData()), 5000);
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }
}
