import { Component, output, signal, computed } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { STORAGE_KEYS } from '../../core/constants/storage-keys';

interface Slide {
  emoji: string;
  titleKey: string;
  bodyKey: string;
}

const SLIDES: Slide[] = [
  { emoji: '🌱', titleKey: 'onboarding.s1Title', bodyKey: 'onboarding.s1Body' },
  { emoji: '⏰', titleKey: 'onboarding.s2Title', bodyKey: 'onboarding.s2Body' },
  { emoji: '📅', titleKey: 'onboarding.s3Title', bodyKey: 'onboarding.s3Body' },
];

@Component({
  selector: 'app-onboarding',
  imports: [TranslocoDirective],
  template: `
    <div class="fixed inset-0 z-[80] bg-white flex flex-col" *transloco="let t">
      <!-- Skip -->
      <div class="flex justify-end p-4">
        <button (click)="finish()" class="text-[12px] text-gray-400 hover:text-gray-600 transition-colors">
          {{ t('onboarding.skip') }}
        </button>
      </div>

      <!-- Slide -->
      <div class="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div class="w-24 h-24 rounded-full bg-gw-green-light flex items-center justify-center text-5xl mb-6">
          {{ slide().emoji }}
        </div>
        <h1 class="text-[22px] font-semibold text-gw-green-dark leading-tight mb-3">{{ t(slide().titleKey) }}</h1>
        <p class="text-[14px] text-gray-600 leading-relaxed max-w-xs">{{ t(slide().bodyKey) }}</p>
      </div>

      <!-- Dots + CTA -->
      <div class="pb-10 px-8 flex flex-col items-center gap-5">
        <div class="flex gap-2">
          @for (s of slides; track $index) {
            <span class="w-2 h-2 rounded-full transition-colors"
                  [class]="$index === index() ? 'bg-gw-green' : 'bg-gray-200'"></span>
          }
        </div>
        <button (click)="next()"
                class="w-full max-w-xs py-3.5 bg-gw-green text-white font-semibold rounded-xl hover:bg-gw-green-dark transition-colors">
          {{ isLast() ? t('onboarding.getStarted') : t('onboarding.next') }}
        </button>
      </div>
    </div>
  `,
})
export class OnboardingComponent {
  done = output<void>();

  readonly slides = SLIDES;
  index = signal(0);
  slide = computed(() => this.slides[this.index()]);
  isLast = computed(() => this.index() === this.slides.length - 1);

  next() {
    if (this.isLast()) return this.finish();
    this.index.update(i => i + 1);
  }

  finish() {
    try { localStorage.setItem(STORAGE_KEYS.ONBOARDED, '1'); } catch { /* private mode */ }
    this.done.emit();
  }
}

/** Pure helper so callers (home, etc.) can ask if the user has seen onboarding. */
export function hasOnboarded(): boolean {
  try { return localStorage.getItem(STORAGE_KEYS.ONBOARDED) === '1'; }
  catch { return true; }
}
