import { Component, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlantService, Plant, PlantType, PLANT_TYPE_OPTIONS } from '../../core/services/plant.service';

const PLANT_TYPE_STYLE: Record<PlantType, { emoji: string; bg: string }> = {
  TOMATO:     { emoji: '🍅', bg: 'bg-orange-50' },
  PEPPER:     { emoji: '🌶️', bg: 'bg-red-50'    },
  CUCUMBER:   { emoji: '🥒', bg: 'bg-lime-50'   },
  ZUCCHINI:   { emoji: '🥬', bg: 'bg-green-50'  },
  EGGPLANT:   { emoji: '🍆', bg: 'bg-purple-50' },
  LETTUCE:    { emoji: '🥬', bg: 'bg-green-50'  },
  SPINACH:    { emoji: '🥬', bg: 'bg-emerald-50'},
  KALE:       { emoji: '🥬', bg: 'bg-teal-50'   },
  ARUGULA:    { emoji: '🌿', bg: 'bg-lime-50'   },
  RADISH:     { emoji: '🌱', bg: 'bg-pink-50'   },
  BASIL:      { emoji: '🌿', bg: 'bg-teal-50'   },
  MINT:       { emoji: '🌱', bg: 'bg-emerald-50'},
  PARSLEY:    { emoji: '🌿', bg: 'bg-green-50'  },
  CILANTRO:   { emoji: '🌿', bg: 'bg-lime-50'   },
  CHIVE:      { emoji: '🌱', bg: 'bg-green-50'  },
  OREGANO:    { emoji: '🌿', bg: 'bg-amber-50'  },
  THYME:      { emoji: '🌿', bg: 'bg-yellow-50' },
  ROSEMARY:   { emoji: '🌿', bg: 'bg-sky-50'    },
  STRAWBERRY: { emoji: '🍓', bg: 'bg-red-50'    },
};

@Component({
  selector: 'app-plants',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-lg font-medium text-gray-800">My plants</h1>
          <p class="text-xs text-gray-400 mt-0.5">
            {{ plants().length }} plant{{ plants().length !== 1 ? 's' : '' }}
            @if (plants().length > 0) { · all monitored }
          </p>
        </div>
        <button (click)="showForm.set(true)"
                [disabled]="showForm()"
                class="text-sm bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          + Add plant
        </button>
      </div>

      <!-- Empty state -->
      @if (plants().length === 0) {
        <div class="text-center py-16">
          <div class="text-4xl mb-3">🌱</div>
          <p class="text-gray-500 text-sm">No plants yet.</p>
          <p class="text-gray-400 text-xs mt-1">Add your first plant to personalise the greenhouse voice.</p>
        </div>
      }

      <!-- Plant list -->
      <div class="flex flex-col gap-2">
        @for (plant of plants(); track plant.id) {
          <div class="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:border-gray-200 transition-colors"
               [routerLink]="['/plants', plant.id]">
            <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-2xl"
                 [class]="getStyle(plant.type).bg">
              {{ getStyle(plant.type).emoji }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-sm text-gray-900 truncate">{{ plant.name }}</div>
              <div class="text-xs text-gray-400 mt-0.5">
                {{ getTypeLabel(plant.type) }} · planted {{ formatDate(plant.plantedDate) }} · {{ plantService.getAgeLabel(plant) }}
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">Monitored</span>
              <span class="text-gray-300 text-base">›</span>
            </div>
          </div>
        }
      </div>

      <!-- Add another plant — bottom CTA -->
      @if (plants().length > 0) {
        <button (click)="showForm.set(true)"
                [disabled]="showForm()"
                class="w-full mt-3 py-4 text-sm text-gray-400 hover:text-gray-600 border-t border-dashed border-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          + Add another plant
        </button>
      }
    </div>

    <!-- Backdrop + bottom-sheet (mobile) / modal (desktop) -->
    @if (showForm()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancelForm()">
        <div class="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl"
             (click)="$event.stopPropagation()">

          <!-- Drag handle — mobile only -->
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>

          <div class="p-6">
            <h2 class="text-base font-medium text-gray-800 mb-1">Add a plant</h2>
            <p class="text-sm text-gray-400 mb-5">Tell me what you're growing.</p>

            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-xs text-gray-400 mb-1.5">Plant name</label>
                <input [ngModel]="formName()" (ngModelChange)="formName.set($event)"
                       type="text" placeholder="e.g. Big Basil"
                       class="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-green-400 transition-colors" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1.5">Plant type</label>
                <select [ngModel]="formType()" (ngModelChange)="formType.set($event)"
                        class="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-green-400 transition-colors bg-white">
                  <option value="">Select a plant type…</option>
                  @for (group of typeGroups; track group.name) {
                    <optgroup [label]="group.name">
                      @for (opt of group.options; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </optgroup>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1.5">Planting date</label>
                <input [ngModel]="formDate()" (ngModelChange)="formDate.set($event)"
                       type="date"
                       class="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-green-400 transition-colors" />
              </div>

              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="addPlant()"
                        [disabled]="!canSubmit() || saving()"
                        class="flex-1 bg-green-600 text-white text-sm py-3 rounded-xl font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ saving() ? 'Adding…' : 'Add to my greenhouse' }}
                </button>
                <button (click)="cancelForm()"
                        class="px-4 text-sm text-gray-400 hover:text-gray-600 transition-colors">
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
export class PlantsComponent {
  plantService = inject(PlantService);
  plants = this.plantService.plants;
  showForm = signal(false);

  formName = signal('');
  formType = signal('' as PlantType | '');
  formDate = signal('');
  saving = signal(false);

  typeGroups = Array.from(
    PLANT_TYPE_OPTIONS.reduce((map, opt) => {
      if (!map.has(opt.group)) map.set(opt.group, []);
      map.get(opt.group)!.push(opt);
      return map;
    }, new Map<string, typeof PLANT_TYPE_OPTIONS>())
  ).map(([name, options]) => ({ name, options }));

  canSubmit = computed(() =>
    this.formName().trim().length > 0 &&
    this.formType().length > 0 &&
    this.formDate().length > 0
  );

  getStyle(type: PlantType) {
    return PLANT_TYPE_STYLE[type] ?? { emoji: '🌿', bg: 'bg-green-50' };
  }

  getTypeLabel(type: PlantType): string {
    return PLANT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  addPlant() {
    const type = this.formType();
    if (!this.canSubmit() || !type) return;
    this.saving.set(true);
    this.plantService.add(this.formName(), type, new Date(this.formDate()))
      .subscribe({
        next: () => this.cancelForm(),
        error: err => { console.error('Failed to add plant:', err); this.saving.set(false); },
      });
  }

  cancelForm() {
    this.formName.set('');
    this.formType.set('');
    this.formDate.set('');
    this.saving.set(false);
    this.showForm.set(false);
  }

}
