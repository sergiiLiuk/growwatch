import { Injectable, computed, inject } from '@angular/core';
import { AuthService, SubscriptionTier } from './auth.service';

const ORDER: Record<SubscriptionTier, number> = { free: 0, plus: 1, pro: 2 };

@Injectable({ providedIn: 'root' })
export class TierService {
  private auth = inject(AuthService);

  current = computed<SubscriptionTier>(() => this.auth.user()?.subscriptionTier ?? 'free');

  isAtLeast(required: SubscriptionTier): boolean {
    return ORDER[this.current()] >= ORDER[required];
  }

  isFree = computed(() => this.current() === 'free');
  isPlus = computed(() => this.isAtLeast('plus'));
  isPro = computed(() => this.isAtLeast('pro'));

  canSeeAi = computed(() => this.isPlus());
  canSeeWeatherWarnings = computed(() => this.isPlus());
  canSeeSensors = computed(() => this.isPro());
}
