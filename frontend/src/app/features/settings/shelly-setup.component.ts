import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ShellyService, ShellyDevice } from '../../core/services/shelly.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import dayjs from 'dayjs';

@Component({
  selector: 'app-shelly-setup',
  imports: [FormsModule, TranslocoDirective, IconComponent],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">

      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ {{ t('nav.settings') }}
      </button>

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">{{ t('shelly.title') }}</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">{{ t('shelly.subtitle') }}</p>
      </div>

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
              <button (click)="rotate(d)" [title]="t('shelly.rotateToken')"
                      class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gw-amber-light hover:text-gw-amber transition-colors">
                <app-icon name="refresh" class="w-4 h-4" />
              </button>
              <button (click)="remove(d)" [title]="t('shelly.remove')"
                      class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                <app-icon name="trash" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-gray-100">
            <div class="text-[11px] text-gray-400 mb-1">{{ t('shelly.webhookUrlLabel') }}</div>
            <div class="flex items-center gap-2">
              <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.webhookUrl }}</code>
              <button (click)="copy(d.webhookUrl, d.id)"
                      class="text-[11px] text-gw-green-dark hover:underline shrink-0">
                {{ copiedId() === d.id ? t('shelly.copied') : t('shelly.copyUrl') }}
              </button>
            </div>
            <p class="text-[11px] text-gray-400 mt-1.5">{{ t('shelly.webhookUrlHint') }}</p>
          </div>
        </div>
      }

      @if (!addingNew()) {
        <button (click)="startAdd()"
                class="w-full mt-4 px-4 py-3 rounded-xl bg-gw-green text-white text-[14px] font-medium">
          {{ t('shelly.addDevice') }}
        </button>
      } @else {
        <div class="bg-white shadow-gw-sm rounded-xl p-4 mt-4">
          <div class="flex flex-col gap-3">
            <div>
              <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('shelly.nameLabel') }}</label>
              <input type="text" [(ngModel)]="draftName"
                     [placeholder]="t('shelly.namePlaceholder')"
                     class="w-full shadow-gw-sm rounded-lg px-3 py-2 text-[13px] outline-none focus:border-gw-green transition-colors" />
            </div>
            <div class="flex gap-2">
              <button (click)="saveNew()"
                      [disabled]="!canSave() || saving()"
                      class="flex-1 bg-gw-green text-white text-[13px] py-2.5 rounded-xl font-medium disabled:opacity-40 transition-colors">
                {{ t('shelly.save') }}
              </button>
              <button (click)="cancelAdd()"
                      class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                {{ t('shelly.cancel') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ShellySetupComponent implements OnInit {
  private shelly = inject(ShellyService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  devices = signal<ShellyDevice[]>([]);
  loading = signal(true);

  addingNew = signal(false);
  draftName = '';
  saving = signal(false);
  copiedId = signal<string | null>(null);

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.shelly.list().subscribe({
      next: list => { this.devices.set(list); this.loading.set(false); },
      error: err => { console.error('Failed to load Shelly devices:', err); this.loading.set(false); },
    });
  }

  back() { this.router.navigate(['/settings']); }

  startAdd() {
    this.draftName = '';
    this.addingNew.set(true);
  }

  cancelAdd() { this.addingNew.set(false); }

  canSave(): boolean {
    return this.draftName.trim().length > 0;
  }

  saveNew() {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.shelly.add(this.draftName.trim()).subscribe({
      next: () => { this.saving.set(false); this.addingNew.set(false); this.reload(); },
      error: err => {
        this.saving.set(false);
        alert(err?.message ?? 'Failed to add device');
      },
    });
  }

  startRename(d: ShellyDevice) {
    const name = prompt(this.transloco.translate('shelly.nameLabel'), d.name);
    if (!name || name.trim() === d.name) return;
    this.shelly.rename(d.id, name.trim()).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to rename'),
    });
  }

  rotate(d: ShellyDevice) {
    if (!confirm(this.transloco.translate('shelly.rotateTokenConfirm'))) return;
    this.shelly.rotateToken(d.id).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to rotate token'),
    });
  }

  remove(d: ShellyDevice) {
    if (!confirm(this.transloco.translate('shelly.removeConfirm'))) return;
    this.shelly.remove(d.id).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to remove'),
    });
  }

  copy(url: string, id: string) {
    navigator.clipboard.writeText(url).then(() => {
      this.copiedId.set(id);
      setTimeout(() => this.copiedId.set(null), 1500);
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
