import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DeviceService, Device } from '../../core/services/device.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-devices',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ Settings
      </button>

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">My devices</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">ESP32 sensors paired to your account</p>
      </div>

      @if (devices().length === 0 && !loading()) {
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-6 text-center">
          <div class="text-[14px] text-gray-600">No devices yet</div>
          <div class="text-[11px] text-gray-400 mt-1">Click "Add device" and power on your ESP32</div>
        </div>
      }

      @for (d of devices(); track d.id) {
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 mb-3">
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-[14px] font-medium text-gray-800 truncate">{{ d.name }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5 font-mono">{{ d.mac }}</div>
              <div class="text-[11px] mt-0.5" [class]="onlineClass(d)">
                {{ lastSeenLabel(d) }}
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button (click)="startRename(d)" title="Rename"
                      class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gw-green-light/60 hover:text-gw-green-dark transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </button>
              <button (click)="startDelete(d)" title="Remove"
                      class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                  <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      }

      <button (click)="startClaim()"
              [disabled]="claiming()"
              class="w-full mt-4 px-4 py-3 rounded-xl bg-gw-green text-white text-[14px] font-medium disabled:opacity-50">
        + Add device
      </button>

      <!-- Pairing guide -->
      <div class="mt-6 bg-gw-surface border-[0.5px] border-gw-border rounded-xl p-4">
        <div class="text-[11px] text-gray-400 mb-3 font-medium uppercase tracking-wide">How to pair</div>
        <ol class="space-y-2.5 text-[13px] text-gray-700">
          <li class="flex gap-3">
            <span class="w-5 h-5 rounded-full bg-gw-green-light text-gw-green-dark text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">1</span>
            <span>Tap <strong>+ Add device</strong> above to open a 10-minute pairing window.</span>
          </li>
          <li class="flex gap-3">
            <span class="w-5 h-5 rounded-full bg-gw-green-light text-gw-green-dark text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">2</span>
            <span>Power on your ESP32, or press its <strong>reset</strong> button if already running. The sensor must be connected to WiFi.</span>
          </li>
          <li class="flex gap-3">
            <span class="w-5 h-5 rounded-full bg-gw-green-light text-gw-green-dark text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">3</span>
            <span>Within about a minute, the device appears in the modal. Give it a name (e.g. "Greenhouse 1") and save.</span>
          </li>
        </ol>
        <p class="text-[11px] text-gray-400 mt-3 leading-relaxed">
          New ESP32? Set up WiFi first using the
          <a routerLink="/settings/sensor-setup" class="text-gw-green-dark underline hover:no-underline">sensor setup guide</a>.
        </p>
      </div>

      <!-- Claim (add device) modal -->
      @if (claiming()) {
        <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div class="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            @if (!justClaimed()) {
              <h2 class="text-[16px] font-medium text-gray-800 mb-1">Waiting for your sensor…</h2>
              <p class="text-[12px] text-gray-500 mb-4">
                Power on your ESP32 (or press its reset button). It should appear within a minute.
              </p>
              <div class="text-[24px] font-data text-gw-green-dark text-center mb-4">
                {{ countdownLabel() }}
              </div>
              <button (click)="cancelClaim()"
                      class="w-full px-4 py-2 rounded-xl border border-gray-300 text-[13px] text-gray-700">
                Cancel
              </button>
            } @else {
              <h2 class="text-[16px] font-medium text-gray-800 mb-1">Found device 🎉</h2>
              <p class="text-[11px] text-gray-400 mb-3 font-mono">{{ justClaimed()!.mac }}</p>
              <label class="text-[11px] text-gray-500 mb-1 block">Name</label>
              <input [(ngModel)]="newDeviceName"
                     class="w-full text-[14px] border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-gw-green mb-4" />
              <div class="flex gap-2">
                <button (click)="skipNaming()"
                        class="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-[13px] text-gray-700">
                  Skip
                </button>
                <button (click)="confirmName()"
                        class="flex-1 px-4 py-2 rounded-xl bg-gw-green text-white text-[13px] font-medium">
                  Save
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Rename device modal -->
      @if (renamingDevice(); as rd) {
        <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div class="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <h2 class="text-[16px] font-medium text-gray-800 mb-1">Rename device</h2>
            <p class="text-[11px] text-gray-400 mb-3 font-mono">{{ rd.mac }}</p>
            <label class="text-[11px] text-gray-500 mb-1 block">Name</label>
            <input [(ngModel)]="renameInput" #renameField
                   (keydown.enter)="confirmRename()"
                   (keydown.escape)="cancelRename()"
                   class="w-full text-[14px] border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-gw-green mb-4" />
            <div class="flex gap-2">
              <button (click)="cancelRename()"
                      class="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-[13px] text-gray-700">
                Cancel
              </button>
              <button (click)="confirmRename()"
                      [disabled]="!renameInput.trim() || renameInput.trim() === rd.name"
                      class="flex-1 px-4 py-2 rounded-xl bg-gw-green text-white text-[13px] font-medium disabled:opacity-50">
                Rename
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Delete device confirmation modal -->
      @if (deletingDevice(); as dd) {
        <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div class="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
              </div>
              <div>
                <h2 class="text-[16px] font-medium text-gray-800">Remove device?</h2>
                <p class="text-[11px] text-gray-400 font-mono mt-0.5">{{ dd.mac }}</p>
              </div>
            </div>
            <p class="text-[13px] text-gray-600 leading-relaxed mb-4">
              Remove <strong>{{ dd.name }}</strong> from your account? You can re-pair it later by clicking "Add device" and resetting the ESP32.
            </p>
            <div class="flex gap-2">
              <button (click)="cancelDelete()"
                      class="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-[13px] text-gray-700">
                Cancel
              </button>
              <button (click)="confirmDelete()"
                      class="flex-1 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-medium transition-colors">
                Remove
              </button>
            </div>
          </div>
        </div>
      }

      @if (errorMessage()) {
        <div class="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">
          {{ errorMessage() }}
        </div>
      }

    </div>
  `,
})
export class DevicesComponent implements OnInit, OnDestroy {
  private deviceService = inject(DeviceService);
  private auth = inject(AuthService);
  private router = inject(Router);

  back() { this.router.navigate(['/settings']); }

  devices = signal<Device[]>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  claiming = signal(false);
  claimExpiresAt = signal<number | null>(null);
  countdownLabel = signal('10:00');
  justClaimed = signal<Device | null>(null);
  newDeviceName = '';

  renamingDevice = signal<Device | null>(null);
  renameInput = '';

  deletingDevice = signal<Device | null>(null);

  private claimSub?: Subscription;
  private countdownTimer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.loadDevices();
  }

  ngOnDestroy() {
    this.cleanupClaim();
  }

  private loadDevices() {
    this.loading.set(true);
    this.deviceService.myDevices().subscribe({
      next: list => {
        this.devices.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load devices');
        this.loading.set(false);
      },
    });
  }

  startClaim() {
    const userId = this.auth.getUserId();
    if (!userId) {
      this.errorMessage.set('Not logged in');
      return;
    }
    this.errorMessage.set(null);
    this.deviceService.openClaim().subscribe({
      next: expiresAtIso => {
        const expiresAt = new Date(expiresAtIso).getTime();
        this.claimExpiresAt.set(expiresAt);
        this.claiming.set(true);
        this.justClaimed.set(null);

        this.startCountdown();

        this.claimSub = this.deviceService.subscribeDeviceClaimed(userId).subscribe({
          next: device => {
            this.justClaimed.set(device);
            this.newDeviceName = device.name;
            this.stopCountdown();
          },
          error: err => {
            this.errorMessage.set('Subscription error: ' + (err?.message ?? 'unknown'));
          },
        });
      },
      error: err => {
        this.errorMessage.set('Failed to open claim: ' + (err?.message ?? 'unknown'));
      },
    });
  }

  cancelClaim() {
    this.deviceService.cancelClaim().subscribe({
      next: () => this.cleanupClaim(),
      error: () => this.cleanupClaim(),
    });
  }

  skipNaming() {
    this.cleanupClaim();
    this.loadDevices();
  }

  confirmName() {
    const device = this.justClaimed();
    if (!device) return;
    const name = this.newDeviceName.trim();
    if (!name || name === device.name) {
      this.skipNaming();
      return;
    }
    this.deviceService.renameDevice(device.id, name).subscribe({
      next: () => {
        this.cleanupClaim();
        this.loadDevices();
      },
      error: () => {
        this.cleanupClaim();
        this.loadDevices();
      },
    });
  }

  // ── Rename ──────────────────────────────────────────────────────────────

  startRename(d: Device) {
    this.errorMessage.set(null);
    this.renameInput = d.name;
    this.renamingDevice.set(d);
  }

  cancelRename() {
    this.renamingDevice.set(null);
    this.renameInput = '';
  }

  confirmRename() {
    const d = this.renamingDevice();
    if (!d) return;
    const name = this.renameInput.trim();
    if (!name || name === d.name) {
      this.cancelRename();
      return;
    }
    this.deviceService.renameDevice(d.id, name).subscribe({
      next: updated => {
        this.devices.update(list => list.map(x => (x.id === d.id ? updated : x)));
        this.cancelRename();
      },
      error: () => {
        this.errorMessage.set('Failed to rename device');
        this.cancelRename();
      },
    });
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  startDelete(d: Device) {
    this.errorMessage.set(null);
    this.deletingDevice.set(d);
  }

  cancelDelete() {
    this.deletingDevice.set(null);
  }

  confirmDelete() {
    const d = this.deletingDevice();
    if (!d) return;
    this.deviceService.removeDevice(d.id).subscribe({
      next: () => {
        this.devices.update(list => list.filter(x => x.id !== d.id));
        this.cancelDelete();
      },
      error: () => {
        this.errorMessage.set('Failed to remove device');
        this.cancelDelete();
      },
    });
  }

  // ── Misc ────────────────────────────────────────────────────────────────

  lastSeenLabel(d: Device): string {
    if (!d.lastSeenAt) return 'Never seen';
    const ago = Date.now() - new Date(d.lastSeenAt).getTime();
    if (ago < 60_000) return 'Online · just now';
    if (ago < 5 * 60_000) return `Online · ${Math.floor(ago / 60_000)}m ago`;
    if (ago < 60 * 60_000) return `Last seen ${Math.floor(ago / 60_000)}m ago`;
    if (ago < 24 * 3600_000) return `Last seen ${Math.floor(ago / 3600_000)}h ago`;
    return `Last seen ${Math.floor(ago / (24 * 3600_000))}d ago`;
  }

  onlineClass(d: Device): string {
    if (!d.lastSeenAt) return 'text-gray-400';
    const ago = Date.now() - new Date(d.lastSeenAt).getTime();
    return ago < 5 * 60_000 ? 'text-gw-green-dark' : 'text-gray-400';
  }

  private startCountdown() {
    this.stopCountdown();
    this.countdownTimer = setInterval(() => {
      const expiresAt = this.claimExpiresAt();
      if (!expiresAt) return;
      const ms = expiresAt - Date.now();
      if (ms <= 0) {
        this.countdownLabel.set('Expired');
        this.cleanupClaim();
        return;
      }
      const mins = Math.floor(ms / 60_000);
      const secs = Math.floor((ms % 60_000) / 1000);
      this.countdownLabel.set(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    }, 500);
  }

  private stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
  }

  private cleanupClaim() {
    this.claiming.set(false);
    this.claimExpiresAt.set(null);
    this.justClaimed.set(null);
    this.newDeviceName = '';
    this.stopCountdown();
    this.claimSub?.unsubscribe();
    this.claimSub = undefined;
  }
}
