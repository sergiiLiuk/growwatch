import { Component, input, output, effect, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlantService, Plant, PLANT_TYPE_OPTIONS } from '../../core/services/plant.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-plant-edit-modal',
  imports: [FormsModule],
  template: `
    @if (plant()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancel()">
        <div class="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border-[0.5px] border-gray-200"
             (click)="$event.stopPropagation()">
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>
          <div class="p-6">
            <h2 class="text-[14px] font-medium text-gray-800 mb-1">Edit plant</h2>
            <p class="text-[13px] text-gray-400 mb-5">Update details for {{ plant()!.name }}.</p>
            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">Plant name</label>
                <input [ngModel]="name()" (ngModelChange)="name.set($event)"
                       type="text" placeholder="e.g. Big Basil"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">Plant type</label>
                <select [ngModel]="plant()!.type" disabled
                        class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none bg-gray-50 text-gray-400 cursor-not-allowed">
                  @for (group of typeGroups; track group.name) {
                    <optgroup [label]="group.name">
                      @for (opt of group.options; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </optgroup>
                  }
                </select>
                <p class="text-[11px] text-gray-400 mt-1">Plant type cannot be changed after creation.</p>
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">Planting date</label>
                <input [ngModel]="date()" (ngModelChange)="date.set($event)"
                       type="date"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">How many plants?</label>
                <div class="flex items-center gap-3">
                  <button (click)="count.update(n => n > 1 ? n - 1 : 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">−</button>
                  <span class="flex-1 text-center text-[15px] font-medium text-gray-800">{{ count() }}</span>
                  <button (click)="count.update(n => n + 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">+</button>
                </div>
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-0.5">Daily light target</label>
                <p class="text-[11px] text-gray-300 mb-1.5">Hours of adequate light this plant needs per day</p>
                <div class="flex items-center gap-3">
                  <button (click)="dailyLightHours.update(n => n > 1 ? n - 1 : 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">−</button>
                  <span class="flex-1 text-center text-[15px] font-medium text-gray-800">{{ dailyLightHours() }} h</span>
                  <button (click)="dailyLightHours.update(n => n < 24 ? n + 1 : 24)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">+</button>
                </div>
              </div>
              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="save()"
                        [disabled]="!canSave() || saving()"
                        class="flex-1 bg-gw-green text-white text-[13px] py-3 rounded-xl font-medium hover:bg-gw-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ saving() ? 'Saving…' : 'Save changes' }}
                </button>
                <button (click)="cancel()"
                        class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class PlantEditModalComponent {
  private plantService = inject(PlantService);

  plant = input<Plant | null>(null);
  saved = output<void>();
  cancelled = output<void>();

  name = signal('');
  date = signal('');
  count = signal(1);
  dailyLightHours = signal(12);
  saving = signal(false);

  typeGroups = Array.from(
    PLANT_TYPE_OPTIONS.reduce((map, opt) => {
      if (!map.has(opt.group)) map.set(opt.group, []);
      map.get(opt.group)!.push(opt);
      return map;
    }, new Map<string, typeof PLANT_TYPE_OPTIONS>())
  ).map(([name, options]) => ({ name, options }));

  canSave = computed(() => this.name().trim().length > 0 && this.date().length > 0);

  constructor() {
    effect(() => {
      const p = this.plant();
      if (p) {
        this.name.set(p.name);
        this.date.set(dayjs(p.plantedDate).format('YYYY-MM-DD'));
        this.count.set(p.count);
        this.dailyLightHours.set(p.dailyLightHours ?? 12);
        this.saving.set(false);
      }
    });
  }

  save() {
    const p = this.plant();
    if (!p || !this.canSave()) return;
    this.saving.set(true);
    this.plantService.update(p.id, this.name(), p.type, dayjs(this.date()).toDate(), this.count(), this.dailyLightHours())
      .subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: err => { console.error('Failed to update plant:', err); this.saving.set(false); },
      });
  }

  cancel() {
    this.saving.set(false);
    this.cancelled.emit();
  }
}
