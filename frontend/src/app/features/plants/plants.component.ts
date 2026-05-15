import { Component, signal, inject, computed, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  imports: [FormsModule],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-[18px] font-medium text-gray-800">My plants</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">
            {{ plants().length }} plant{{ plants().length !== 1 ? 's' : '' }}
            @if (plants().length > 0) { · all monitored }
          </p>
        </div>
        <button (click)="showForm.set(true)"
                [disabled]="showForm()"
                class="text-[13px] bg-white border-[0.5px] border-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          + Add plant
        </button>
      </div>

      <!-- Empty state -->
      @if (!plantsLoading() && plants().length === 0) {
        <div class="text-center py-16">
          <div class="text-4xl mb-3">🌱</div>
          <p class="text-[13px] text-gray-500">No plants yet.</p>
          <p class="text-[11px] text-gray-400 mt-1">Add your first plant to personalise the greenhouse voice.</p>
        </div>
      }

      <!-- Plant list -->
      <div class="flex flex-col gap-2">
        @for (plant of plants(); track plant.id) {
          <div class="relative">
            <!-- Card -->
            <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-gray-300 transition-colors"
                 (click)="navigateTo(plant.id)">
              <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-xl"
                   [class]="getStyle(plant.type).bg">
                {{ getStyle(plant.type).emoji }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-[14px] text-gray-900 truncate">{{ plant.name }}</div>
                <div class="text-[11px] text-gray-400 mt-0.5">
                  {{ getTypeLabel(plant.type) }} · {{ plantService.getAgeLabel(plant) }} · ×{{ plant.count }}
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[11px] px-2.5 py-1 rounded-full font-medium"
                      [class]="plant.monitored ? 'bg-gw-green-light text-gw-green-dark' : 'bg-gray-100 text-gray-400'">
                  {{ plant.monitored ? 'Monitored' : 'Paused' }}
                </span>
                <button (click)="$event.stopPropagation(); toggleMenu(plant.id)"
                        class="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                  <svg width="3" height="15" viewBox="0 0 3 15" fill="currentColor">
                    <circle cx="1.5" cy="1.5" r="1.5"/>
                    <circle cx="1.5" cy="7.5" r="1.5"/>
                    <circle cx="1.5" cy="13.5" r="1.5"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Floating popover -->
            @if (menuOpenId() === plant.id) {
              <div class="absolute right-0 top-full mt-1 z-[50] bg-white rounded-xl border-[0.5px] border-gray-200 w-44 py-1"
                   style="box-shadow: 0 2px 12px rgba(0,0,0,0.08)">
                <button (click)="startEdit(plant)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit plant
                </button>
                <button (click)="toggleMonitored(plant)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    @if (plant.monitored) {
                      <path d="M10 9v6m4-6v6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
                    } @else {
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    }
                  </svg>
                  {{ plant.monitored ? 'Pause monitoring' : 'Resume monitoring' }}
                </button>
                <button (click)="startDelete(plant)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gw-red hover:bg-gw-red-light transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                  Remove plant
                </button>
              </div>
            }
          </div>
        }
      </div>

      <!-- Add another — bottom CTA -->
      @if (plants().length > 0) {
        <button (click)="showForm.set(true)"
                [disabled]="showForm()"
                class="w-full mt-3 py-4 text-[13px] text-gray-400 hover:text-gray-600 border-t border-dashed border-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          + Add another plant
        </button>
      }
    </div>

    <!-- Add plant modal -->
    @if (showForm()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancelForm()">
        <div class="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border-[0.5px] border-gray-200"
             (click)="$event.stopPropagation()">
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>
          <div class="p-6">
            <h2 class="text-[14px] font-medium text-gray-800 mb-1">Add a plant</h2>
            <p class="text-[13px] text-gray-400 mb-5">Tell me what you're growing.</p>
            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">Plant name</label>
                <input [ngModel]="formName()" (ngModelChange)="formName.set($event)"
                       type="text" placeholder="e.g. Big Basil"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">Plant type</label>
                <select [ngModel]="formType()" (ngModelChange)="formType.set($event)"
                        class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors bg-white">
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
                <label class="block text-[11px] text-gray-400 mb-1.5">Planting date</label>
                <input [ngModel]="formDate()" (ngModelChange)="formDate.set($event)"
                       type="date"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">How many plants?</label>
                <div class="flex items-center gap-3">
                  <button (click)="formCount.update(n => n > 1 ? n - 1 : 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">−</button>
                  <span class="flex-1 text-center text-[15px] font-medium text-gray-800">{{ formCount() }}</span>
                  <button (click)="formCount.update(n => n + 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">+</button>
                </div>
                <p class="text-[11px] text-gray-400 mt-1.5">Used to personalise the plant voice</p>
              </div>
              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="addPlant()"
                        [disabled]="!canSubmit() || saving()"
                        class="flex-1 bg-gw-green text-white text-[13px] py-3 rounded-xl font-medium hover:bg-gw-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ saving() ? 'Adding…' : 'Add ' + (formName().trim() || 'plant') + ' to my greenhouse' }}
                </button>
                <button (click)="cancelForm()"
                        class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Edit plant modal -->
    @if (editingPlant()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancelEdit()">
        <div class="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border-[0.5px] border-gray-200"
             (click)="$event.stopPropagation()">
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>
          <div class="p-6">
            <h2 class="text-[14px] font-medium text-gray-800 mb-1">Edit plant</h2>
            <p class="text-[13px] text-gray-400 mb-5">Update details for {{ editingPlant()!.name }}.</p>
            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">Plant name</label>
                <input [ngModel]="editName()" (ngModelChange)="editName.set($event)"
                       type="text" placeholder="e.g. Big Basil"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">Plant type</label>
                <select [ngModel]="editType()" disabled
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
                <input [ngModel]="editDate()" (ngModelChange)="editDate.set($event)"
                       type="date"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">How many plants?</label>
                <div class="flex items-center gap-3">
                  <button (click)="editCount.update(n => n > 1 ? n - 1 : 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">−</button>
                  <span class="flex-1 text-center text-[15px] font-medium text-gray-800">{{ editCount() }}</span>
                  <button (click)="editCount.update(n => n + 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">+</button>
                </div>
              </div>
              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="saveEdit()"
                        [disabled]="!canEditSubmit() || editSaving()"
                        class="flex-1 bg-gw-green text-white text-[13px] py-3 rounded-xl font-medium hover:bg-gw-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ editSaving() ? 'Saving…' : 'Save changes' }}
                </button>
                <button (click)="cancelEdit()"
                        class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Delete confirmation modal -->
    @if (deletePlant()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4"
           (click)="cancelDelete()">
        <div class="w-full max-w-sm bg-white rounded-xl border-[0.5px] border-gray-200 p-6 text-center"
             (click)="$event.stopPropagation()">
          <div class="w-14 h-14 bg-gw-red-light rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round" class="text-gw-red">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <h2 class="text-[16px] font-medium text-gray-900 mb-2">Remove {{ deletePlant()!.name }}?</h2>
          <p class="text-[13px] text-gray-500 mb-6 leading-relaxed">
            This will remove {{ deletePlant()!.name }} and all its history from your greenhouse.
          </p>
          <div class="flex gap-3">
            <button (click)="cancelDelete()"
                    class="flex-1 py-3 text-[13px] text-gray-700 bg-white border-[0.5px] border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Keep it
            </button>
            <button (click)="doDelete()"
                    [disabled]="deleting()"
                    class="flex-1 py-3 text-[13px] text-white bg-gw-red rounded-xl hover:bg-gw-red-dark disabled:opacity-40 transition-colors font-medium">
              {{ deleting() ? 'Removing…' : 'Remove' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PlantsComponent {
  plantService = inject(PlantService);
  private router = inject(Router);
  plants = this.plantService.plants;
  plantsLoading = this.plantService.plantsLoading;

  // Add form
  showForm = signal(false);
  formName = signal('');
  formType = signal('' as PlantType | '');
  formDate = signal('');
  formCount = signal(1);
  saving = signal(false);

  // 3-dot menu
  menuOpenId = signal<string | null>(null);

  // Delete confirmation
  deletePlant = signal<Plant | null>(null);
  deleting = signal(false);

  // Edit modal
  editingPlant = signal<Plant | null>(null);
  editName = signal('');
  editType = signal('' as PlantType | '');
  editDate = signal('');
  editCount = signal(1);
  editSaving = signal(false);

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

  canEditSubmit = computed(() =>
    this.editName().trim().length > 0 &&
    this.editType().length > 0 &&
    this.editDate().length > 0
  );

  @HostListener('document:click')
  closeMenu() {
    this.menuOpenId.set(null);
  }

  toggleMenu(plantId: string) {
    this.menuOpenId.update(id => id === plantId ? null : plantId);
  }

  navigateTo(id: string) {
    this.router.navigate(['/plants', id]);
  }

  getStyle(type: PlantType) {
    return PLANT_TYPE_STYLE[type] ?? { emoji: '🌿', bg: 'bg-green-50' };
  }

  getTypeLabel(type: PlantType): string {
    return PLANT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
  }

  addPlant() {
    const type = this.formType();
    if (!this.canSubmit() || !type) return;
    this.saving.set(true);
    this.plantService.add(this.formName(), type, new Date(this.formDate()), this.formCount())
      .subscribe({
        next: () => this.cancelForm(),
        error: err => { console.error('Failed to add plant:', err); this.saving.set(false); },
      });
  }

  cancelForm() {
    this.formName.set('');
    this.formType.set('');
    this.formDate.set('');
    this.formCount.set(1);
    this.saving.set(false);
    this.showForm.set(false);
  }

  startEdit(plant: Plant) {
    this.editingPlant.set(plant);
    this.editName.set(plant.name);
    this.editType.set(plant.type);
    this.editDate.set(plant.plantedDate.toISOString().split('T')[0]);
    this.editCount.set(plant.count);
  }

  saveEdit() {
    const plant = this.editingPlant();
    const type = this.editType();
    if (!plant || !this.canEditSubmit() || !type) return;
    this.editSaving.set(true);
    this.plantService.update(plant.id, this.editName(), type, new Date(this.editDate()), this.editCount())
      .subscribe({
        next: () => this.cancelEdit(),
        error: err => { console.error('Failed to update plant:', err); this.editSaving.set(false); },
      });
  }

  cancelEdit() {
    this.editingPlant.set(null);
    this.editName.set('');
    this.editType.set('');
    this.editDate.set('');
    this.editCount.set(1);
    this.editSaving.set(false);
  }

  toggleMonitored(plant: Plant) {
    this.plantService.setMonitored(plant.id, !plant.monitored).subscribe();
  }

  startDelete(plant: Plant) {
    this.deletePlant.set(plant);
  }

  doDelete() {
    const plant = this.deletePlant();
    if (!plant) return;
    this.deleting.set(true);
    this.plantService.remove(plant.id)
      .subscribe({
        next: () => this.cancelDelete(),
        error: err => { console.error('Failed to remove plant:', err); this.deleting.set(false); },
      });
  }

  cancelDelete() {
    this.deletePlant.set(null);
    this.deleting.set(false);
  }
}
