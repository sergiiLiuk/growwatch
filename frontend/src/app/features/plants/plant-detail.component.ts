import { Component, inject, computed, signal, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlantService, Plant, PlantType } from '../../core/services/plant.service';
import { PlantActionService, PlantAction, PlantActionType, SmartTip } from '../../core/services/plant-action.service';
import { ReminderService, PlantReminder, ReminderActionType } from '../../core/services/reminder.service';
import { TierService } from '../../core/services/tier.service';
import { FormsModule } from '@angular/forms';
import { PlantEditModalComponent } from './plant-edit-modal.component';
import { PlantNoteModalComponent } from './plant-note-modal.component';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { StatusBadgeComponent } from '../../shared/components/atoms/status-badge.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import dayjs from 'dayjs';
import { daysAgo } from '../../core/utils/time';

/** Round to 6 decimal places so float-comparisons in `[ngValue]` are stable. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

@Component({
  selector: 'app-plant-detail',
  imports: [FormsModule, RouterLink, PlantEditModalComponent, PlantNoteModalComponent, IconComponent, StatusBadgeComponent, TranslocoDirective],
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
                @if (p.code) {
                  <button (click)="copyCode(p.code)"
                          [title]="t('plants.copyCode')"
                          class="text-[11px] font-mono font-medium tracking-wider bg-white border-[0.5px] border-gw-green-light text-gw-green-dark px-2 py-0.5 rounded-md hover:bg-gw-green-light/40 transition-colors cursor-pointer">
                    {{ p.code }}
                  </button>
                }
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

        <!-- Active sections are hidden for archived plants -->
        @if (!p.archived) {

          <!-- Locked smart-tip teaser: shown to free users (real subscribers only,
               i.e. not demo) so they see where Plus value would appear. -->
          @if (!tier.canSeeAi() && tier.canSeeSubscription()) {
            <div class="mb-4">
              <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('plantDetail.recommendations') }}</div>
              <a routerLink="/upgrade"
                 class="block bg-white border-[0.5px] border-dashed border-gray-300 rounded-xl p-3 hover:border-gw-green/60 hover:bg-gw-green-light/10 transition-colors">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-gray-500">
                    <span class="opacity-50">✨</span>
                    <span class="text-[12px] leading-relaxed">{{ t('home.smartTipLocked') }}</span>
                  </div>
                  <span class="text-[11px] font-medium text-gw-green-dark shrink-0">{{ t('home.smartTipLockedCta') }}</span>
                </div>
              </a>
            </div>
          }

          <!-- Smart tip -->
          @if (tier.canSeeAi() && (smartTip() || smartTipLoading())) {
            <div class="mb-4">
              <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('plantDetail.recommendations') }}</div>

              <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-3 flex flex-col gap-3">
                <div class="border-l-2 border-gw-green pl-3 py-1 bg-gw-green-light/40 rounded-r-md">
                  <div class="flex items-center justify-between">
                    <div class="text-[13px] font-medium text-gw-green-dark flex items-center gap-1.5">
                      <span>✨</span>
                      <span>{{ t('plantDetail.smartTip.title', { name: p.name }) }}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span class="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded-md bg-gw-green text-white">{{ t('plantDetail.smartTip.beta') }}</span>
                      <button (click)="refreshSmartTip()" [disabled]="smartTipLoading()"
                              class="w-6 h-6 flex items-center justify-center text-gw-green-dark/60 hover:text-gw-green-dark rounded hover:bg-white/60 transition-colors disabled:opacity-40"
                              [title]="t('plantDetail.smartTip.refresh')">
                        <app-icon name="refresh" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  @if (smartTip(); as tip) {
                    @if (tip.cycle) {
                      <div class="text-[10px] text-gw-green-dark/50 mt-0.5">
                        {{ tip.cycle === 'morning' ? t('home.morningBrief') : t('home.eveningBrief') }}
                      </div>
                    }
                  }
                  <div class="text-[12px] text-gw-green-dark/80 mt-1 leading-relaxed italic">
                    @if (smartTipLoading()) {
                      {{ t('plantDetail.smartTip.loading') }}
                    } @else if (smartTip(); as tip) {
                      {{ tip.text }}
                    } @else {
                      {{ t('plantDetail.smartTip.error') }}
                    }
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- Reminders -->
          <div class="mb-4">
            <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('reminders.title') }}</div>
            <div class="bg-white border-[0.5px] border-gray-200 rounded-xl divide-y divide-gray-100">

              @for (row of reminderRows(); track row.type) {
                <div class="p-3 flex flex-col gap-2"
                     [class.bg-gw-amber-light]="isReminderDue(row.reminder)">
                  <div class="flex items-center gap-3">
                    <span class="text-lg leading-none">{{ row.emoji }}</span>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-medium text-gray-800">{{ t(row.labelKey) }}</div>
                      <div class="text-[11px]"
                           [class.text-gw-red]="isReminderDue(row.reminder)"
                           [class.text-gray-400]="!isReminderDue(row.reminder)">
                        {{ reminderDueLabel(row.reminder) }}
                      </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" class="sr-only peer"
                             [checked]="row.reminder?.enabled ?? false"
                             (change)="toggleReminder(row.type)" />
                      <div class="w-9 h-5 bg-gray-200 peer-checked:bg-gw-green rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
                    </label>
                  </div>
                  @if (row.reminder?.enabled) {
                    <div class="flex items-center flex-wrap gap-2 pl-8">
                      <span class="text-[11px] text-gray-400">{{ t('reminders.every') }}</span>
                      <select [ngModel]="row.reminder!.intervalDays"
                              (ngModelChange)="changeReminderInterval(row.type, $event)"
                              class="text-[12px] border-[0.5px] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gw-green transition-colors">
                        @for (opt of intervalOptions; track opt.days) {
                          <option [ngValue]="opt.days">{{ t(opt.labelKey, { n: opt.n }) }}</option>
                        }
                      </select>
                      @if (row.reminder!.intervalDays >= 1) {
                        <span class="text-[11px] text-gray-400">{{ t('reminders.atTime') }}</span>
                        <input type="time"
                               [ngModel]="row.reminder!.notifyTime ?? ''"
                               (ngModelChange)="changeReminderTime(row.type, $event)"
                               class="text-[12px] border-[0.5px] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gw-green transition-colors" />
                      }
                      @if (isReminderDue(row.reminder)) {
                        <button (click)="onActionClick(row.type)"
                                class="ml-auto text-[11px] font-medium bg-gw-green text-white px-3 py-1 rounded-md hover:bg-gw-green-dark transition-colors">
                          {{ t('reminders.markDone') }}
                        </button>
                        <button (click)="snoozeReminder(row.reminder!.id)"
                                class="text-[11px] font-medium text-gray-600 border-[0.5px] border-gray-200 px-3 py-1 rounded-md hover:bg-gray-50 transition-colors">
                          {{ t('reminders.snooze') }}
                        </button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Log action -->
          <div class="mb-4">
            <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('plantDetail.logAction') }}</div>
            <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-3">
              <div class="grid grid-cols-3 gap-2">
                @for (a of actionButtons(); track a.type) {
                  <button (click)="onActionClick(a.type)"
                          class="rounded-lg border-[0.5px] py-3 flex flex-col items-center gap-1 transition-colors"
                          [class]="a.highlighted ? a.activeClass : 'border-gray-200 hover:border-gray-300 bg-white'">
                    <span class="text-xl leading-none">{{ a.emoji }}</span>
                    <span class="text-[11px] font-medium text-gray-700">{{ t(a.labelKey) }}</span>
                    <span class="text-[10px] text-gray-400">{{ a.subtitle }}</span>
                  </button>
                }
              </div>
            </div>
          </div>

          <!-- History -->
          <div class="mb-4">
            <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('plantDetail.historyTitle') }}</div>
            <div class="bg-white border-[0.5px] border-gray-200 rounded-xl divide-y divide-gray-100">
              @if (recentActions().length === 0) {
                <p class="text-[12px] text-gray-400 p-4 text-center">{{ t('plantDetail.never') }}</p>
              }
              @for (a of recentActions(); track a.id) {
                <div class="flex items-center gap-3 p-3">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
                       [class]="historyIconBg(a.type)">{{ historyIconEmoji(a.type) }}</div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium text-gray-800 truncate">{{ historyLabel(a) }}</div>
                    <div class="text-[11px] text-gray-400">{{ historyDateLabel(a.createdAt) }}</div>
                  </div>
                  <button (click)="removeAction(a.id)"
                          class="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gw-red rounded transition-colors"
                          [title]="t('plantDetail.deleteAction')">
                    <app-icon name="trash" class="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            </div>
          </div>

          <!-- Archive footer -->
          <div class="mt-5 border-[0.5px] border-dashed border-gray-300 rounded-xl p-4 flex items-center gap-3">
            <p class="text-[12px] text-gray-500 flex-1 leading-relaxed">{{ t('plantDetail.archive.prompt') }}</p>
            <button (click)="archive()"
                    class="text-[13px] font-medium text-gray-700 border-[0.5px] border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shrink-0">
              {{ t('plantDetail.archive.button') }}
            </button>
          </div>

        } @else {
          <!-- Archived plant: unarchive only -->
          <div class="mt-5 border-[0.5px] border-dashed border-gray-300 rounded-xl p-4 flex items-center gap-3">
            <p class="text-[12px] text-gray-500 flex-1 leading-relaxed">{{ t('common.archived') }}</p>
            <button (click)="unarchive()"
                    class="text-[13px] font-medium text-gw-green-dark border-[0.5px] border-gw-green-light px-4 py-2 rounded-lg hover:bg-gw-green-light/40 transition-colors shrink-0">
              {{ t('plantDetail.archive.unarchive') }}
            </button>
          </div>

          <!-- Archived history is still visible (read-only) -->
          @if (recentActions().length > 0) {
            <div class="mt-4">
              <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('plantDetail.historyTitle') }}</div>
              <div class="bg-white border-[0.5px] border-gray-200 rounded-xl divide-y divide-gray-100">
                @for (a of recentActions(); track a.id) {
                  <div class="flex items-center gap-3 p-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
                         [class]="historyIconBg(a.type)">{{ historyIconEmoji(a.type) }}</div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-medium text-gray-800 truncate">{{ historyLabel(a) }}</div>
                      <div class="text-[11px] text-gray-400">{{ historyDateLabel(a.createdAt) }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        }

      } @else {
        <p class="text-[13px] text-gray-400">{{ t('plants.plantNotFound') }}</p>
      }

    </div>

    <!-- Edit modal -->
    <app-plant-edit-modal [plant]="editingPlant()" (saved)="cancelEdit()" (cancelled)="cancelEdit()" />

    <!-- Note modal -->
    <app-plant-note-modal [open]="noteModalOpen()"
                          (saved)="onNoteSaved($event)"
                          (cancelled)="noteModalOpen.set(false)" />
  `,
})
export class PlantDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private actions = inject(PlantActionService);
  private reminderService = inject(ReminderService);
  private transloco = inject(TranslocoService);
  plantService = inject(PlantService);
  tier = inject(TierService);

  reminders = signal<PlantReminder[]>([]);
  // Each option is stored as a fractional number of days so the backend math
  // (intervalDays * 24h) works uniformly. Sub-day options are mostly for
  // testing push notifications; day-scale options are the real product.
  readonly intervalOptions: ReadonlyArray<{ days: number; labelKey: string; n: number }> = [
    { days: round6(10 / 1440), labelKey: 'reminders.minuteCount', n: 10 },
    { days: round6(30 / 1440), labelKey: 'reminders.minuteCount', n: 30 },
    { days: round6(1 / 24),    labelKey: 'reminders.hourCount',   n: 1 },
    { days: 1,                 labelKey: 'reminders.dayCount',    n: 1 },
    { days: 2,                 labelKey: 'reminders.dayCount',    n: 2 },
    { days: 3,                 labelKey: 'reminders.dayCount',    n: 3 },
    { days: 5,                 labelKey: 'reminders.dayCount',    n: 5 },
    { days: 7,                 labelKey: 'reminders.dayCount',    n: 7 },
    { days: 14,                labelKey: 'reminders.dayCount',    n: 14 },
    { days: 30,                labelKey: 'reminders.dayCount',    n: 30 },
  ];

  waterReminder = computed(() => this.reminders().find(r => r.actionType === 'water') ?? null);
  fertilizeReminder = computed(() => this.reminders().find(r => r.actionType === 'fertilize') ?? null);

  reminderRows = computed(() => [
    { type: 'water'     as ReminderActionType, emoji: '💧', labelKey: 'plantDetail.action.water',     reminder: this.waterReminder() },
    { type: 'fertilize' as ReminderActionType, emoji: '🌱', labelKey: 'plantDetail.action.fertilize', reminder: this.fertilizeReminder() },
  ]);

  plant = computed(() => {
    const id = this.route.snapshot.paramMap.get('id');
    return this.plantService.plants().find(p => p.id === id)
        ?? this.plantService.archivedPlants().find(p => p.id === id)
        ?? null;
  });

  menuOpen = signal(false);
  editingPlant = signal<Plant | null>(null);
  noteModalOpen = signal(false);

  plantActions = signal<PlantAction[]>([]);
  smartTip = signal<SmartTip | null>(null);
  smartTipLoading = signal(false);
  private localeKey = signal(this.transloco.getActiveLang());

  recentActions = computed(() => this.plantActions().slice(0, 5));

  actionButtons = computed(() => {
    this.localeKey();
    const acts = this.plantActions();
    const lastByType = (type: PlantActionType) => acts.find(a => a.type === type);
    const subtitle = (type: PlantActionType): string => {
      const last = lastByType(type);
      if (!last) return this.transloco.translate('plantDetail.never');
      const days = Math.floor((Date.now() - last.createdAt.getTime()) / (24 * 60 * 60 * 1000));
      if (days === 0) return this.transloco.translate('plantDetail.today');
      return this.transloco.translate('plantDetail.daysAgoShort', { n: days });
    };
    const mostRecent = acts[0]?.type;
    return ([
      { type: 'water'     as PlantActionType, emoji: '💧', labelKey: 'plantDetail.action.water',     activeClass: 'border-red-200 bg-red-50/60' },
      { type: 'fertilize' as PlantActionType, emoji: '🌱', labelKey: 'plantDetail.action.fertilize', activeClass: 'border-gw-green-light bg-gw-green-light/30' },
      { type: 'prune'     as PlantActionType, emoji: '✂️', labelKey: 'plantDetail.action.prune',     activeClass: 'border-pink-200 bg-pink-50/60' },
      { type: 'harvest'   as PlantActionType, emoji: '🍅', labelKey: 'plantDetail.action.harvest',   activeClass: 'border-orange-200 bg-orange-50/60' },
      { type: 'bloom'     as PlantActionType, emoji: '🌸', labelKey: 'plantDetail.action.bloom',     activeClass: 'border-rose-200 bg-rose-50/60' },
      { type: 'note'      as PlantActionType, emoji: '📝', labelKey: 'plantDetail.action.note',      activeClass: 'border-amber-200 bg-amber-50/60' },
    ]).map(b => ({
      ...b,
      subtitle: b.type === 'note' ? this.transloco.translate('plantDetail.action.add') : subtitle(b.type),
      highlighted: b.type === mostRecent,
    }));
  });

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
    return this.plantService.getTypeLabel(type);
  }

  getPlantedLabel(plant: Plant): string {
    return dayjs(plant.plantedDate).format('D MMM');
  }

  copyCode(code: string) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(code).catch(() => {/* non-fatal */});
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

  // ── Actions ────────────────────────────────────────────────────────────────

  onActionClick(type: PlantActionType) {
    if (type === 'note') {
      this.noteModalOpen.set(true);
      return;
    }
    this.logAction(type);
  }

  onNoteSaved(text: string) {
    this.noteModalOpen.set(false);
    this.logAction('note', text);
  }

  private logAction(type: PlantActionType, note?: string) {
    const p = this.plant();
    if (!p) return;
    this.actions.log(p.id, type, note).subscribe(a => {
      this.plantActions.update(list => [a, ...list]);
      // The backend resets matching reminders on log; pull the fresh copy.
      if (type === 'water' || type === 'fertilize') {
        this.reminderService.list(p.id).subscribe(list => this.reminders.set(list));
      }
    });
  }

  removeAction(id: string) {
    this.actions.remove(id).subscribe(() => {
      this.plantActions.update(list => list.filter(a => a.id !== id));
    });
  }

  // ── Smart tip ──────────────────────────────────────────────────────────────

  // ── Reminders ──────────────────────────────────────────────────────────────

  isReminderDue(r: PlantReminder | null): boolean {
    return r ? ReminderService.isDue(r) : false;
  }

  reminderDueLabel(r: PlantReminder | null): string {
    if (!r || !r.enabled) return this.transloco.translate('reminders.off');
    const now = Date.now();
    if (r.snoozedUntil && r.snoozedUntil.getTime() > now) {
      const hrs = Math.max(1, Math.ceil((r.snoozedUntil.getTime() - now) / (60 * 60 * 1000)));
      return this.transloco.translate('reminders.snoozedFor', { hours: hrs });
    }
    const diffMs = r.nextDueAt.getTime() - now;
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
    if (diffMs <= 0) return this.transloco.translate('reminders.dueNow');
    if (days === 0) return this.transloco.translate('reminders.dueToday');
    if (days === 1) return this.transloco.translate('reminders.dueTomorrow');
    return this.transloco.translate('reminders.dueInDays', { n: days });
  }

  toggleReminder(type: ReminderActionType) {
    const p = this.plant();
    if (!p) return;
    const existing = this.reminders().find(r => r.actionType === type);
    const interval = existing?.intervalDays ?? (type === 'water' ? 3 : 14);
    const enabled = !(existing?.enabled ?? false);
    this.reminderService.set(p.id, type, interval, enabled, existing?.notifyTime ?? null).subscribe(updated => {
      this.reminders.update(list => {
        const without = list.filter(r => r.actionType !== type);
        return [...without, updated];
      });
    });
  }

  changeReminderInterval(type: ReminderActionType, days: number) {
    const p = this.plant();
    if (!p) return;
    const existing = this.reminders().find(r => r.actionType === type);
    this.reminderService.set(p.id, type, days, true, existing?.notifyTime ?? null).subscribe(updated => {
      this.reminders.update(list => {
        const without = list.filter(r => r.actionType !== type);
        return [...without, updated];
      });
    });
  }

  changeReminderTime(type: ReminderActionType, time: string) {
    const p = this.plant();
    if (!p) return;
    const existing = this.reminders().find(r => r.actionType === type);
    if (!existing) return;
    const notifyTime = time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
    this.reminderService.set(p.id, type, existing.intervalDays, true, notifyTime).subscribe(updated => {
      this.reminders.update(list => {
        const without = list.filter(r => r.actionType !== type);
        return [...without, updated];
      });
    });
  }

  snoozeReminder(id: string) {
    this.reminderService.snooze(id, 24).subscribe(updated => {
      this.reminders.update(list => list.map(r => r.id === id ? updated : r));
    });
  }

  // ── Smart tip ──────────────────────────────────────────────────────────────

  refreshSmartTip() {
    const p = this.plant();
    if (!p) return;
    this.smartTipLoading.set(true);
    this.actions.regenerateBriefing().subscribe({
      next: () => {
        // Fetch the refreshed per-plant tip
        this.actions.getSmartTip(p.id).subscribe({
          next: tip => { this.smartTip.set(tip); this.smartTipLoading.set(false); },
          error: () => this.smartTipLoading.set(false),
        });
      },
      error: () => this.smartTipLoading.set(false),
    });
  }

  // ── Archive ────────────────────────────────────────────────────────────────

  archive() {
    const p = this.plant();
    if (!p) return;
    this.plantService.setArchived(p.id, true).subscribe();
  }

  unarchive() {
    const p = this.plant();
    if (!p) return;
    this.plantService.setArchived(p.id, false).subscribe();
  }

  // ── History rendering helpers ─────────────────────────────────────────────

  historyIconEmoji(type: PlantActionType): string {
    return ({ water: '💧', fertilize: '🌱', prune: '✂️', harvest: '🍅', bloom: '🌸', note: '📝' } as const)[type];
  }

  historyIconBg(type: PlantActionType): string {
    return ({
      water: 'bg-red-50',
      fertilize: 'bg-gw-green-light',
      prune: 'bg-pink-50',
      harvest: 'bg-orange-50',
      bloom: 'bg-rose-50',
      note: 'bg-amber-50',
    } as const)[type];
  }

  historyLabel(a: PlantAction): string {
    if (a.type === 'note') return a.note?.split('\n')[0] ?? this.transloco.translate('plantDetail.history.note');
    const labelKey = ({
      water: 'watered',
      fertilize: 'fertilized',
      prune: 'pruned',
      harvest: 'harvested',
      bloom: 'bloomed',
    } as const)[a.type];
    const base = this.transloco.translate(`plantDetail.history.${labelKey}`);
    return a.note ? `${base} — ${a.note.split('\n')[0]}` : base;
  }

  historyDateLabel(d: Date): string {
    const day = dayjs(d);
    const days = daysAgo(d);
    const dateStr = day.format('D MMM');
    if (days === 0) return this.transloco.translate('plantDetail.today') + ' · ' + dateStr;
    return dateStr + ' · ' + this.transloco.translate('home.daysAgo', { n: days });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.actions.list(id).subscribe(list => this.plantActions.set(list));
    if (this.tier.canSeeAi()) this.actions.getSmartTip(id).subscribe(tip => this.smartTip.set(tip));
    this.reminderService.list(id).subscribe(list => this.reminders.set(list));
  }
}
