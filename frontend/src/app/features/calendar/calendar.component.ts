import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { PlantEventService, PlantEvent } from '../../core/services/plant-event.service';
import { PlantService, PlantType } from '../../core/services/plant.service';
import { PLANT_ACTION_META } from '../../core/constants/plant-actions';
import { PLANT_TYPE_STYLE } from '../../core/constants/plant-styles';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { EmptyStateComponent } from '../../shared/components/atoms/empty-state.component';

dayjs.extend(isoWeek);

interface DayCell {
  date: Date;
  iso: string; // YYYY-MM-DD
  weekdayKey: string;
  day: number;
  events: PlantEvent[];
  isToday: boolean;
  isSelected: boolean;
  isWeekend: boolean;
}

@Component({
  selector: 'app-calendar',
  imports: [RouterLink, IconComponent, EmptyStateComponent, TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">

      <!-- Sticky top: title + filters + week strip -->
      <div class="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">

      <!-- Header -->
      <div class="flex items-start justify-between mb-4">
        <div>
          <h1 class="text-[20px] font-semibold text-gray-900 flex items-center gap-2">
            {{ t('calendar.title') }} <span>🌱</span>
          </h1>
          <button (click)="resetToThisWeek()"
                  class="mt-0.5 text-[12px] text-gray-500 hover:text-gw-green-dark transition-colors flex items-center gap-1">
            {{ monthLabel() }}
            <span class="text-[10px]">▼</span>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button (click)="prevWeek()"
                  class="w-10 h-10 flex items-center justify-center bg-white border-[0.5px] border-gray-200 rounded-xl text-gray-500 hover:border-gray-300 transition-colors"
                  [attr.aria-label]="t('calendar.prevWeek')">
            <span class="text-[14px]">‹</span>
          </button>
          <button (click)="nextWeek()"
                  class="w-10 h-10 flex items-center justify-center bg-white border-[0.5px] border-gray-200 rounded-xl text-gray-500 hover:border-gray-300 transition-colors"
                  [attr.aria-label]="t('calendar.nextWeek')">
            <span class="text-[14px]">›</span>
          </button>
        </div>
      </div>

      <!-- Type filter chips -->
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
            {{ t('calendar.filterAll') }}
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
            </button>
          }
        </div>
      }

      <!-- Week strip -->
      <div class="grid grid-cols-7 gap-1.5 mb-4">
        @for (cell of weekCells(); track cell.iso) {
          <button (click)="selectDay(cell.date)"
                  class="rounded-xl py-2 flex flex-col items-center justify-center gap-1 transition-colors"
                  [class.bg-gw-green]="cell.isSelected"
                  [class.text-white]="cell.isSelected"
                  [class.bg-white]="!cell.isSelected"
                  [class.border-[0.5px]]="!cell.isSelected"
                  [class.border-gray-200]="!cell.isSelected"
                  [class.text-gray-700]="!cell.isSelected && !cell.isWeekend"
                  [class.text-gw-red]="!cell.isSelected && cell.isWeekend">
            <span class="text-[10px] uppercase tracking-wider opacity-70">{{ t('calendar.weekday.' + cell.weekdayKey) }}</span>
            <span class="text-[15px] font-semibold tabular-nums">{{ cell.day }}</span>
            <span class="flex gap-0.5 h-1.5">
              @for (e of dayDots(cell); track e) {
                <span class="w-1 h-1 rounded-full" [class]="dotClass(e, cell.isSelected)"></span>
              }
            </span>
          </button>
        }
      </div>

      <!-- /sticky wrapper -->
      </div>

      <!-- Loading -->
      @if (loading()) {
        <p class="text-[12px] text-gray-400 text-center py-6">{{ t('calendar.loading') }}</p>
      }

      <!-- Selected day events -->
      @if (!loading()) {
        <div class="mb-3 bg-white border-[0.5px] border-gray-200 rounded-2xl overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 bg-gray-50">
            <span class="text-[12px] font-semibold text-gw-green-dark">{{ selectedDayLabel() }}</span>
            <span class="text-[11px] text-gray-500">{{ selectedDayCountLabel() }}</span>
          </div>
          @if (selectedDayEvents().length === 0) {
            <p class="text-[12px] text-gray-400 text-center py-6">{{ t('calendar.noEventsThisDay') }}</p>
          } @else {
            <div class="divide-y divide-gray-100">
              @for (e of selectedDayEvents(); track e.id) {
                <a [routerLink]="['/plants', e.plantId]"
                   class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div class="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
                       [class]="getStyle(e.plantType).bg">
                    {{ getStyle(e.plantType).emoji }}
                  </div>
                  <div class="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                       [class]="actionBg(e.type)">
                    {{ actionEmoji(e.type) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-semibold text-gray-900 truncate">{{ t('plantDetail.action.' + e.type) }}</div>
                    <div class="text-[11px] text-gray-500 truncate">{{ e.plantName }} · {{ getTypeLabel(e.plantType) }}</div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-[11px] text-gray-500 tabular-nums">{{ formatTime(e.scheduledAt) }}</div>
                    <span class="mt-0.5 inline-block text-[10px] px-2 py-0.5 rounded-full font-medium"
                          [class]="statusPillClass(e.status)">
                      {{ t('calendar.status.' + e.status) }}
                    </span>
                  </div>
                </a>
              }
            </div>
          }
        </div>
      }

      <!-- Other days in this week (collapsed) -->
      @if (!loading()) {
        @for (cell of otherDays(); track cell.iso) {
          <button (click)="selectDay(cell.date)"
                  class="w-full mb-2 flex items-center justify-between px-4 py-2.5 bg-white border-[0.5px] border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
            <span class="text-[12px] font-medium"
                  [class.text-gw-red]="cell.isWeekend"
                  [class.text-gray-700]="!cell.isWeekend">
              {{ formatDayLong(cell.date) }}
            </span>
            <span class="flex items-center gap-2">
              <span class="text-[11px] px-2 py-0.5 rounded-full"
                    [class]="cell.events.length > 0 ? 'bg-gw-green-light text-gw-green-dark' : 'bg-gray-100 text-gray-400'">
                {{ cellCountLabel(cell) }}
              </span>
              <span class="text-gray-300 text-[12px]">›</span>
            </span>
          </button>
        }
      }

      <!-- Upcoming next 7 days -->
      @if (!loading()) {
        <div class="mt-6">
          <div class="flex items-center justify-between mb-2">
            <div class="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{{ t('calendar.upcomingTitle') }}</div>
            <span class="text-[11px] text-gray-400">{{ t('calendar.upcomingSubtitle') }}</span>
          </div>
          @if (upcomingEvents().length === 0) {
            <app-empty-state emoji="📅" [title]="t('calendar.noUpcomingTitle')" [subtitle]="t('calendar.noUpcomingBody')" />
          } @else {
            <div class="bg-white border-[0.5px] border-gray-200 rounded-2xl divide-y divide-gray-100">
              @for (e of upcomingEvents(); track e.id) {
                <a [routerLink]="['/plants', e.plantId]"
                   class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div class="text-center shrink-0 w-12">
                    <div class="text-[10px] text-gray-400 uppercase">{{ formatMonthShort(e.scheduledAt) }} {{ e.scheduledAt.getDate() }}</div>
                    <div class="text-[10px] text-gray-400 mt-0.5">{{ formatWeekdayShort(e.scheduledAt) }}</div>
                  </div>
                  <div class="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                       [class]="getStyle(e.plantType).bg">
                    {{ getStyle(e.plantType).emoji }}
                  </div>
                  <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
                       [class]="actionBg(e.type)">
                    {{ actionEmoji(e.type) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[12px] font-semibold text-gray-900 truncate">{{ t('plantDetail.action.' + e.type) }}</div>
                    <div class="text-[11px] text-gray-500 truncate">{{ e.plantName }} · {{ getTypeLabel(e.plantType) }}</div>
                  </div>
                  <div class="text-[11px] text-gray-500 tabular-nums shrink-0">{{ formatTime(e.scheduledAt) }}</div>
                </a>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CalendarComponent implements OnInit {
  private eventService = inject(PlantEventService);
  private plantService = inject(PlantService);
  private transloco = inject(TranslocoService);

  // Window: ISO Monday of the visible week
  weekStart = signal<Date>(dayjs().startOf('isoWeek').toDate());
  selectedDate = signal<Date>(dayjs().startOf('day').toDate());
  typeFilter = signal<PlantType | 'all'>('all');

  events = signal<PlantEvent[]>([]);
  loading = signal(false);

  /** Distinct plant types present in the user's collection. */
  availableTypes = computed(() => {
    const counts = new Map<PlantType, number>();
    for (const p of this.plantService.plants()) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => this.getTypeLabel(a.type).localeCompare(this.getTypeLabel(b.type)));
  });

  /** Events filtered by the current type chip. */
  private filteredEvents = computed(() => {
    const tf = this.typeFilter();
    return tf === 'all' ? this.events() : this.events().filter(e => e.plantType === tf);
  });

  weekCells = computed<DayCell[]>(() => {
    const start = dayjs(this.weekStart());
    const today = dayjs().startOf('day');
    const sel = dayjs(this.selectedDate()).startOf('day');
    return Array.from({ length: 7 }, (_, i) => {
      const d = start.add(i, 'day');
      const iso = d.format('YYYY-MM-DD');
      const dayEvents = this.filteredEvents().filter(e => dayjs(e.scheduledAt).format('YYYY-MM-DD') === iso);
      return {
        date: d.toDate(),
        iso,
        weekdayKey: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i],
        day: d.date(),
        events: dayEvents,
        isToday: d.isSame(today, 'day'),
        isSelected: d.isSame(sel, 'day'),
        isWeekend: i >= 5,
      };
    });
  });

  selectedDayEvents = computed(() => {
    const iso = dayjs(this.selectedDate()).format('YYYY-MM-DD');
    return this.filteredEvents().filter(e => dayjs(e.scheduledAt).format('YYYY-MM-DD') === iso);
  });

  otherDays = computed(() => this.weekCells().filter(c => !c.isSelected));

  /** Next 7 days from tomorrow, only 'upcoming' status, capped to 6 items. */
  upcomingEvents = computed(() => {
    const tomorrow = dayjs().add(1, 'day').startOf('day');
    const limit = tomorrow.add(7, 'day');
    return this.filteredEvents()
      .filter(e => e.status === 'upcoming' && dayjs(e.scheduledAt) >= tomorrow && dayjs(e.scheduledAt) < limit)
      .slice(0, 6);
  });

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    // Pull current week + next 14 days so the upcoming section is covered too
    const from = dayjs(this.weekStart()).startOf('day').toDate();
    const to = dayjs(this.weekStart()).add(21, 'day').endOf('day').toDate();
    this.eventService.list(from, to).subscribe({
      next: list => { this.events.set(list); this.loading.set(false); },
      error: err => { console.error('Failed to load plant events:', err); this.loading.set(false); },
    });
  }

  prevWeek() {
    this.weekStart.set(dayjs(this.weekStart()).subtract(7, 'day').toDate());
    this.selectedDate.set(this.weekStart());
    this.load();
  }

  nextWeek() {
    this.weekStart.set(dayjs(this.weekStart()).add(7, 'day').toDate());
    this.selectedDate.set(this.weekStart());
    this.load();
  }

  resetToThisWeek() {
    this.weekStart.set(dayjs().startOf('isoWeek').toDate());
    this.selectedDate.set(dayjs().startOf('day').toDate());
    this.load();
  }

  selectDay(d: Date) { this.selectedDate.set(d); }

  // ── Labels ────────────────────────────────────────────────────────────────

  monthLabel = computed(() => {
    const d = dayjs(this.weekStart());
    return d.format('MMMM YYYY');
  });

  selectedDayLabel(): string {
    const d = dayjs(this.selectedDate());
    return d.format('dddd, D MMM');
  }

  selectedDayCountLabel(): string {
    const n = this.selectedDayEvents().length;
    return n === 1
      ? this.transloco.translate('calendar.eventCountOne')
      : this.transloco.translate('calendar.eventCount', { n });
  }

  cellCountLabel(cell: DayCell): string {
    const n = cell.events.length;
    if (n === 0) return this.transloco.translate('calendar.noEvents');
    if (n === 1) return this.transloco.translate('calendar.eventCountOne');
    return this.transloco.translate('calendar.eventCount', { n });
  }

  formatDayLong(d: Date): string { return dayjs(d).format('dddd, D MMM'); }
  formatTime(d: Date): string { return dayjs(d).format('HH:mm'); }
  formatMonthShort(d: Date): string { return dayjs(d).format('MMM'); }
  formatWeekdayShort(d: Date): string { return dayjs(d).format('ddd'); }

  // ── Visual helpers ────────────────────────────────────────────────────────

  /** First 3 events worth of dots for the week strip. */
  dayDots(cell: DayCell): PlantEvent[] {
    return cell.events.slice(0, 3);
  }

  dotClass(e: PlantEvent, onSelected: boolean): string {
    if (onSelected) return 'bg-white/70';
    if (e.status === 'upcoming') return 'bg-gw-amber';
    return 'bg-gw-green';
  }

  statusPillClass(status: 'completed' | 'upcoming'): string {
    return status === 'completed'
      ? 'bg-gw-green-light text-gw-green-dark'
      : 'bg-gw-amber-light text-gw-amber-dark';
  }

  actionEmoji(type: string): string { return PLANT_ACTION_META[type as keyof typeof PLANT_ACTION_META]?.emoji ?? '•'; }
  actionBg(type: string): string { return PLANT_ACTION_META[type as keyof typeof PLANT_ACTION_META]?.iconBg ?? 'bg-gray-100'; }
  getStyle(type: PlantType) { return PLANT_TYPE_STYLE[type] ?? { emoji: '🌿', bg: 'bg-green-50' }; }
  getTypeLabel(type: PlantType): string { return this.plantService.getTypeLabel(type); }
}
