import { Component, computed, inject, signal, input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import dayjs from 'dayjs';
import { PlantService, Plant } from '../../../core/services/plant.service';
import { ReminderService, PlantReminder, ReminderActionType } from '../../../core/services/reminder.service';
import { PLANT_ACTION_META } from '../../../core/constants/plant-actions';
import { PLANT_TYPE_STYLE } from '../../../core/constants/plant-styles';
import { IconComponent, IconName } from './icon.component';

interface DueRow {
  reminder: PlantReminder;
  plant: Plant;
}

@Component({
  selector: 'app-today-card',
  imports: [RouterLink, IconComponent, TranslocoDirective],
  template: `
    <div class="bg-white border-[0.5px] border-gray-200 rounded-2xl p-4 gw-card-shadow" *transloco="let t">
      <div class="flex items-center justify-between mb-3">
        <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{{ t('home.todayTitle') }}</div>
        @if (visibleRows().length > 0) {
          <span class="text-[11px] text-gw-green-dark">{{ t('home.todayCount', { n: dueRows().length }) }}</span>
        }
      </div>

      @if (loading()) {
        <p class="text-[12px] text-gray-400 py-3 text-center">{{ t('home.todayLoading') }}</p>
      } @else if (visibleRows().length === 0) {
        <div class="py-4 flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-gw-green-light/60 flex items-center justify-center shrink-0">
            <app-icon name="check" class="w-4 h-4 text-gw-green-dark" strokeWidth="2" />
          </div>
          <div class="flex-1">
            <div class="text-[13px] font-medium text-gw-green-dark">{{ t('home.todayClear') }}</div>
            <div class="text-[11px] text-gray-500 mt-0.5">{{ t('home.todayClearBody') }}</div>
          </div>
        </div>
      } @else {
        <div class="flex flex-col divide-y divide-gray-100">
          @for (row of visibleRows(); track row.reminder.id) {
            <a [routerLink]="['/plants', row.plant.id]"
               class="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
              <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" [class]="actionBg(row.reminder.actionType)">
                <app-icon [name]="actionIcon(row.reminder.actionType)" class="w-4 h-4" [class]="actionFg(row.reminder.actionType)" strokeWidth="1.8" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-medium text-gray-800 truncate">{{ t(actionLabelKey(row.reminder.actionType)) }} {{ row.plant.name }}</div>
                <div class="text-[11px] text-gray-400 truncate flex items-center gap-1">
                  <app-icon [name]="plantTypeIcon(row.plant)" class="w-3.5 h-3.5 text-gray-300" />
                  {{ row.plant.name }} · {{ dueLabel(row.reminder) }}
                </div>
              </div>
            </a>
          }
        </div>
        @if (dueRows().length > visibleRows().length) {
          <a routerLink="/calendar" class="block mt-2 text-[11px] text-gw-green-dark text-center hover:underline">
            {{ t('home.todayViewAll', { n: dueRows().length - visibleRows().length }) }}
          </a>
        }
      }
    </div>
  `,
})
export class TodayCardComponent implements OnInit {
  private reminderService = inject(ReminderService);
  private plantService = inject(PlantService);

  /** Cap on inline items; user can click "view all" to jump to the calendar. */
  max = input<number>(3);

  reminders = signal<PlantReminder[]>([]);
  loading = signal(true);

  dueRows = computed<DueRow[]>(() => {
    const endOfToday = dayjs().endOf('day');
    const now = dayjs();
    const plantsById = new Map(this.plantService.plants().map(p => [p.id, p]));
    return this.reminders()
      .filter(r => r.enabled)
      .filter(r => {
        const snoozedUntil = r.snoozedUntil ? dayjs(r.snoozedUntil) : null;
        if (snoozedUntil && snoozedUntil.isAfter(endOfToday)) return false;
        return dayjs(r.nextDueAt).isBefore(endOfToday);
      })
      .map(r => ({ reminder: r, plant: plantsById.get(r.plantId) }))
      .filter((row): row is DueRow => !!row.plant)
      .sort((a, b) => {
        const aOverdue = dayjs(a.reminder.nextDueAt).isBefore(now);
        const bOverdue = dayjs(b.reminder.nextDueAt).isBefore(now);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return a.reminder.nextDueAt.getTime() - b.reminder.nextDueAt.getTime();
      });
  });

  visibleRows = computed(() => this.dueRows().slice(0, this.max()));

  ngOnInit() {
    this.reminderService.list().subscribe({
      next: list => { this.reminders.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  actionIcon(t: ReminderActionType): IconName { return PLANT_ACTION_META[t]?.icon ?? 'note'; }
  actionBg(t: ReminderActionType): string { return PLANT_ACTION_META[t]?.iconBg ?? 'bg-gray-100'; }
  actionFg(t: ReminderActionType): string { return PLANT_ACTION_META[t]?.iconFg ?? 'text-gray-500'; }
  actionLabelKey(t: ReminderActionType): string { return PLANT_ACTION_META[t]?.labelKey ?? ''; }
  plantTypeIcon(p: Plant): IconName { return PLANT_TYPE_STYLE[p.type]?.icon ?? 'sprout'; }

  dueLabel(r: PlantReminder): string {
    const due = dayjs(r.nextDueAt);
    if (due.isBefore(dayjs())) return 'overdue';
    return due.format('HH:mm');
  }
}
