import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TierService } from '../../core/services/tier.service';
import { SubscriptionTier } from '../../core/services/auth.service';

interface PlanRow {
  tier: SubscriptionTier;
  nameKey: string;
  priceKey: string;
  annualPriceKey?: string;
  /** i18n key roots, each is a list under upgrade.features.{tier}.{n}. */
  featureKeys: string[];
  popular?: boolean;
}

@Component({
  selector: 'app-upgrade',
  imports: [TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 pb-6" *transloco="let t">
      <div class="sticky top-0 z-30 -mx-4 px-4 pt-5 pb-3 mb-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <h1 class="text-[18px] font-medium text-gray-800">{{ t('upgrade.title') }}</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">{{ t('upgrade.subtitle') }}</p>
      </div>

      <div class="flex flex-col gap-3">
        @for (p of plans; track p.tier) {
          <div class="relative bg-white border-[0.5px] rounded-2xl p-4"
               [class.border-gw-green]="tier.current() === p.tier || p.popular"
               [class.border-gray-200]="tier.current() !== p.tier && !p.popular">
            @if (p.popular) {
              <span class="absolute -top-2 right-4 text-[10px] font-semibold tracking-wide uppercase bg-gw-green text-white px-2 py-0.5 rounded-full">
                {{ t('upgrade.mostPopular') }}
              </span>
            }
            <div class="flex items-baseline justify-between mb-3">
              <h2 class="text-[15px] font-medium text-gray-800">{{ t(p.nameKey) }}</h2>
              <div class="text-right">
                <span class="text-[14px] font-semibold text-gray-800">{{ t(p.priceKey) }}</span>
                @if (p.annualPriceKey) {
                  <div class="text-[11px] text-gray-400">{{ t(p.annualPriceKey) }}</div>
                }
              </div>
            </div>
            <ul class="flex flex-col gap-1.5 mb-3">
              @for (k of p.featureKeys; track k) {
                <li class="flex items-start gap-2 text-[12px] text-gray-700 leading-relaxed">
                  <span class="text-gw-green-dark mt-0.5 shrink-0">✓</span>
                  <span>{{ t(k) }}</span>
                </li>
              }
            </ul>
            @if (tier.current() === p.tier) {
              <span class="inline-block text-[11px] font-medium text-gw-green-dark bg-gw-green-light/60 px-2 py-1 rounded-md">{{ t('upgrade.current') }}</span>
            } @else if (p.tier === 'free') {
              <span class="text-[11px] text-gray-400">{{ t('upgrade.alwaysFree') }}</span>
            } @else if (p.tier === 'pro') {
              <button class="text-[12px] font-medium text-gw-green-dark border-[0.5px] border-gw-green-light px-3 py-1.5 rounded-lg hover:bg-gw-green-light/40 transition-colors">
                {{ t('upgrade.joinWaitlist') }}
              </button>
            } @else {
              <button class="text-[12px] font-medium text-gw-green-dark border-[0.5px] border-gw-green-light px-3 py-1.5 rounded-lg opacity-50 cursor-not-allowed" disabled>
                {{ t('upgrade.upgrade') }}
              </button>
            }
          </div>
        }
      </div>

      <p class="text-[11px] text-gray-400 mt-4 leading-relaxed">{{ t('upgrade.comingSoon') }}</p>
    </div>
  `,
})
export class UpgradeComponent {
  tier = inject(TierService);
  plans: PlanRow[] = [
    {
      tier: 'free',
      nameKey: 'upgrade.free',
      priceKey: 'upgrade.freePrice',
      featureKeys: [
        'upgrade.features.free.plants',
        'upgrade.features.free.history',
        'upgrade.features.free.reminders',
        'upgrade.features.free.calendar',
        'upgrade.features.free.export',
      ],
    },
    {
      tier: 'plus',
      nameKey: 'upgrade.plus',
      priceKey: 'upgrade.plusPrice',
      annualPriceKey: 'upgrade.plusPriceAnnual',
      popular: true,
      featureKeys: [
        'upgrade.features.plus.everything',
        'upgrade.features.plus.ai',
        'upgrade.features.plus.weather',
        'upgrade.features.plus.history30',
      ],
    },
    {
      tier: 'pro',
      nameKey: 'upgrade.pro',
      priceKey: 'upgrade.proPrice',
      featureKeys: [
        'upgrade.features.pro.everything',
        'upgrade.features.pro.sensors',
        'upgrade.features.pro.history90',
        'upgrade.features.pro.multidevice',
      ],
    },
  ];
}
