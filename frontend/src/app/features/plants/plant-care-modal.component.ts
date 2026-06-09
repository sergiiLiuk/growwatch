import { Component, input, output, effect, signal, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PlantService, Plant, PlantCare } from '../../core/services/plant.service';
import { PlantCareFieldsComponent, emptyCare } from './plant-care-fields.component';

@Component({
  selector: 'app-plant-care-modal',
  imports: [TranslocoDirective, PlantCareFieldsComponent],
  template: `
    @if (plant()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancel()" *transloco="let t">
        <div class="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl shadow-gw-sm"
             (click)="$event.stopPropagation()">
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>
          <div class="p-6">
            <h2 class="text-[14px] font-medium text-gray-800 mb-1">{{ t('plantCare.modalTitle') }}</h2>
            <p class="text-[13px] text-gray-400 mb-5">{{ t('plantCare.modalSubtitle', { name: plant()!.name }) }}</p>
            <div class="flex flex-col gap-4">
              <app-plant-care-fields [(care)]="care" />
              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="save()"
                        [disabled]="saving()"
                        class="flex-1 bg-gw-green text-white text-[13px] py-3 rounded-xl font-medium hover:bg-gw-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ saving() ? t('plants.saving') : t('common.save') }}
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
export class PlantCareModalComponent {
  private plantService = inject(PlantService);

  plant = input<Plant | null>(null);
  saved = output<void>();
  cancelled = output<void>();

  care = signal<PlantCare>(emptyCare());
  saving = signal(false);

  constructor() {
    effect(() => {
      const p = this.plant();
      if (p) {
        this.care.set(p.care ?? emptyCare());
        this.saving.set(false);
      }
    });
  }

  save() {
    const p = this.plant();
    if (!p) return;
    this.saving.set(true);
    this.plantService.update(p.id, p.name, p.type, p.plantedDate, p.count, p.dailyLightHours ?? 12, this.care())
      .subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: err => { console.error('Failed to update care plan:', err); this.saving.set(false); },
      });
  }

  cancel() {
    this.saving.set(false);
    this.cancelled.emit();
  }
}
