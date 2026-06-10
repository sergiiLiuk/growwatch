import { Component, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ShellyService, ShellyDevice } from '../../core/services/shelly.service';

type StepNum = 1 | 2 | 3 | 4 | 5 | 6;

@Component({
  selector: 'app-shelly-pairing-wizard',
  imports: [FormsModule, TranslocoDirective],
  template: `
    <div class="fixed inset-0 z-50 bg-white flex flex-col" *transloco="let t">

      <!-- Top bar -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button (click)="goBack()" [disabled]="!canGoBack()"
                class="text-[13px] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:text-gray-700 transition-colors">
          ‹ {{ t('shelly.wizard.back') }}
        </button>
        <div class="flex items-center gap-1.5">
          @for (n of stepDots; track n) {
            <span class="w-2 h-2 rounded-full"
                  [class.bg-gw-green]="n === currentStep()"
                  [class.bg-gw-green-light]="n < currentStep()"
                  [class.bg-gray-200]="n > currentStep()"></span>
          }
        </div>
        <button (click)="requestClose()"
                class="text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-6 max-w-lg w-full mx-auto">
        @switch (currentStep()) {
          @case (1) {
            <div class="space-y-4">
              <div class="text-4xl">🔌</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step1Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step1Body') }}</p>
            </div>
          }
          @case (2) {
            <div class="space-y-4">
              <div class="text-4xl">📶</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step2Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step2Body') }}</p>
            </div>
          }
          @case (3) {
            <div class="space-y-4">
              <div class="text-4xl">🌐</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step3Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step3Body') }}</p>
            </div>
          }
          @case (4) {
            <div class="space-y-4">
              <div class="text-4xl">🏷️</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step4Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step4Body') }}</p>
              <input type="text"
                     [ngModel]="draftName()"
                     (ngModelChange)="draftName.set($event)"
                     [placeholder]="t('shelly.wizard.step4NamePlaceholder')"
                     class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green transition-colors" />
            </div>
          }
          @case (5) { <div data-step="5"></div> }
          @case (6) { <div data-step="6"></div> }
        }
      </div>

      <!-- Sticky bottom CTA -->
      <div class="px-5 py-4 border-t border-gray-100 max-w-lg w-full mx-auto">
        <button (click)="advance()"
                [disabled]="!canAdvance() || busy()"
                class="w-full bg-gw-green text-white text-[14px] py-3 rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {{ ctaLabel() }}
        </button>
      </div>
    </div>
  `,
})
export class ShellyPairingWizardComponent implements OnDestroy {
  private shelly = inject(ShellyService);
  private transloco = inject(TranslocoService);

  /** Existing device when resuming (null when starting from step 1). */
  existingDevice = input<ShellyDevice | null>(null);

  closed = output<void>();
  completed = output<void>();

  currentStep = signal<StepNum>(1);
  device = signal<ShellyDevice | null>(null);
  busy = signal(false);
  stepDots: StepNum[] = [1, 2, 3, 4, 5, 6];

  // Step 4 input
  draftName = signal('');

  constructor() {
    const existing = this.existingDevice();
    if (existing) {
      this.device.set(existing);
      this.currentStep.set(5);
    }
  }

  canGoBack = computed(() => this.currentStep() > 1 && this.currentStep() < 6);

  canAdvance = computed<boolean>(() => {
    const step = this.currentStep();
    if (step === 4) return this.draftName().trim().length > 0;
    if (step === 6) return false; // Step 6 advances itself once the reading is detected (Task 6)
    return true;
  });

  ctaLabel = computed<string>(() => {
    const step = this.currentStep();
    if (step === 6) return this.transloco.translate('shelly.wizard.done');
    return this.transloco.translate('shelly.wizard.next');
  });

  goBack() {
    if (!this.canGoBack()) return;
    this.currentStep.update(s => (s - 1) as StepNum);
  }

  advance() {
    const step = this.currentStep();
    if (step === 4) {
      this.createDevice();
      return;
    }
    if (step === 6) {
      this.completed.emit();
      return;
    }
    if (step < 6) this.currentStep.update(s => (s + 1) as StepNum);
  }

  private createDevice() {
    if (this.busy()) return;
    this.busy.set(true);
    this.shelly.add(this.draftName().trim()).subscribe({
      next: d => {
        this.device.set(d);
        this.busy.set(false);
        this.currentStep.set(5);
      },
      error: err => {
        this.busy.set(false);
        alert(err?.message ?? 'Failed to pair device');
      },
    });
  }

  requestClose() {
    if (this.currentStep() === 1) {
      this.closed.emit();
      return;
    }
    const ok = confirm(
      this.transloco.translate('shelly.wizard.closeConfirmTitle') + '\n\n' +
      this.transloco.translate('shelly.wizard.closeConfirmBody')
    );
    if (ok) this.closed.emit();
  }

  ngOnDestroy() {
    // Step 6 will install polling later — cleanup happens in Task 6.
  }
}
