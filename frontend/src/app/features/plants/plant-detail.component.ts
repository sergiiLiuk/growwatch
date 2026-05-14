import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PlantService } from '../../core/services/plant.service';

@Component({
  selector: 'app-plant-detail',
  imports: [],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <!-- Back button -->
      <button (click)="back()" class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ My plants
      </button>

      @if (plant()) {
        <h1 class="text-2xl font-semibold text-gray-900">{{ plant()!.name }}</h1>
      } @else {
        <p class="text-sm text-gray-400">Plant not found.</p>
      }

    </div>
  `,
})
export class PlantDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private plantService = inject(PlantService);

  plant = computed(() => {
    const id = this.route.snapshot.paramMap.get('id');
    return this.plantService.plants().find(p => p.id === id) ?? null;
  });

  back() {
    this.router.navigate(['/plants']);
  }
}
