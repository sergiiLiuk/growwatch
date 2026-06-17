import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { ShellyService } from '../../core/services/shelly.service';

@Component({
  selector: 'app-shelly-connect',
  imports: [FormsModule, TranslocoDirective],
  template: `
    <div class="fixed inset-0 z-[60] bg-white flex flex-col" *transloco="let t">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h1 class="text-[15px] font-medium text-gray-800">{{ t('shelly.connect.title') }}</h1>
        <button (click)="closed.emit()" class="text-[13px] text-gray-500 hover:text-gray-700">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-6 max-w-lg w-full mx-auto space-y-5">
        <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.connect.intro') }}</p>

        <div class="space-y-3">
          <div>
            <label for="shellyName" class="text-[12px] text-gray-500">{{ t('shelly.connect.nameLabel') }}</label>
            <input id="shellyName" type="text" [ngModel]="name()" (ngModelChange)="name.set($event)"
                   [placeholder]="t('shelly.connect.namePlaceholder')"
                   class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green" />
          </div>
          <div>
            <label for="shellyAuthKey" class="text-[12px] text-gray-500">{{ t('shelly.connect.authKeyLabel') }}</label>
            <input id="shellyAuthKey" type="text" [ngModel]="authKey()" (ngModelChange)="authKey.set($event)"
                   class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green" />
          </div>
          <div>
            <label for="shellyServerHost" class="text-[12px] text-gray-500">{{ t('shelly.connect.serverLabel') }}</label>
            <input id="shellyServerHost" type="text" [ngModel]="serverHost()" (ngModelChange)="serverHost.set($event)"
                   placeholder="shelly-XX-eu.shelly.cloud"
                   class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green" />
          </div>
          <div>
            <label for="shellyDeviceId" class="text-[12px] text-gray-500">{{ t('shelly.connect.deviceIdLabel') }}</label>
            <input id="shellyDeviceId" type="text" [ngModel]="deviceId()" (ngModelChange)="deviceId.set($event)"
                   class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green" />
            <p class="text-[11px] text-gray-400 mt-1">{{ t('shelly.connect.deviceIdHint') }}</p>
          </div>
        </div>

        @if (error()) { <p class="text-[13px] text-red-500">{{ error() }}</p> }

        <button (click)="connect()" [disabled]="!canConnect() || busy()"
                class="w-full bg-gw-green text-white text-[14px] py-3 rounded-xl font-medium disabled:opacity-40">
          {{ busy() ? t('shelly.connect.connecting') : t('shelly.connect.connectCta') }}
        </button>
      </div>
    </div>
  `,
})
export class ShellyConnectComponent {
  private shelly = inject(ShellyService);

  closed = output<void>();
  completed = output<void>();

  name = signal('');
  authKey = signal('');
  serverHost = signal('');
  deviceId = signal('');
  busy = signal(false);
  error = signal<string | null>(null);

  canConnect() {
    return this.name().trim().length > 0
      && this.authKey().trim().length > 0
      && this.serverHost().trim().length > 0
      && this.deviceId().trim().length > 0;
  }

  connect() {
    if (!this.canConnect() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.shelly.connectAccount(this.authKey().trim(), this.serverHost().trim(), this.deviceId().trim(), this.name().trim()).subscribe({
      next: () => { this.busy.set(false); this.completed.emit(); },
      error: err => { this.error.set(err?.message ?? 'Failed to connect'); this.busy.set(false); },
    });
  }
}
