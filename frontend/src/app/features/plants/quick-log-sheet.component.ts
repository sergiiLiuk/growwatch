import { Component, signal, computed, inject, input, output, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { Plant } from '../../core/services/plant.service';
import { PlantActionService, PlantActionType, PlantAction } from '../../core/services/plant-action.service';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import { PLANT_ACTIONS, PLANT_ACTION_META } from '../../core/constants/plant-actions';

@Component({
  selector: 'app-quick-log-sheet',
  imports: [FormsModule, TranslocoDirective],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30"
           (click)="close()" *transloco="let t">
        <div class="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 pb-24 sm:pb-5 max-h-[85vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <h2 class="text-[15px] font-medium text-gray-800 mb-1">{{ t('quickLog.title') }}</h2>

          @if (lastLogged(); as last) {
            <div class="mb-3 flex items-center gap-3 bg-gw-green-light/40 border border-gw-green-light text-gw-green-dark rounded-xl px-3 py-2 text-[12px]">
              <span class="flex-1">✓ {{ t('quickLog.toast', { verb: t(actionMetaFor(last.type).labelKey), n: last.actionIds.length }) }}</span>
              <button (click)="undoLast()"
                      class="text-[11px] font-medium hover:underline">{{ t('quickLog.undo') }}</button>
            </div>
          }

          @if (!selectedAction()) {
            <!-- Step 1: pick action -->
            <p class="text-[12px] text-gray-500 mb-4">{{ t('quickLog.pickAction') }}</p>
            <div class="grid grid-cols-3 gap-2">
              @for (a of actions; track a.type) {
                <button (click)="pickAction(a.type)"
                        class="rounded-lg shadow-gw-sm hover:border-gw-green py-3 flex flex-col items-center gap-1 transition-colors">
                  <span class="text-xl leading-none">{{ a.emoji }}</span>
                  <span class="text-[11px] font-medium text-gray-700">{{ t(a.labelKey) }}</span>
                </button>
              }
            </div>
          } @else {
            <!-- Step 2: select plants -->
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2 text-[13px] text-gray-700">
                <span class="text-lg">{{ selectedActionMeta().emoji }}</span>
                <span class="font-medium">{{ t(selectedActionMeta().labelKey) }}</span>
              </div>
              <button (click)="resetAction()"
                      class="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                {{ t('common.cancel') }}
              </button>
            </div>

            <p class="text-[11px] text-gray-400 mb-2">{{ t('quickLog.allSelectedHint') }}</p>

            <div class="flex gap-2 mb-3 text-[11px]">
              <button (click)="selectAll()"
                      class="text-gw-green-dark font-medium hover:underline">{{ t('quickLog.selectAll') }}</button>
              <span class="text-gray-300">·</span>
              <button (click)="clearAll()"
                      class="text-gray-500 hover:underline">{{ t('quickLog.clear') }}</button>
            </div>

            <div class="shadow-gw-sm rounded-xl divide-y divide-gray-100 max-h-[260px] overflow-y-auto">
              @for (p of availablePlants(); track p.id) {
                <label class="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox"
                         [checked]="isSelected(p.id)"
                         (change)="toggle(p.id)"
                         class="w-4 h-4 accent-gw-green" />
                  <span class="text-base">{{ getEmoji(p.type) }}</span>
                  <span class="flex-1 text-[13px] text-gray-800 truncate">{{ p.name }}</span>
                  @if (p.code) {
                    <span class="text-[10px] text-gray-400 font-mono shrink-0">{{ p.code }}</span>
                  }
                </label>
              }
            </div>

            @if (selectedAction() === 'note') {
              <textarea [(ngModel)]="noteText"
                        [placeholder]="t('quickLog.notePlaceholder')"
                        rows="3"
                        class="w-full mt-3 shadow-gw-sm rounded-xl px-3 py-2 text-[13px] outline-none focus:border-gw-green transition-colors resize-none"></textarea>
              <p class="text-[10px] text-gray-400 mt-1">{{ t('quickLog.noteHint') }}</p>
            }

            <button (click)="confirm()"
                    [disabled]="selectedCount() === 0 || saving()"
                    class="w-full mt-4 py-3 rounded-xl bg-gw-green text-white font-medium text-[13px] hover:bg-gw-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {{ saving()
                  ? t('quickLog.logging')
                  : (selectedCount() === 1
                      ? t('quickLog.logForOne', { action: t(selectedActionMeta().labelKey) })
                      : t('quickLog.logForN', { action: t(selectedActionMeta().labelKey), n: selectedCount() })) }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class QuickLogSheetComponent {
  private actionService = inject(PlantActionService);

  open = input.required<boolean>();
  plants = input.required<Plant[]>();
  closed = output<void>();
  logged = output<{ verb: string; actionIds: string[]; type: PlantActionType }>();

  readonly actions = PLANT_ACTIONS;

  selectedAction = signal<PlantActionType | null>(null);
  selectedIds = signal<Set<string>>(new Set());
  noteText = '';
  saving = signal(false);

  /** Most recent batch — drives the inline success banner with Undo. */
  lastLogged = signal<{ type: PlantActionType; actionIds: string[] } | null>(null);
  private lastLoggedTimer?: ReturnType<typeof setTimeout>;

  actionMetaFor(type: PlantActionType) {
    return PLANT_ACTION_META[type];
  }

  undoLast() {
    const last = this.lastLogged();
    if (!last) return;
    last.actionIds.forEach(id => this.actionService.remove(id).subscribe());
    this.clearLastLogged();
  }

  private clearLastLogged() {
    clearTimeout(this.lastLoggedTimer);
    this.lastLogged.set(null);
  }

  /** Only monitored, non-archived plants are batch-targetable. */
  availablePlants = computed(() =>
    this.plants().filter(p => !p.archived && p.monitored)
  );

  selectedActionMeta = computed(() => {
    const t = this.selectedAction();
    return t ? PLANT_ACTION_META[t] : PLANT_ACTIONS[0];
  });

  selectedCount = computed(() => this.selectedIds().size);

  constructor() {
    // Reset state when the sheet opens; pre-select all available plants.
    effect(() => {
      if (this.open()) {
        this.selectedAction.set(null);
        this.selectedIds.set(new Set(this.availablePlants().map(p => p.id)));
        this.noteText = '';
        this.saving.set(false);
        this.clearLastLogged();
      }
    });
  }

  getEmoji(type: string): string {
    return (PLANT_TYPE_STYLE as Record<string, { emoji: string }>)[type]?.emoji ?? '🌿';
  }

  pickAction(type: PlantActionType) {
    this.selectedAction.set(type);
    // Re-seed selection to all in case user opened/closed step earlier.
    this.selectedIds.set(new Set(this.availablePlants().map(p => p.id)));
  }

  resetAction() {
    this.selectedAction.set(null);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggle(id: string) {
    this.selectedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  selectAll() {
    this.selectedIds.set(new Set(this.availablePlants().map(p => p.id)));
  }

  clearAll() {
    this.selectedIds.set(new Set());
  }

  close() {
    this.closed.emit();
  }

  confirm() {
    const type = this.selectedAction();
    if (!type) return;
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    const note = type === 'note' ? this.noteText.trim() || undefined : undefined;
    this.saving.set(true);
    forkJoin(ids.map(id => this.actionService.log(id, type, note))).subscribe({
      next: (results: PlantAction[]) => {
        this.saving.set(false);
        const actionIds = results.map(r => r.id);
        this.logged.emit({ verb: type, actionIds, type });
        // Keep the sheet open. Jump back to the action picker but preserve the
        // plant selection so the user can do another batch (e.g. water → fertilize
        // for the same set). Inline banner with Undo auto-dismisses in 5s.
        this.lastLogged.set({ type, actionIds });
        this.selectedAction.set(null);
        this.noteText = '';
        clearTimeout(this.lastLoggedTimer);
        this.lastLoggedTimer = setTimeout(() => this.lastLogged.set(null), 5000);
      },
      error: err => {
        console.error('Quick-log failed:', err);
        this.saving.set(false);
      },
    });
  }
}
