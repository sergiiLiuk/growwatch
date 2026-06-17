import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ShellyService, ShellyDevice } from '../../core/services/shelly.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { ShellyConnectComponent } from './shelly-connect.component';
import dayjs from 'dayjs';

@Component({
  selector: 'app-shelly-setup',
  imports: [FormsModule, TranslocoDirective, IconComponent, ShellyConnectComponent],
  template: `
    @if (connectOpen()) {
      <app-shelly-connect
        (closed)="onConnectClosed()"
        (completed)="onConnectCompleted()" />
    } @else {
      <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">

        <button (click)="back()"
                class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
          ‹ {{ t('nav.settings') }}
        </button>

        <div class="mb-6">
          <h1 class="text-[18px] font-medium text-gray-800">{{ t('shelly.title') }}</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">{{ t('shelly.subtitle') }}</p>
        </div>

        @if (reconnectNeeded()) {
          <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-[13px] text-amber-800">
            {{ t('shelly.reconnectNeeded') }}
          </div>
        }

        @if (devices().length === 0 && !loading()) {
          <div class="bg-white shadow-gw-sm rounded-xl p-6 text-center">
            <div class="text-[14px] text-gray-600">{{ t('shelly.noDevices') }}</div>
            <div class="text-[11px] text-gray-400 mt-1">{{ t('shelly.noDevicesHint') }}</div>
          </div>
        }

        @for (d of devices(); track d.id) {
          <div class="bg-white shadow-gw-sm rounded-xl p-4 mb-3">
            <div class="flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="text-[14px] font-medium text-gray-800 truncate">{{ d.name }}</div>
                <div class="text-[11px] text-gray-400 mt-0.5 font-mono truncate">{{ d.deviceId }}</div>
                <div class="text-[11px] text-gray-400 mt-1">
                  {{ lastSeenLabel(d) }}
                  @if (d.lastBatteryPercent != null) {
                    <span class="ml-2">· {{ t('shelly.battery', { n: d.lastBatteryPercent }) }}</span>
                  }
                </div>
              </div>
              <div class="flex gap-1 shrink-0">
                <button (click)="startRename(d)" [title]="t('shelly.nameLabel')"
                        class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gw-green-light/60 hover:text-gw-green-dark transition-colors">
                  <app-icon name="pencil" class="w-4 h-4" />
                </button>
                <button (click)="remove(d)" [title]="t('shelly.remove')"
                        class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <app-icon name="trash" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        }

        <button (click)="openConnect()"
                [disabled]="devices().length > 0 && accountConnected() && !reconnectNeeded()"
                class="w-full mt-4 px-4 py-3 rounded-xl bg-gw-green text-white text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {{ t('shelly.addDevice') }}
        </button>

        @if (accountConnected()) {
          <button (click)="disconnectAccount()"
                  class="w-full mt-3 px-4 py-3 rounded-xl border border-red-200 text-red-600 text-[14px] font-medium hover:bg-red-50 transition-colors">
            {{ t('shelly.disconnect') }}
          </button>
        }
      </div>
    }
  `,
})
export class ShellySetupComponent implements OnInit {
  private shelly = inject(ShellyService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  devices = signal<ShellyDevice[]>([]);
  loading = signal(true);
  connectOpen = signal(false);
  accountConnected = signal(false);
  reconnectNeeded = signal(false);

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.shelly.list().subscribe({
      next: list => { this.devices.set(list); this.loading.set(false); },
      error: err => { console.error('Failed to load Shelly devices:', err); this.loading.set(false); },
    });
    this.shelly.account().subscribe({
      next: info => {
        this.accountConnected.set(info.connected);
        this.reconnectNeeded.set(info.status === 'auth_error');
      },
      error: () => { /* non-fatal */ },
    });
  }

  back() { this.router.navigate(['/settings']); }

  openConnect() { this.connectOpen.set(true); }

  onConnectClosed() {
    this.connectOpen.set(false);
    this.reload();
  }

  onConnectCompleted() {
    this.connectOpen.set(false);
    this.reload();
  }

  startRename(d: ShellyDevice) {
    const name = prompt(this.transloco.translate('shelly.nameLabel'), d.name);
    if (!name || name.trim() === d.name) return;
    this.shelly.rename(d.id, name.trim()).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to rename'),
    });
  }

  remove(d: ShellyDevice) {
    if (!confirm(this.transloco.translate('shelly.removeConfirm'))) return;
    this.shelly.remove(d.id).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to remove'),
    });
  }

  disconnectAccount() {
    if (!confirm(this.transloco.translate('shelly.disconnectConfirm'))) return;
    this.shelly.disconnectAccount().subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to disconnect'),
    });
  }

  lastSeenLabel(d: ShellyDevice): string {
    if (!d.lastSeenAt) return this.transloco.translate('shelly.lastSeenNever');
    const diffMin = dayjs().diff(dayjs(d.lastSeenAt), 'minute');
    if (diffMin < 1) return this.transloco.translate('shelly.lastSeenJustNow');
    if (diffMin < 60) return this.transloco.translate('shelly.lastSeenMinutesAgo', { n: diffMin });
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return this.transloco.translate('shelly.lastSeenHoursAgo', { n: diffHr });
    const diffDay = Math.floor(diffHr / 24);
    return this.transloco.translate('shelly.lastSeenDaysAgo', { n: diffDay });
  }
}
