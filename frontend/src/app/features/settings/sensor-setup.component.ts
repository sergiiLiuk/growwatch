import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { IconComponent } from '../../shared/components/atoms/icon.component';

const STEPS = [
  { n: 1, titleKey: 'sensorSetup.step1Title', bodyKey: 'sensorSetup.step1Body', hintIcon: 'hand',  hintKey: 'sensorSetup.step1Hint' },
  { n: 2, titleKey: 'sensorSetup.step2Title', bodyKey: 'sensorSetup.step2Body', hintIcon: 'wifi',  hintKey: 'sensorSetup.step2Hint' },
  { n: 3, titleKey: 'sensorSetup.step3Title', bodyKey: 'sensorSetup.step3Body', hintIcon: 'globe', hintKey: 'sensorSetup.step3Hint' },
  { n: 4, titleKey: 'sensorSetup.step4Title', bodyKey: 'sensorSetup.step4Body', hintIcon: 'check', hintKey: 'sensorSetup.step4Hint' },
];

const ISSUES = [
  { qKey: 'sensorSetup.issue1Q', aKey: 'sensorSetup.issue1A' },
  { qKey: 'sensorSetup.issue2Q', aKey: 'sensorSetup.issue2A' },
  { qKey: 'sensorSetup.issue3Q', aKey: 'sensorSetup.issue3A' },
];

const HINT_ICONS: Record<string, string> = { hand: '☝️', wifi: '📶', globe: '🌐', check: '✓' };

@Component({
  selector: 'app-sensor-setup',
  imports: [IconComponent, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">

      <!-- Header -->
      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ {{ t('nav.settings') }}
      </button>

      <h1 class="text-[18px] font-medium text-gray-800 mb-5">{{ t('sensorSetup.title') }}</h1>

      <!-- Hero card -->
      <div class="bg-gw-green-light rounded-2xl p-5 flex items-center gap-4 mb-6">
        <div class="w-14 h-14 rounded-full bg-white flex items-center justify-center shrink-0">
          <app-icon name="wifi" class="w-7 h-7 text-gw-green-dark" />
        </div>
        <div>
          <p class="text-[16px] font-semibold text-gw-green-dark leading-tight">{{ t('sensorSetup.heroTitle') }}</p>
          <p class="text-[13px] text-gw-green-dark/70 mt-0.5 leading-snug">
            {{ t('sensorSetup.heroBody') }}
          </p>
        </div>
      </div>

      <!-- Steps -->
      <div class="flex flex-col gap-3 mb-6">
        @for (step of steps; track step.n) {
          <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
            <div class="flex items-start gap-3 mb-3">
              <div class="w-7 h-7 rounded-full bg-gw-green-light flex items-center justify-center shrink-0 mt-0.5">
                <span class="text-[12px] font-semibold text-gw-green-dark">{{ step.n }}</span>
              </div>
              <div>
                <p class="text-[14px] font-semibold text-gray-900 mb-1">{{ t(step.titleKey) }}</p>
                <p class="text-[13px] text-gray-500 leading-relaxed" [innerHTML]="t(step.bodyKey)"></p>
              </div>
            </div>
            <div class="bg-gray-50 rounded-xl px-4 py-3 flex items-start gap-3">
              <span class="text-[15px] mt-0.5 shrink-0">{{ hintIcon(step.hintIcon) }}</span>
              <p class="text-[13px] text-gray-600 leading-snug" [innerHTML]="t(step.hintKey)"></p>
            </div>
          </div>
        }
      </div>

      <!-- Troubleshooting -->
      <div class="bg-amber-50 border-[0.5px] border-amber-200 rounded-xl p-4 mb-6">
        <div class="flex items-center gap-2 mb-3">
          <app-icon name="alert-triangle" class="w-4 h-4 text-amber-600 shrink-0" />
          <p class="text-[13px] font-semibold text-amber-800">{{ t('sensorSetup.ifSomethingGoesWrong') }}</p>
        </div>
        <ul class="flex flex-col gap-2.5 list-disc list-inside">
          @for (issue of issues; track issue.qKey) {
            <li class="text-[13px] text-amber-900 leading-snug">
              <span class="font-semibold">{{ t(issue.qKey) }}</span> {{ t(issue.aKey) }}
            </li>
          }
        </ul>
      </div>

      <!-- Changing WiFi later -->
      <div>
        <p class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('sensorSetup.changingWifiLater') }}</p>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-start gap-3">
          <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
            <app-icon name="refresh" class="w-4 h-4 text-gray-500" />
          </div>
          <div>
            <p class="text-[14px] font-semibold text-gray-900 mb-1">{{ t('sensorSetup.changingWifiTitle') }}</p>
            <p class="text-[13px] text-gray-500 leading-relaxed">
              {{ t('sensorSetup.changingWifiBody') }}
            </p>
          </div>
        </div>
      </div>

    </div>
  `,
})
export class SensorSetupComponent {
  private router = inject(Router);
  steps = STEPS;
  issues = ISSUES;
  back() { this.router.navigate(['/settings']); }
  hintIcon(key: string): string { return HINT_ICONS[key] ?? '•'; }
}
