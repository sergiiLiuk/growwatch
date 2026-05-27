import { Component, signal, inject, computed, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PlantService, Plant, PlantType } from '../../core/services/plant.service';
import { PlantEditModalComponent } from './plant-edit-modal.component';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import { StatusBadgeComponent } from '../../shared/components/atoms/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/atoms/empty-state.component';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { TranslocoDirective } from '@jsverse/transloco';
import dayjs from 'dayjs';

@Component({
  selector: 'app-plants',
  imports: [FormsModule, RouterLink, PlantEditModalComponent, StatusBadgeComponent, EmptyStateComponent, IconComponent, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-[18px] font-medium text-gray-800">{{ t('plants.myPlants') }}</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">
            {{ plants().length === 1 ? t('plants.plantCountOne') : t('plants.plantCount', { n: plants().length }) }}
            @if (plants().length > 0) { · {{ t('plants.allMonitored') }} }
          </p>
        </div>
        <button (click)="showForm.set(true)"
                [disabled]="showForm()"
                class="text-[13px] bg-white border-[0.5px] border-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {{ t('plants.addPlantButton') }}
        </button>
      </div>

      <!-- Empty state -->
      @if (!plantsLoading() && plants().length === 0) {
        <app-empty-state emoji="🌱" [title]="t('plants.noPlantsYet')"
                         [subtitle]="t('plants.noPlantsSubtitle')" />
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

  getEmoji(type: PlantType): string {
    return PLANT_TYPE_STYLE[type]?.emoji ?? '🌿';
  }

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

  typeGroups = this.plantService.typeGroups;

  canSubmit = computed(() =>
    this.formName().trim().length > 0 &&
    this.formType().length > 0 &&
    this.formDate().length > 0
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
    return this.plantService.getTypeLabel(type);
  }

  addPlant() {
    const type = this.formType();
    if (!this.canSubmit() || !type) return;
    this.saving.set(true);
    this.plantService.add(this.formName(), type, dayjs(this.formDate()).toDate(), this.formCount())
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
