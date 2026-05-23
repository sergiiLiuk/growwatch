import { Component, inject, computed, signal, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PlantService, Plant, PlantType, PLANT_TYPE_OPTIONS } from '../../core/services/plant.service';
import { PlantEditModalComponent } from './plant-edit-modal.component';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import dayjs from 'dayjs';

@Component({
  selector: 'app-plant-detail',
  imports: [PlantEditModalComponent],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <button (click)="back()"
                class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
          ‹ My plants
        </button>
        @if (plant()) {
          <div class="relative">
            <button (click)="toggleMenu($event)"
                    class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              <svg width="3" height="15" viewBox="0 0 3 15" fill="currentColor">
                <circle cx="1.5" cy="1.5" r="1.5"/>
                <circle cx="1.5" cy="7.5" r="1.5"/>
                <circle cx="1.5" cy="13.5" r="1.5"/>
              </svg>
            </button>
            @if (menuOpen()) {
              <div class="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border-[0.5px] border-gray-200 w-44 py-1"
                   style="box-shadow: 0 2px 12px rgba(0,0,0,0.08)">
                <button (click)="startEdit($event)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit plant
                </button>
                <button (click)="toggleMonitored($event)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    @if (plant()!.monitored) {
                      <path d="M10 9v6m4-6v6"/>
                    } @else {
                      <polyline points="12 6 12 12 16 14"/>
                    }
                  </svg>
                  {{ plant()!.monitored ? 'Pause monitoring' : 'Resume monitoring' }}
                </button>
              </div>
            }
          </div>
        }
      </div>

      @if (plant(); as p) {

        <!-- Plant card -->
        <div class="bg-gw-green-light rounded-2xl p-5 mb-4">
          <div class="flex items-center gap-4 mb-5">
            <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center text-3xl shrink-0">
              {{ getEmoji(p.type) }}
            </div>
            <div>
              <h1 class="text-[20px] font-semibold text-gw-green-dark leading-tight">{{ p.name }}</h1>
              <p class="text-[13px] text-gw-green-dark/70 mt-0.5">
                {{ getTypeLabel(p.type) }} · {{ p.count }} plant{{ p.count !== 1 ? 's' : '' }}
              </p>
            </div>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-white rounded-xl p-3 text-center">
              <div class="text-[16px] font-semibold text-gw-green-dark">{{ plantService.getAgeShort(p) }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">age</div>
            </div>
            <div class="bg-white rounded-xl p-3 text-center">
              <div class="text-[15px] font-semibold text-gw-green-dark">{{ getPlantedLabel(p) }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">planted</div>
            </div>
            <div class="bg-white rounded-xl p-3 text-center">
              <div class="text-[16px] font-semibold text-gw-green-dark">{{ p.count }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">plants</div>
            </div>
          </div>
        </div>

      } @else {
        <p class="text-[13px] text-gray-400">Plant not found.</p>
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
