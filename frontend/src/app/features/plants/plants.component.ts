import { Component, signal, inject, computed, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PlantService, Plant, PlantType } from '../../core/services/plant.service';
import { PlantEditModalComponent } from './plant-edit-modal.component';
import { QuickLogSheetComponent } from './quick-log-sheet.component';
import { PlantCareFieldsComponent, emptyCare } from './plant-care-fields.component';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import { PullToRefreshDirective } from '../../shared/directives/pull-to-refresh.directive';
import { StatusBadgeComponent } from '../../shared/components/atoms/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/atoms/empty-state.component';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { TranslocoDirective } from '@jsverse/transloco';
import dayjs from 'dayjs';

@Component({
  selector: 'app-plants',
  imports: [FormsModule, RouterLink, PlantEditModalComponent, QuickLogSheetComponent, PlantCareFieldsComponent, StatusBadgeComponent, EmptyStateComponent, IconComponent, PullToRefreshDirective, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 pb-6" gwPullToRefresh (gwPullRefresh)="plantService.reload()" *transloco="let t">

      <!-- Sticky top: title + actions + search + type filter -->
      <div class="sticky top-0 z-30 -mx-4 px-4 pt-5 pb-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">

      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-[18px] font-medium text-gray-800">{{ t('plants.myPlants') }}</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">
            {{ plants().length === 1 ? t('plants.plantCountOne') : t('plants.plantCount', { n: plants().length }) }}
            @if (plants().length > 0) { · {{ t('plants.allMonitored') }} }
          </p>
        </div>
        <div class="flex items-center gap-2">
          @if (plants().length > 0) {
            <button (click)="quickLogOpen.set(true)"
                    class="text-[13px] bg-gw-green text-white px-4 py-2 rounded-xl hover:bg-gw-green-dark transition-colors">
              {{ t('quickLog.button') }}
            </button>
          }
          <button (click)="showForm.set(true)"
                  [disabled]="showForm()"
                  class="text-[13px] bg-white border-[0.5px] border-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {{ t('plants.addPlantButton') }}
          </button>
        </div>
      </div>

      <!-- Search + sort -->
      @if (plants().length > 0) {
        <div class="flex items-center gap-2 mb-3 relative">
          <div class="flex-1 relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <app-icon name="search" class="w-4 h-4" />
            </span>
            <input type="text" [ngModel]="search()" (ngModelChange)="search.set($event)"
                   [placeholder]="t('plants.searchPlaceholder')"
                   class="w-full pl-10 pr-9 py-2.5 bg-white border-[0.5px] border-gray-200 rounded-xl text-[13px] outline-none focus:border-gw-green transition-colors" />
            @if (search()) {
              <button type="button" (click)="search.set('')"
                      [attr.aria-label]="t('plants.clearSearch')"
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                <app-icon name="x" class="w-3.5 h-3.5" />
              </button>
            }
          </div>
          <button (click)="sortMenuOpen.set(!sortMenuOpen()); $event.stopPropagation()"
                  class="w-10 h-10 flex items-center justify-center bg-white border-[0.5px] border-gray-200 rounded-xl text-gray-500 hover:border-gray-300 transition-colors shrink-0">
            <app-icon name="sliders" class="w-4 h-4" />
          </button>
          @if (sortMenuOpen()) {
            <div class="absolute right-0 top-12 z-50 bg-white rounded-xl border-[0.5px] border-gray-200 w-44 py-1"
                 style="box-shadow: 0 2px 12px rgba(0,0,0,0.08)"
                 (click)="$event.stopPropagation()">
              @for (opt of sortOptions; track opt.value) {
                <button (click)="setSort(opt.value)"
                        class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <span>{{ t('plants.sortBy.' + opt.value) }}</span>
                  @if (sort() === opt.value) {
                    <span class="text-gw-green-dark">✓</span>
                  }
                </button>
              }
            </div>
          }
        </div>
      }

      <!-- Type filter chips — only types the user actually owns -->
      @if (availableTypes().length > 1) {
        <div class="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1" style="scrollbar-width:none">
          <button (click)="typeFilter.set('all')"
                  class="shrink-0 text-[12px] px-3 py-1.5 rounded-full border-[0.5px] transition-colors"
                  [class.bg-gw-green]="typeFilter() === 'all'"
                  [class.text-white]="typeFilter() === 'all'"
                  [class.border-gw-green]="typeFilter() === 'all'"
                  [class.bg-white]="typeFilter() !== 'all'"
                  [class.text-gray-600]="typeFilter() !== 'all'"
                  [class.border-gray-200]="typeFilter() !== 'all'">
            {{ t('plants.filterAll') }} · {{ plants().length }}
          </button>
          @for (entry of availableTypes(); track entry.type) {
            <button (click)="typeFilter.set(entry.type)"
                    class="shrink-0 text-[12px] px-3 py-1.5 rounded-full border-[0.5px] flex items-center gap-1.5 transition-colors"
                    [class.bg-gw-green]="typeFilter() === entry.type"
                    [class.text-white]="typeFilter() === entry.type"
                    [class.border-gw-green]="typeFilter() === entry.type"
                    [class.bg-white]="typeFilter() !== entry.type"
                    [class.text-gray-600]="typeFilter() !== entry.type"
                    [class.border-gray-200]="typeFilter() !== entry.type">
              <span>{{ getStyle(entry.type).emoji }}</span>
              <span>{{ getTypeLabel(entry.type) }}</span>
              <span class="opacity-60">{{ entry.count }}</span>
            </button>
          }
        </div>
      }

      <!-- /sticky wrapper -->
      </div>

      <!-- Empty state -->
      @if (!plantsLoading() && plants().length === 0) {
        <app-empty-state emoji="🌱" [title]="t('plants.noPlantsYet')"
                         [subtitle]="t('plants.noPlantsSubtitle')" />
      }

      @if (plants().length > 0 && visiblePlants().length === 0) {
        <p class="text-[12px] text-gray-400 text-center py-6">{{ t('plants.noMatches') }}</p>
      }

      <!-- Plant list -->
      <div class="flex flex-col gap-2">
        @for (plant of visiblePlants(); track plant.id) {
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
                <app-status-badge [label]="plant.monitored ? t('plants.monitored') : t('plants.paused')"
                                  [variant]="plant.monitored ? 'green' : 'gray'" />
                <button (click)="$event.stopPropagation(); toggleMenu(plant.id)"
                        class="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                  <app-icon name="dots-vertical" class="w-[14px] h-[14px]" />
                </button>
              </div>
            </div>

            <!-- Floating popover -->
            @if (menuOpenId() === plant.id) {
              <div class="absolute right-0 top-full mt-1 z-[50] bg-white rounded-xl border-[0.5px] border-gray-200 w-44 py-1"
                   style="box-shadow: 0 2px 12px rgba(0,0,0,0.08)">
                <button (click)="startEdit(plant)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <app-icon name="pencil-square" class="w-[14px] h-[14px]" />
                  {{ t('plants.editPlant') }}
                </button>
                <button (click)="toggleMonitored(plant)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <app-icon [name]="plant.monitored ? 'pause' : 'play'" class="w-[14px] h-[14px]" />
                  {{ plant.monitored ? t('plants.pauseMonitoring') : t('plants.resumeMonitoring') }}
                </button>
                <button (click)="startDelete(plant)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gw-red hover:bg-gw-red-light transition-colors">
                  <app-icon name="trash-simple" class="w-[14px] h-[14px]" />
                  {{ t('plants.removePlant') }}
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
          {{ t('plants.addAnotherPlant') }}
        </button>
      }

      <!-- Archived plants -->
      @if (archivedPlants().length > 0) {
        <div class="mt-5 border-t border-gray-100 pt-4">
          <button (click)="showArchived.set(!showArchived())"
                  class="text-[11px] text-gray-400 hover:text-gray-600 transition-colors mb-2">
            {{ showArchived() ? t('plants.hideArchived') : t('plants.showArchived', { n: archivedPlants().length }) }}
          </button>
          @if (showArchived()) {
            <div class="flex flex-col gap-2">
              @for (plant of archivedPlants(); track plant.id) {
                <a [routerLink]="['/plants', plant.id]"
                   class="bg-gray-50 border-[0.5px] border-gray-200 rounded-xl p-3 flex items-center gap-3 hover:border-gray-300 transition-colors">
                  <span class="text-xl opacity-60">{{ getEmoji(plant.type) }}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium text-gray-600 truncate">{{ plant.name }}</div>
                    <div class="text-[11px] text-gray-400">{{ t('common.archived') }}</div>
                  </div>
                </a>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Add plant modal -->
    @if (showForm()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancelForm()" *transloco="let t">
        <div class="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border-[0.5px] border-gray-200"
             (click)="$event.stopPropagation()">
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>
          <div class="p-6">
            <h2 class="text-[14px] font-medium text-gray-800 mb-1">{{ t('plants.addPlant') }}</h2>
            <p class="text-[13px] text-gray-400 mb-5">{{ t('plants.addPlantSubtitle') }}</p>
            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plants.plantName') }}</label>
                <input [ngModel]="formName()" (ngModelChange)="formName.set($event)"
                       type="text" [placeholder]="t('plants.namePlaceholder')"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plants.plantType') }}</label>
                <select [ngModel]="formType()" (ngModelChange)="formType.set($event)"
                        class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors bg-white">
                  <option value="">{{ t('plants.selectType') }}</option>
                  @for (group of typeGroups; track group.name) {
                    <optgroup [label]="t('plantTypeGroups.' + group.name)">
                      @for (opt of group.options; track opt.value) {
                        <option [value]="opt.value">{{ t('plantTypes.' + opt.value) }}</option>
                      }
                    </optgroup>
                  }
                </select>
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plants.plantingDate') }}</label>
                <input [ngModel]="formDate()" (ngModelChange)="formDate.set($event)"
                       type="date"
                       class="w-full border-[0.5px] border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-gw-green transition-colors" />
              </div>
              <div>
                <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('plants.howMany') }}</label>
                <div class="flex items-center gap-3">
                  <button (click)="formCount.update(n => n > 1 ? n - 1 : 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">−</button>
                  <span class="flex-1 text-center text-[15px] font-medium text-gray-800">{{ formCount() }}</span>
                  <button (click)="formCount.update(n => n + 1)"
                          class="w-10 h-10 rounded-xl border-[0.5px] border-gray-200 text-gray-600 text-lg hover:bg-gray-50 transition-colors flex items-center justify-center">+</button>
                </div>
                <p class="text-[11px] text-gray-400 mt-1.5">{{ t('plants.countHint') }}</p>
              </div>
              <app-plant-care-fields [(care)]="formCare" />
              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="addPlant()"
                        [disabled]="!canSubmit() || saving()"
                        class="flex-1 bg-gw-green text-white text-[13px] py-3 rounded-xl font-medium hover:bg-gw-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ saving() ? t('plants.adding') : (formName().trim() ? t('plants.addToGreenhouse', { name: formName().trim() }) : t('plants.addPlantGeneric')) }}
                </button>
                <button (click)="cancelForm()"
                        class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Quick log sheet (handles its own inline success banner + undo) -->
    <app-quick-log-sheet [open]="quickLogOpen()" [plants]="plants()"
                         (closed)="quickLogOpen.set(false)" />

    <!-- Edit plant modal -->
    <app-plant-edit-modal [plant]="editingPlant()" (saved)="cancelEdit()" (cancelled)="cancelEdit()" />

    <!-- Delete confirmation modal -->
    @if (deletePlant()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4"
           (click)="cancelDelete()" *transloco="let t">
        <div class="w-full max-w-sm bg-white rounded-xl border-[0.5px] border-gray-200 p-6 text-center"
             (click)="$event.stopPropagation()">
          <div class="w-14 h-14 bg-gw-red-light rounded-full flex items-center justify-center mx-auto mb-4">
            <app-icon name="trash-simple" class="w-[22px] h-[22px] text-gw-red" />
          </div>
          <h2 class="text-[16px] font-medium text-gray-900 mb-2">{{ t('plants.removeTitle', { name: deletePlant()!.name }) }}</h2>
          <p class="text-[13px] text-gray-500 mb-6 leading-relaxed">
            {{ t('plants.removeBody', { name: deletePlant()!.name }) }}
          </p>
          <div class="flex gap-3">
            <button (click)="cancelDelete()"
                    class="flex-1 py-3 text-[13px] text-gray-700 bg-white border-[0.5px] border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              {{ t('plants.keepIt') }}
            </button>
            <button (click)="doDelete()"
                    [disabled]="deleting()"
                    class="flex-1 py-3 text-[13px] text-white bg-gw-red rounded-xl hover:bg-gw-red-dark disabled:opacity-40 transition-colors font-medium">
              {{ deleting() ? t('plants.removing') : t('common.remove') }}
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
  archivedPlants = this.plantService.archivedPlants;
  showArchived = signal(false);

  // Quick log batch
  quickLogOpen = signal(false);

  // Search + sort + type filter
  search = signal('');
  sort = signal<'name' | 'type' | 'recent'>('name');
  sortMenuOpen = signal(false);
  typeFilter = signal<PlantType | 'all'>('all');
  sortOptions: { value: 'name' | 'type' | 'recent' }[] = [
    { value: 'name' }, { value: 'type' }, { value: 'recent' },
  ];

  /** Distinct types present in the user's collection, with a count of each. */
  availableTypes = computed(() => {
    const counts = new Map<PlantType, number>();
    for (const p of this.plants()) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => this.getTypeLabel(a.type).localeCompare(this.getTypeLabel(b.type)));
  });

  visiblePlants = computed(() => {
    const q = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    const filtered = this.plants().filter(p => {
      if (type !== 'all' && p.type !== type) return false;
      if (q && !p.name.toLowerCase().includes(q) && !this.getTypeLabel(p.type).toLowerCase().includes(q)) return false;
      return true;
    });
    const list = [...filtered];
    const s = this.sort();
    if (s === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (s === 'type') list.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    else list.sort((a, b) => b.plantedDate.getTime() - a.plantedDate.getTime());
    return list;
  });

  setSort(value: 'name' | 'type' | 'recent') {
    this.sort.set(value);
    this.sortMenuOpen.set(false);
  }

  getEmoji(type: PlantType): string {
    return PLANT_TYPE_STYLE[type]?.emoji ?? '🌿';
  }

  // Add form
  showForm = signal(false);
  formName = signal('');
  formType = signal('' as PlantType | '');
  formDate = signal('');
  formCount = signal(1);
  formCare = signal(emptyCare());
  saving = signal(false);

  // 3-dot menu
  menuOpenId = signal<string | null>(null);

  // Delete confirmation
  deletePlant = signal<Plant | null>(null);
  deleting = signal(false);

  // Edit modal
  editingPlant = signal<Plant | null>(null);

  typeGroups = this.plantService.typeGroups;

  canSubmit = computed(() =>
    this.formName().trim().length > 0 &&
    this.formType().length > 0 &&
    this.formDate().length > 0
  );

  @HostListener('document:click')
  closeMenu() {
    this.menuOpenId.set(null);
    this.sortMenuOpen.set(false);
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
    return this.plantService.getTypeLabel(type);
  }

  addPlant() {
    const type = this.formType();
    if (!this.canSubmit() || !type) return;
    this.saving.set(true);
    this.plantService.add(this.formName(), type, dayjs(this.formDate()).toDate(), this.formCount(), 12, this.formCare())
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
    this.formCare.set(emptyCare());
    this.saving.set(false);
    this.showForm.set(false);
  }

  startEdit(plant: Plant) {
    this.editingPlant.set(plant);
  }

  cancelEdit() {
    this.editingPlant.set(null);
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
