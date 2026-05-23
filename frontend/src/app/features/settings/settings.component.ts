import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UserSettingsService } from '../../core/services/user-settings.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">Settings</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">Notifications and sensor</p>
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
              <button (click)="togglePref(pref)"
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
          <input type="time" [(ngModel)]="digestTime" (ngModelChange)="saveSettings()"
                 class="text-[13px] text-gray-800 border-[0.5px] border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-gw-green transition-colors" />
        </div>
      </div>

      <!-- Temperature range -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Temperature range</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
          <div class="flex items-center justify-center gap-3">

            <!-- Min -->
            <div class="flex-1 flex flex-col items-center">
              <span class="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Min</span>
              <div class="relative">
                <select [ngModel]="settings.effectiveTempMin()" (ngModelChange)="onTempMinChange($event)"
                        class="appearance-none w-20 text-center text-[15px] font-medium text-gw-green-dark bg-white border-[0.5px] border-gw-green-light rounded-lg pl-2 pr-6 py-1.5 outline-none focus:border-gw-green transition-colors cursor-pointer">
                  @for (t of tempOptions; track t) {
                    <option [ngValue]="t">{{ t }}°</option>
                  }
                </select>
                <svg class="w-3 h-3 text-gw-green-dark/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>

            <span class="text-gray-300 text-[14px] pt-5">–</span>

            <!-- Max -->
            <div class="flex-1 flex flex-col items-center">
              <span class="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Max</span>
              <div class="relative">
                <select [ngModel]="settings.effectiveTempMax()" (ngModelChange)="onTempMaxChange($event)"
                        class="appearance-none w-20 text-center text-[15px] font-medium text-gw-green-dark bg-white border-[0.5px] border-gw-green-light rounded-lg pl-2 pr-6 py-1.5 outline-none focus:border-gw-green transition-colors cursor-pointer">
                  @for (t of tempOptions; track t) {
                    <option [ngValue]="t">{{ t }}°</option>
                  }
                </select>
                <svg class="w-3 h-3 text-gw-green-dark/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>

          </div>
        </div>
        <div class="flex items-center justify-between mt-2 px-1">
          <p class="text-[11px] text-gray-400 leading-relaxed flex-1">
            Alerts trigger when temperature falls outside this range.
          </p>
          <button (click)="resetTempRange()"
                  class="text-[11px] text-gw-green-dark hover:underline ml-3 shrink-0">
            Reset ({{ settings.DEFAULT_TEMP_MIN }}–{{ settings.DEFAULT_TEMP_MAX }}°)
          </button>
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

      <!-- Account -->
      <div class="mt-5 lg:hidden">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Account</div>
        <button (click)="logout()"
                class="w-full bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-red-200 transition-colors">
          <div class="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>
          <div class="flex-1 text-left">
            <div class="text-[14px] font-medium text-red-600">Log out</div>
            <div class="text-[11px] text-gray-400 mt-0.5">{{ userEmail() }}</div>
          </div>
        </button>
      </div>

      <!-- Sensor setup + devices -->
      <div class="mt-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Setup</div>
        <div class="space-y-2">
          <button (click)="openDevices()"
                  class="w-full bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-gray-300 transition-colors">
            <div class="w-8 h-8 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
              <svg class="w-4 h-4 text-gw-green-dark" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="3"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <div class="text-[14px] font-medium text-gray-800">My devices</div>
              <div class="text-[11px] text-gray-400 mt-0.5">Pair and manage your ESP32 sensors</div>
            </div>
            <svg class="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <button (click)="openSensorSetup()"
                  class="w-full bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-gray-300 transition-colors">
            <div class="w-8 h-8 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
              <svg class="w-4 h-4 text-gw-green-dark" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <circle cx="12" cy="20" r="1" fill="currentColor"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <div class="text-[14px] font-medium text-gray-800">Sensor setup guide</div>
              <div class="text-[11px] text-gray-400 mt-0.5">How to connect your ESP32 to WiFi</div>
            </div>
            <svg class="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);
  settings = inject(UserSettingsService);
  private readonly STORAGE_KEY = 'growwatch-settings';

  userEmail = () => this.auth.user()?.email ?? '';

  digestTime = '20:00';

  readonly tempOptions = Array.from({ length: 41 }, (_, i) => i); // 0..40

  onTempMinChange(value: number | null) {
    const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
    this.settings.setTempMin(v);
  }

  onTempMaxChange(value: number | null) {
    const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
    this.settings.setTempMax(v);
  }

  resetTempRange() {
    this.settings.resetTempRange();
  }

  notifPrefs = [
    { key: 'digest', label: 'Daily digest', description: 'Evening summary of your greenhouse', enabled: true },
    { key: 'alerts', label: 'Smart alerts', description: 'When plants need your attention',    enabled: true },
  ];

  private loadSettings() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.digestTime) this.digestTime = parsed.digestTime;
      if (parsed.notifPrefs) {
        for (const pref of this.notifPrefs) {
          if (parsed.notifPrefs[pref.key] !== undefined) pref.enabled = parsed.notifPrefs[pref.key];
        }
      }
    } catch {}
  }

  saveSettings() {
    const data = {
      digestTime: this.digestTime,
      notifPrefs: Object.fromEntries(this.notifPrefs.map(p => [p.key, p.enabled])),
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  togglePref(pref: { key: string; enabled: boolean }) {
    pref.enabled = !pref.enabled;
    this.saveSettings();
  }

  ngOnInit() {
    this.loadSettings();
  }

  openSensorSetup() { this.router.navigate(['/settings/sensor-setup']); }
  openDevices() { this.router.navigate(['/settings/devices']); }
  logout() { this.auth.logout(); }

}
