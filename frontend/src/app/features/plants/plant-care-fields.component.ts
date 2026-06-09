import { Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { PlantCare, WaterAmount, WateringFrequency } from '../../core/services/plant.service';

const FREQ_OPTIONS: WateringFrequency[] = ['once_week', 'twice_week', 'once_two_weeks', 'other'];

@Component({
  selector: 'app-plant-care-fields',
  imports: [FormsModule, TranslocoDirective],
  template: `
    <div class="flex flex-col gap-4" *transloco="let t">
      <details open class="shadow-gw-sm rounded-xl">
        <summary class="flex items-center justify-between cursor-pointer px-3.5 py-2.5 text-[12px] font-medium text-gray-700 select-none">
          <span>💧 {{ t('plantCare.waterTitle') }}</span>
          <span class="text-[11px] text-gray-400">{{ t('plantCare.optional') }}</span>
        </summary>
        <div class="px-3.5 pb-3.5 pt-1 flex flex-col gap-3 border-t border-gray-100">
          <div>
            <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plantCare.waterAmount') }}</label>
            <div class="grid grid-cols-3 gap-2">
              @for (n of [1, 2, 3]; track n) {
                <button type="button" (click)="setWaterAmount(n)"
                        class="py-2 rounded-lg border-[0.5px] text-[12px] transition-colors"
                        [class.border-gw-green]="care().waterAmount === n"
                        [class.bg-gw-green-light]="care().waterAmount === n"
                        [class.text-gw-green-dark]="care().waterAmount === n"
                        [class.border-gray-200]="care().waterAmount !== n"
                        [class.text-gray-600]="care().waterAmount !== n">
                  {{ t('plantCare.amount.' + n) }}
                </button>
              }
            </div>
          </div>
          <div>
            <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plantCare.waterFrequency') }}</label>
            <div class="grid grid-cols-2 gap-2">
              @for (f of freqOptions; track f) {
                <button type="button" (click)="setWaterFreq(f)"
                        class="py-2 rounded-lg border-[0.5px] text-[12px] transition-colors"
                        [class.border-gw-green]="care().waterFrequency === f"
                        [class.bg-gw-green-light]="care().waterFrequency === f"
                        [class.text-gw-green-dark]="care().waterFrequency === f"
                        [class.border-gray-200]="care().waterFrequency !== f"
                        [class.text-gray-600]="care().waterFrequency !== f">
                  {{ t('plantCare.freq.' + f) }}
                </button>
              }
            </div>
            @if (care().waterFrequency === 'other') {
              <input type="text" [ngModel]="care().waterFrequencyOther ?? ''"
                     (ngModelChange)="patch({ waterFrequencyOther: $event })"
                     [placeholder]="t('plantCare.freqOtherPlaceholder')"
                     class="mt-2 w-full shadow-gw-sm rounded-lg px-3 py-2 text-[12px] outline-none focus:border-gw-green transition-colors" />
            }
          </div>
        </div>
      </details>

      <details open class="shadow-gw-sm rounded-xl">
        <summary class="flex items-center justify-between cursor-pointer px-3.5 py-2.5 text-[12px] font-medium text-gray-700 select-none">
          <span>🌿 {{ t('plantCare.fertilizerTitle') }}</span>
          <span class="text-[11px] text-gray-400">{{ t('plantCare.optional') }}</span>
        </summary>
        <div class="px-3.5 pb-3.5 pt-1 flex flex-col gap-3 border-t border-gray-100">
          <div>
            <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plantCare.fertilizerType') }}</label>
            <input type="text" [ngModel]="care().fertilizerType ?? ''"
                   (ngModelChange)="patch({ fertilizerType: $event })"
                   [placeholder]="t('plantCare.fertilizerTypePlaceholder')"
                   class="w-full shadow-gw-sm rounded-lg px-3 py-2 text-[12px] outline-none focus:border-gw-green transition-colors" />
          </div>
          <div>
            <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plantCare.fertilizerFrequency') }}</label>
            <input type="text" [ngModel]="care().fertilizerFrequency ?? ''"
                   (ngModelChange)="patch({ fertilizerFrequency: $event })"
                   [placeholder]="t('plantCare.fertilizerFreqPlaceholder')"
                   class="w-full shadow-gw-sm rounded-lg px-3 py-2 text-[12px] outline-none focus:border-gw-green transition-colors" />
          </div>
        </div>
      </details>
    </div>
  `,
})
export class PlantCareFieldsComponent {
  care = model<PlantCare>(emptyCare());
  freqOptions = FREQ_OPTIONS;

  patch(p: Partial<PlantCare>) {
    this.care.set({ ...this.care(), ...p });
  }

  setWaterAmount(n: number) {
    const w = n as WaterAmount;
    this.patch({ waterAmount: this.care().waterAmount === w ? null : w });
  }

  setWaterFreq(f: WateringFrequency) {
    this.patch({ waterFrequency: this.care().waterFrequency === f ? null : f });
  }
}

export function emptyCare(): PlantCare {
  return {
    waterAmount: null,
    waterFrequency: null,
    waterFrequencyOther: null,
    fertilizerFrequency: null,
    fertilizerType: null,
  };
}
