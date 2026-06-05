import { Component, input, output, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { Plant, HarvestRecommendation } from '../../core/services/plant.service';

type Rec = HarvestRecommendation;

@Component({
  selector: 'app-harvest-summary-modal',
  imports: [FormsModule, TranslocoDirective],
  template: `
    @if (plant()) {
      <div class="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancel()" *transloco="let t">
        <div class="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border-[0.5px] border-gray-200 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>
          <div class="p-6">
            <h2 class="text-[15px] font-medium text-gray-800 mb-1">{{ t('harvest.title', { name: plant()!.name }) }}</h2>
            <p class="text-[12px] text-gray-500 mb-5 leading-relaxed">{{ t('harvest.subtitle') }}</p>

            <div class="flex flex-col gap-5">
              <!-- Taste -->
              <div>
                <label class="block text-[12px] font-medium text-gray-700 mb-2">{{ t('harvest.taste') }}</label>
                <div class="flex items-center gap-2">
                  @for (n of [1,2,3,4,5]; track n) {
                    <button type="button" (click)="taste.set(n)"
                            class="flex-1 py-2.5 rounded-lg border-[0.5px] text-[15px] transition-colors"
                            [class.border-gw-green]="taste() === n"
                            [class.bg-gw-green-light]="taste() === n"
                            [class.border-gray-200]="taste() !== n">
                      {{ n <= taste() ? '★' : '☆' }}
                    </button>
                  }
                </div>
                @if (taste()) { <p class="text-[11px] text-gray-400 mt-1">{{ t('harvest.tasteScale.' + taste()) }}</p> }
              </div>

              <!-- Fertility / yield -->
              <div>
                <label class="block text-[12px] font-medium text-gray-700 mb-2">{{ t('harvest.fertility') }}</label>
                <div class="flex items-center gap-2">
                  @for (n of [1,2,3,4,5]; track n) {
                    <button type="button" (click)="fertility.set(n)"
                            class="flex-1 py-2.5 rounded-lg border-[0.5px] text-[15px] transition-colors"
                            [class.border-gw-green]="fertility() === n"
                            [class.bg-gw-green-light]="fertility() === n"
                            [class.border-gray-200]="fertility() !== n">
                      {{ n <= fertility() ? '★' : '☆' }}
                    </button>
                  }
                </div>
                @if (fertility()) { <p class="text-[11px] text-gray-400 mt-1">{{ t('harvest.fertilityScale.' + fertility()) }}</p> }
              </div>

              <!-- Recommendation -->
              <div>
                <label class="block text-[12px] font-medium text-gray-700 mb-2">{{ t('harvest.recommendation') }}</label>
                <div class="grid grid-cols-3 gap-2">
                  @for (r of recs; track r) {
                    <button type="button" (click)="recommendation.set(r)"
                            class="py-2.5 rounded-lg border-[0.5px] text-[12px] font-medium transition-colors"
                            [class.border-gw-green]="recommendation() === r"
                            [class.bg-gw-green-light]="recommendation() === r"
                            [class.text-gw-green-dark]="recommendation() === r"
                            [class.border-gray-200]="recommendation() !== r"
                            [class.text-gray-600]="recommendation() !== r">
                      {{ t('harvest.rec.' + r) }}
                    </button>
                  }
                </div>
              </div>

              <!-- Notes -->
              <div>
                <label class="block text-[12px] font-medium text-gray-700 mb-2">{{ t('harvest.notes') }}</label>
                <textarea [ngModel]="notes()" (ngModelChange)="notes.set($event)"
                          rows="3"
                          [placeholder]="t('harvest.notesPlaceholder')"
                          class="w-full border-[0.5px] border-gray-200 rounded-lg px-3 py-2 text-[12px] outline-none focus:border-gw-green transition-colors resize-none"></textarea>
              </div>

              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="submit()"
                        [disabled]="!canSubmit() || saving()"
                        class="flex-1 bg-gw-green text-white text-[13px] py-3 rounded-xl font-medium hover:bg-gw-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ saving() ? t('harvest.saving') : t('harvest.confirm') }}
                </button>
                <button (click)="cancel()"
                        class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class HarvestSummaryModalComponent {
  plant = input<Plant | null>(null);
  saving = input<boolean>(false);
  confirmed = output<{ taste: number; fertility: number; recommendation: Rec; notes?: string }>();
  cancelled = output<void>();

  taste = signal(0);
  fertility = signal(0);
  recommendation = signal<Rec | null>(null);
  notes = signal('');

  recs: Rec[] = ['yes', 'maybe', 'no'];

  canSubmit = computed(() => this.taste() > 0 && this.fertility() > 0 && this.recommendation() !== null);

  submit() {
    if (!this.canSubmit()) return;
    this.confirmed.emit({
      taste: this.taste(),
      fertility: this.fertility(),
      recommendation: this.recommendation()!,
      notes: this.notes().trim() || undefined,
    });
  }

  cancel() {
    this.taste.set(0);
    this.fertility.set(0);
    this.recommendation.set(null);
    this.notes.set('');
    this.cancelled.emit();
  }
}
