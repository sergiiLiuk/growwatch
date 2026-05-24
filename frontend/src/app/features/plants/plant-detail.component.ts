import { Component, inject, computed, signal, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PlantService, Plant, PlantType, PLANT_TYPE_OPTIONS } from '../../core/services/plant.service';
import { PlantEditModalComponent } from './plant-edit-modal.component';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { StatusBadgeComponent } from '../../shared/components/atoms/status-badge.component';
import { TranslocoDirective } from '@jsverse/transloco';
import dayjs from 'dayjs';

@Component({
  selector: 'app-plant-detail',
  imports: [PlantEditModalComponent, IconComponent, StatusBadgeComponent, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <button (click)="back()"
                class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
          ‹ {{ t('plants.myPlants') }}
        </button>
        @if (plant()) {
          <div class="relative">
            <button (click)="toggleMenu($event)"
                    class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              <app-icon name="dots-vertical" class="w-[14px] h-[14px]" />
            </button>
            @if (menuOpen()) {
              <div class="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border-[0.5px] border-gray-200 w-44 py-1"
                   style="box-shadow: 0 2px 12px rgba(0,0,0,0.08)">
                <button (click)="startEdit($event)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <app-icon name="pencil-square" class="w-[14px] h-[14px]" />
                  {{ t('plants.editPlant') }}
                </button>
                <button (click)="toggleMonitored($event)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <app-icon [name]="plant()!.monitored ? 'pause' : 'play'" class="w-[14px] h-[14px]" />
                  {{ plant()!.monitored ? t('plants.pauseMonitoring') : t('plants.resumeMonitoring') }}
                </button>
              </div>
            }
          </div>
        }
      </div>

      @if (plant(); as p) {

        <!-- Plant card — desaturated when monitoring is paused -->
        <div class="rounded-2xl p-5 mb-4 transition-colors"
             [class.bg-gw-green-light]="p.monitored"
             [class.bg-gray-100]="!p.monitored">
          <div class="flex items-center gap-4 mb-5">
            <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center text-3xl shrink-0"
                 [class.opacity-60]="!p.monitored">
              {{ getEmoji(p.type) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="text-[20px] font-semibold leading-tight"
                    [class.text-gw-green-dark]="p.monitored"
                    [class.text-gray-700]="!p.monitored">
                  {{ p.name }}
                </h1>
                @if (!p.monitored) {
                  <app-status-badge [label]="t('plants.paused')" variant="gray" />
                }
              </div>
              <p class="text-[13px] mt-0.5"
                 [class.text-gw-green-dark/70]="p.monitored"
                 [class.text-gray-500]="!p.monitored">
                {{ getTypeLabel(p.type) }} · {{ p.count === 1 ? t('plants.plantCountOne') : t('plants.plantCount', { n: p.count }) }}
              </p>
              @if (!p.monitored) {
                <p class="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
                  <app-icon name="pause" class="w-3 h-3" />
                  {{ t('plants.monitoringPaused') }}
                </p>
              }
            </div>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-white rounded-xl p-3 text-center">
              <div class="text-[16px] font-semibold text-gw-green-dark">{{ plantService.getAgeShort(p) }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">{{ t('plants.age') }}</div>
            </div>
            <div class="bg-white rounded-xl p-3 text-center">
              <div class="text-[15px] font-semibold text-gw-green-dark">{{ getPlantedLabel(p) }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">{{ t('plants.planted') }}</div>
            </div>
            <div class="bg-white rounded-xl p-3 text-center">
              <div class="text-[16px] font-semibold text-gw-green-dark">{{ p.count }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">{{ t('nav.plants') }}</div>
            </div>
          </div>
        </div>

      } @else {
        <p class="text-[13px] text-gray-400">{{ t('plants.plantNotFound') }}</p>
      }

    </div>

    <!-- Edit modal -->
    <app-plant-edit-modal [plant]="editingPlant()" (saved)="cancelEdit()" (cancelled)="cancelEdit()" />
  `,
})
export class PlantDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  plantService = inject(PlantService);

  plant = computed(() => {
    const id = this.route.snapshot.paramMap.get('id');
    return this.plantService.plants().find(p => p.id === id) ?? null;
  });

  menuOpen = signal(false);
  editingPlant = signal<Plant | null>(null);

  @HostListener('document:click')
  closeMenu() { this.menuOpen.set(false); }

  toggleMenu(e: Event) {
    e.stopPropagation();
    this.menuOpen.update(v => !v);
  }

  back() { this.router.navigate(['/plants']); }

  getEmoji(type: PlantType): string {
    return PLANT_TYPE_STYLE[type]?.emoji ?? '🌿';
  }

  getTypeLabel(type: PlantType): string {
    return PLANT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
  }

  getPlantedLabel(plant: Plant): string {
    return dayjs(plant.plantedDate).format('D MMM');
  }

  toggleMonitored(e: Event) {
    e.stopPropagation();
    const p = this.plant();
    if (!p) return;
    this.plantService.setMonitored(p.id, !p.monitored).subscribe();
    this.menuOpen.set(false);
  }

  startEdit(e: Event) {
    e.stopPropagation();
    const p = this.plant();
    if (!p) return;
    this.menuOpen.set(false);
    this.editingPlant.set(p);
  }

  cancelEdit() {
    this.editingPlant.set(null);
  }
}
