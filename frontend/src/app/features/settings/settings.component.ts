import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, IconComponent],
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
          <div class="flex items-center gap-3 p-4 border-b border-gray-100">
            <div class="flex-1">
              <div class="text-[14px] font-medium text-gray-800">Daily digest</div>
              <div class="text-[11px] text-gray-400 mt-0.5">Evening summary of your greenhouse</div>
            </div>
            <button (click)="settings.setDigestEnabled(!settings.effectiveDigestEnabled())"
                    class="w-10 h-6 rounded-full transition-colors relative shrink-0"
                    [class]="settings.effectiveDigestEnabled() ? 'bg-gw-green' : 'bg-gray-200'">
              <div class="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                   [class]="settings.effectiveDigestEnabled() ? 'left-5' : 'left-1'"></div>
            </button>
          </div>
          <div class="flex items-center gap-3 p-4">
            <div class="flex-1">
              <div class="text-[14px] font-medium text-gray-800">Smart alerts</div>
              <div class="text-[11px] text-gray-400 mt-0.5">When plants need your attention</div>
            </div>
            <button (click)="settings.setAlertsEnabled(!settings.effectiveAlertsEnabled())"
                    class="w-10 h-6 rounded-full transition-colors relative shrink-0"
                    [class]="settings.effectiveAlertsEnabled() ? 'bg-gw-green' : 'bg-gray-200'">
              <div class="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                   [class]="settings.effectiveAlertsEnabled() ? 'left-5' : 'left-1'"></div>
            </button>
          </div>
        </div>
      </div>

      <!-- Digest time -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Daily digest time</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div class="text-[13px] text-gray-500 flex-1">Send digest at</div>
          <input type="time" [ngModel]="settings.effectiveDigestTime()" (ngModelChange)="onDigestTimeChange($event)"
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
                <app-icon name="chevron-down" strokeWidth="2"
                          class="w-3 h-3 text-gw-green-dark/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                <app-icon name="chevron-down" strokeWidth="2"
                          class="w-3 h-3 text-gw-green-dark/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            <app-icon name="logout" class="w-4 h-4 text-red-500" />
          </div>
          <div class="flex-1 text-left">
            <div class="text-[14px] font-medium text-red-600">Log out</div>
            <div class="text-[11px] text-gray-400 mt-0.5">{{ userEmail() }}</div>
          </div>
        </button>
      </div>

      <!-- Admin (superuser only) -->
      @if (isSuperuser()) {
        <div class="mt-5">
          <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Admin</div>
          <button (click)="openAdmin()"
                  class="w-full bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-gray-300 transition-colors">
            <div class="w-8 h-8 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
              <app-icon name="admin" class="w-4 h-4 text-gw-green-dark" />
            </div>
            <div class="flex-1 text-left">
              <div class="text-[14px] font-medium text-gray-800">All users</div>
              <div class="text-[11px] text-gray-400 mt-0.5">Superuser-only view of every registered account</div>
            </div>
            <app-icon name="chevron-right" class="w-4 h-4 text-gray-300" />
          </button>
        </div>
      }

      <!-- Sensor setup + devices -->
      <div class="mt-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Setup</div>
        <div class="space-y-2">
          <button (click)="openDevices()"
                  class="w-full bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-gray-300 transition-colors">
            <div class="w-8 h-8 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
              <app-icon name="device" class="w-4 h-4 text-gw-green-dark" />
            </div>
            <div class="flex-1 text-left">
              <div class="text-[14px] font-medium text-gray-800">My devices</div>
              <div class="text-[11px] text-gray-400 mt-0.5">Pair and manage your ESP32 sensors</div>
            </div>
            <app-icon name="chevron-right" class="w-4 h-4 text-gray-300" />
          </button>
          <button (click)="openSensorSetup()"
                  class="w-full bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-gray-300 transition-colors">
            <div class="w-8 h-8 rounded-full bg-gw-green-light flex items-center justify-center shrink-0">
              <app-icon name="wifi" class="w-4 h-4 text-gw-green-dark" />
            </div>
            <div class="flex-1 text-left">
              <div class="text-[14px] font-medium text-gray-800">Sensor setup guide</div>
              <div class="text-[11px] text-gray-400 mt-0.5">How to connect your ESP32 to WiFi</div>
            </div>
            <app-icon name="chevron-right" class="w-4 h-4 text-gray-300" />
          </button>
        </div>
      </div>

      <!-- Debug info (temporary) -->
      <div class="mt-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Debug</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl overflow-hidden">
          <div class="flex items-center gap-3 p-4" [class.border-b]="showDebug" [class.border-gray-100]="showDebug">
            <div class="text-[14px] font-medium text-gray-800 flex-1">Debug</div>
            <button (click)="toggleDebug()"
                    class="w-10 h-6 rounded-full transition-colors relative shrink-0"
                    [class]="showDebug ? 'bg-gw-green' : 'bg-gray-200'">
              <div class="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                   [class]="showDebug ? 'left-5' : 'left-1'"></div>
            </button>
          </div>
          @if (showDebug) {
            <div class="font-mono text-[11px]">
              <div class="flex items-start gap-3 p-3 border-b border-gray-100">
                <span class="text-gray-400 w-16 shrink-0">user ID</span>
                <span class="text-gray-700 break-all flex-1">{{ userId() || '—' }}</span>
                <button (click)="copy(userId())" class="text-gw-green-dark hover:underline shrink-0">copy</button>
              </div>
              <div class="flex items-start gap-3 p-3 border-b border-gray-100">
                <span class="text-gray-400 w-16 shrink-0">email</span>
                <span class="text-gray-700 break-all flex-1">{{ userEmail() || '—' }}</span>
              </div>
              <div class="flex items-start gap-3 p-3">
                <span class="text-gray-400 w-16 shrink-0">role</span>
                <span class="text-gray-700 break-all flex-1">{{ userRole() || '—' }}</span>
              </div>
            </div>
          }
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
  userId = () => this.auth.user()?.userId ?? '';
  userRole = () => this.auth.user()?.role ?? '';
  isSuperuser = () => this.auth.user()?.role === 'superuser';

  // showDebug stays in localStorage — purely client-only UI state (per device/browser).
  private readonly DEBUG_KEY = 'growwatch-show-debug';
  showDebug = localStorage.getItem(this.DEBUG_KEY) === '1';

  toggleDebug() {
    this.showDebug = !this.showDebug;
    localStorage.setItem(this.DEBUG_KEY, this.showDebug ? '1' : '0');
  }

  async copy(value: string) {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch {}
  }

  readonly tempOptions = Array.from({ length: 41 }, (_, i) => i); // 0..40

  onTempMinChange(value: number | null) {
    const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
    this.settings.setTempMin(v);
  }

  onTempMaxChange(value: number | null) {
    const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
    this.settings.setTempMax(v);
  }

  onDigestTimeChange(value: string | null) {
    const v = typeof value === 'string' && value.length > 0 ? value : null;
    this.settings.setDigestTime(v);
  }

  resetTempRange() {
    this.settings.resetTempRange();
  }

  ngOnInit() {
    // Stale localStorage cleanup — these fields now live in the DB
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (raw) localStorage.removeItem(this.STORAGE_KEY);
  }

  openSensorSetup() { this.router.navigate(['/settings/sensor-setup']); }
  openDevices() { this.router.navigate(['/settings/devices']); }
  openAdmin() { this.router.navigate(['/admin']); }
  logout() { this.auth.logout(); }

}
