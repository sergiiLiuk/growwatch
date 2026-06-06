import { Component, inject, computed, signal, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlantService, Plant, PlantType } from '../../core/services/plant.service';
import { PlantActionService, PlantAction, PlantActionType, SmartTip } from '../../core/services/plant-action.service';
import { ReminderService, PlantReminder, ReminderActionType } from '../../core/services/reminder.service';
import { PushService } from '../../core/services/push.service';
import { TierService } from '../../core/services/tier.service';
import { FormsModule } from '@angular/forms';
import { PlantEditModalComponent } from './plant-edit-modal.component';
import { PlantNoteModalComponent } from './plant-note-modal.component';
import { HarvestSummaryModalComponent } from './harvest-summary-modal.component';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import { PLANT_ACTION_META, PLANT_ACTIONS } from '../../core/constants/plant-actions';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { StatusBadgeComponent } from '../../shared/components/atoms/status-badge.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import dayjs from 'dayjs';

@Component({
  selector: 'app-plant-detail',
  imports: [FormsModule, RouterLink, PlantEditModalComponent, PlantNoteModalComponent, HarvestSummaryModalComponent, IconComponent, StatusBadgeComponent, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 pt-5 pb-6" *transloco="let t">

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
                <button (click)="startDelete($event)"
                        class="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gw-red hover:bg-gw-red-light transition-colors">
                  <app-icon name="trash-simple" class="w-[14px] h-[14px]" />
                  {{ t('plants.removePlant') }}
                </button>
              </div>
            }
          </div>
        }
      </div>

      @if (plant(); as p) {

        <!-- Plant card — sticky at top while detail content scrolls under it -->
        <div class="sticky top-0 z-30 rounded-2xl p-5 mb-4 shadow-sm transition-colors"
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

          <!-- Care plan — reference chips for water + fertilizer. Hidden if
               nothing's set; shows a subtle "+ Add care plan" link instead. -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <div class="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{{ t('plantCare.sectionTitle') }}</div>
              @if (hasCarePlan()) {
                <button (click)="startEdit($event)"
                        class="text-[11px] text-gray-400 hover:text-gw-green-dark transition-colors">
                  {{ t('common.edit') }}
                </button>
              }
            </div>
            @if (hasCarePlan()) {
              <div class="bg-white border-[0.5px] border-gray-200 rounded-xl divide-y divide-gray-100">
                @if (waterChips().length) {
                  <div class="flex items-center gap-3 p-3">
                    <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-base shrink-0">💧</div>
                    <div class="flex-1 min-w-0 flex flex-wrap gap-1.5">
                      @for (chip of waterChips(); track chip) {
                        <span class="text-[11px] text-gray-600 bg-gray-50 border-[0.5px] border-gray-200 rounded-md px-2 py-0.5">{{ chip }}</span>
                      }
                    </div>
                  </div>
                }
                @if (fertilizerChips().length) {
                  <div class="flex items-center gap-3 p-3">
                    <div class="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-base shrink-0">🌿</div>
                    <div class="flex-1 min-w-0 flex flex-wrap gap-1.5">
                      @for (chip of fertilizerChips(); track chip) {
                        <span class="text-[11px] text-gray-600 bg-gray-50 border-[0.5px] border-gray-200 rounded-md px-2 py-0.5">{{ chip }}</span>
                      }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <button (click)="startEdit($event)"
                      class="w-full bg-white border-[0.5px] border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-[12px] text-gray-400 hover:border-gw-green/60 hover:text-gw-green-dark transition-colors text-left">
                {{ t('plantCare.addLink') }}
              </button>
            }
          </div>

          <!-- Reminders — hidden when push is off, since reminders without
               notifications are useless. Show a CTA pointing to Settings instead. -->
          @if (push.enabled()) {
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
                      <span class="text-[11px] text-gray-400">{{ t('reminders.atTime') }}</span>
                      <input type="time"
                             [ngModel]="row.reminder!.notifyTime ?? ''"
                             (ngModelChange)="changeReminderTime(row.type, $event)"
                             class="text-[12px] border-[0.5px] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gw-green transition-colors" />
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
          } @else {
            <a routerLink="/settings"
               class="flex items-center gap-2 mb-4 rounded-xl bg-gw-green-light/30 px-3 py-2 hover:bg-gw-green-light/50 transition-colors">
              <span class="text-[12px] text-gw-green-dark/80 flex-1">{{ t('reminders.enablePushHint') }}</span>
              <span class="text-[11px] font-medium text-gw-green-dark">{{ t('reminders.openSettings') }}</span>
            </a>
          }

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
          <!-- Archived plant: harvest summary + unarchive -->
          @if (p.harvestSummary; as h) {
            <div class="mt-4 bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
              <div class="text-[11px] text-gray-400 mb-3 font-medium uppercase tracking-wide">{{ t('harvest.summaryTitle') }}</div>
              <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div class="text-[11px] text-gray-400">{{ t('harvest.taste') }}</div>
                  <div class="text-[14px] text-gw-green-dark font-medium mt-0.5">{{ stars(h.taste) }}</div>
                </div>
                <div>
                  <div class="text-[11px] text-gray-400">{{ t('harvest.fertility') }}</div>
                  <div class="text-[14px] text-gw-green-dark font-medium mt-0.5">{{ stars(h.fertility) }}</div>
                </div>
              </div>
              <div class="text-[12px] text-gray-600">
                <span class="text-gray-400">{{ t('harvest.recommendation') }}:</span>
                <span class="ml-1 font-medium">{{ t('harvest.rec.' + h.recommendation) }}</span>
              </div>
              @if (h.notes) {
                <p class="mt-2 text-[12px] text-gray-600 whitespace-pre-line leading-relaxed">{{ h.notes }}</p>
              }
            </div>
          }
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

    <!-- Harvest summary on archive -->
    <app-harvest-summary-modal [plant]="archivingPlant()" [saving]="archiving()"
                               (confirmed)="confirmArchive($event)"
                               (cancelled)="archivingPlant.set(null)" />

    <!-- Delete confirmation -->
    @if (deleteOpen() && plant(); as p) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4"
           (click)="cancelDelete()" *transloco="let t">
        <div class="w-full max-w-sm bg-white rounded-xl border-[0.5px] border-gray-200 p-6 text-center"
             (click)="$event.stopPropagation()">
          <div class="w-14 h-14 bg-gw-red-light rounded-full flex items-center justify-center mx-auto mb-4">
            <app-icon name="trash-simple" class="w-[22px] h-[22px] text-gw-red" />
          </div>
          <h2 class="text-[16px] font-medium text-gray-900 mb-2">{{ t('plants.removeTitle', { name: p.name }) }}</h2>
          <p class="text-[13px] text-gray-500 mb-6 leading-relaxed">
            {{ t('plants.removeBody', { name: p.name }) }}
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
export class PlantDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private actions = inject(PlantActionService);
  private reminderService = inject(ReminderService);
  push = inject(PushService);
  private transloco = inject(TranslocoService);
  plantService = inject(PlantService);
  tier = inject(TierService);

  reminders = signal<PlantReminder[]>([]);
  readonly intervalOptions: ReadonlyArray<{ days: number; labelKey: string; n: number }> = [
    { days: 1,  labelKey: 'reminders.dayCount', n: 1 },
    { days: 2,  labelKey: 'reminders.dayCount', n: 2 },
    { days: 3,  labelKey: 'reminders.dayCount', n: 3 },
    { days: 5,  labelKey: 'reminders.dayCount', n: 5 },
    { days: 7,  labelKey: 'reminders.dayCount', n: 7 },
    { days: 14, labelKey: 'reminders.dayCount', n: 14 },
    { days: 30, labelKey: 'reminders.dayCount', n: 30 },
  ];

  waterReminder = computed(() => this.reminders().find(r => r.actionType === 'water') ?? null);
  fertilizeReminder = computed(() => this.reminders().find(r => r.actionType === 'fertilize') ?? null);
  noteReminder = computed(() => this.reminders().find(r => r.actionType === 'note') ?? null);

  reminderRows = computed(() => [
    { type: 'water'     as ReminderActionType, emoji: PLANT_ACTION_META.water.emoji,     labelKey: PLANT_ACTION_META.water.labelKey,     reminder: this.waterReminder() },
    { type: 'fertilize' as ReminderActionType, emoji: PLANT_ACTION_META.fertilize.emoji, labelKey: PLANT_ACTION_META.fertilize.labelKey, reminder: this.fertilizeReminder() },
    { type: 'note'      as ReminderActionType, emoji: PLANT_ACTION_META.note.emoji,      labelKey: PLANT_ACTION_META.note.labelKey,      reminder: this.noteReminder() },
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
      const days = dayjs().startOf('day').diff(dayjs(last.createdAt).startOf('day'), 'day');
      if (days <= 0) return this.transloco.translate('plantDetail.today');
      if (days === 1) return this.transloco.translate('plantDetail.yesterday');
      return this.transloco.translate('plantDetail.daysAgoShort', { n: days });
    };
    const mostRecent = acts[0]?.type;
    return PLANT_ACTIONS.map(b => ({
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

  // ── Delete plant ──────────────────────────────────────────────────────────
  deleteOpen = signal(false);
  deleting = signal(false);

  startDelete(e: Event) {
    e.stopPropagation();
    this.menuOpen.set(false);
    this.deleteOpen.set(true);
  }

  cancelDelete() {
    if (this.deleting()) return;
    this.deleteOpen.set(false);
  }

  doDelete() {
    const p = this.plant();
    if (!p) return;
    this.deleting.set(true);
    this.plantService.remove(p.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.router.navigate(['/plants']);
      },
      error: err => {
        console.error('Failed to remove plant:', err);
        this.deleting.set(false);
      },
    });
  }

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

  private mergeReminder(type: ReminderActionType, updated: PlantReminder) {
    this.reminders.update(list => {
      const without = list.filter(r => r.actionType !== type);
      return [...without, updated];
    });
  }

  private persistReminder(p: { id: string }, type: ReminderActionType, days: number, enabled: boolean, notifyTime: string | null) {
    this.reminderService.set(p.id, type, days, enabled, notifyTime).subscribe({
      next: updated => this.mergeReminder(type, updated),
      error: err => {
        console.error('reminder save failed:', err);
        // Pull fresh state so the UI doesn't keep showing an unsaved value.
        this.reminderService.list(p.id).subscribe(list => this.reminders.set(list));
      },
    });
  }

  toggleReminder(type: ReminderActionType) {
    const p = this.plant();
    if (!p) return;
    const existing = this.reminders().find(r => r.actionType === type);
    const interval = existing?.intervalDays ?? (type === 'water' ? 3 : type === 'fertilize' ? 14 : 7);
    const enabled = !(existing?.enabled ?? false);
    this.persistReminder(p, type, interval, enabled, existing?.notifyTime ?? null);
  }

  changeReminderInterval(type: ReminderActionType, days: number) {
    const p = this.plant();
    if (!p) return;
    const existing = this.reminders().find(r => r.actionType === type);
    this.persistReminder(p, type, days, true, existing?.notifyTime ?? null);
  }

  changeReminderTime(type: ReminderActionType, time: string) {
    const p = this.plant();
    if (!p) return;
    const existing = this.reminders().find(r => r.actionType === type);
    if (!existing) return;
    const notifyTime = time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
    this.persistReminder(p, type, existing.intervalDays, true, notifyTime);
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

  archivingPlant = signal<Plant | null>(null);
  archiving = signal(false);

  // ── Care plan chips ────────────────────────────────────────────────────────

  waterChips = computed<string[]>(() => {
    const c = this.plant()?.care;
    if (!c) return [];
    this.localeKey();
    const out: string[] = [];
    if (c.waterAmount) out.push(this.transloco.translate(`plantCare.amount.${c.waterAmount}`));
    if (c.waterFrequency === 'other' && c.waterFrequencyOther?.trim()) out.push(c.waterFrequencyOther.trim());
    else if (c.waterFrequency) out.push(this.transloco.translate(`plantCare.freq.${c.waterFrequency}`));
    return out;
  });

  fertilizerChips = computed<string[]>(() => {
    const c = this.plant()?.care;
    if (!c) return [];
    this.localeKey();
    const out: string[] = [];
    if (c.fertilizerAmount) out.push(this.transloco.translate(`plantCare.amount.${c.fertilizerAmount}`));
    if (c.fertilizerType?.trim()) out.push(c.fertilizerType.trim());
    if (c.fertilizerFrequency?.trim()) out.push(c.fertilizerFrequency.trim());
    return out;
  });

  hasCarePlan = computed(() => this.waterChips().length > 0 || this.fertilizerChips().length > 0);

  stars(n: number): string {
    return '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));
  }

  archive() {
    const p = this.plant();
    if (!p) return;
    this.archivingPlant.set(p);
  }

  confirmArchive(summary: { taste: number; fertility: number; recommendation: 'yes' | 'maybe' | 'no'; notes?: string }) {
    const p = this.archivingPlant();
    if (!p) return;
    this.archiving.set(true);
    this.plantService.archiveWithSummary(p.id, summary).subscribe({
      next: () => { this.archiving.set(false); this.archivingPlant.set(null); },
      error: err => { console.error('Failed to archive plant:', err); this.archiving.set(false); },
    });
  }

  unarchive() {
    const p = this.plant();
    if (!p) return;
    this.plantService.setArchived(p.id, false).subscribe();
  }

  // ── History rendering helpers ─────────────────────────────────────────────

  historyIconEmoji(type: PlantActionType): string {
    return PLANT_ACTION_META[type].emoji;
  }

  historyIconBg(type: PlantActionType): string {
    return PLANT_ACTION_META[type].iconBg;
  }

  historyLabel(a: PlantAction): string {
    if (a.type === 'note') return a.note?.split('\n')[0] ?? this.transloco.translate('plantDetail.history.note');
    const base = this.transloco.translate(PLANT_ACTION_META[a.type].pastTenseKey!);
    return a.note ? `${base} — ${a.note.split('\n')[0]}` : base;
  }

  historyDateLabel(d: Date): string {
    const day = dayjs(d);
    const now = dayjs();
    // Calendar-day diff: "yesterday at 23:00" should read as 1 day, not 0.
    const days = now.startOf('day').diff(day.startOf('day'), 'day');
    const dateStr = day.format('D MMM HH:mm');
    if (days <= 0) return this.transloco.translate('plantDetail.today') + ' · ' + dateStr;
    if (days === 1) return this.transloco.translate('plantDetail.yesterday') + ' · ' + dateStr;
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
