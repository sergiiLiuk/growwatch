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

  // Demo accounts behave like Free for feature gating, but their UI hides
  // any upgrade/subscription CTAs so the app stays a pure walkthrough.
  isDemo = computed(() => this.auth.user()?.role === 'demo');
  canSeeSubscription = computed(() => !this.isDemo());

  // ── Feature gates ───────────────────────────────────────────────────────────
  // Free:  basic plant + log + reminders + 24h sensor history
  // Plus:  + AI briefings, weather warnings, 30-day history
  // Pro:   + ESP32 sensor pairing, 90-day history, multi-device

  canSeeAi = computed(() => this.isPlus());
  canSeeWeatherWarnings = computed(() => this.isPlus());

  /** Temperature + humidity insight pages always available; range gating is data-only. */
  canSeeTemperature = computed(() => true);
  canSeeHumidity = computed(() => true);

  /** ESP32 sensor pairing UI (Pro feature — hardware sold/owned by Pro subscribers). */
  canSeeSensors = computed(() => this.isPro());

  /** Extended history windows on insight pages. */
  canSee30Days = computed(() => this.isPlus());
  canSee90Days = computed(() => this.isPro());
}
