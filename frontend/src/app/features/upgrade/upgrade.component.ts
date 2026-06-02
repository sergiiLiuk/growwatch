import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TierService } from '../../core/services/tier.service';
import { SubscriptionTier } from '../../core/services/auth.service';

interface PlanRow {
  tier: SubscriptionTier;
  nameKey: string;
  priceKey: string;
  annualPriceKey?: string;
  featuresKey: string;
}

@Component({
  selector: 'app-upgrade',
  imports: [TranslocoDirective],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">
      <h1 class="text-[18px] font-medium text-gray-800 mb-6">{{ t('upgrade.title') }}</h1>

      <div class="flex flex-col gap-3">
        @for (p of plans; track p.tier) {
          <div class="bg-white border-[0.5px] rounded-2xl p-4"
               [class.border-gw-green]="tier.current() === p.tier"
               [class.border-gray-200]="tier.current() !== p.tier">
            <div class="flex items-baseline justify-between mb-1">
              <h2 class="text-[15px] font-medium text-gray-800">{{ t(p.nameKey) }}</h2>
              <div class="text-right">
                <span class="text-[13px] text-gray-500">{{ t(p.priceKey) }}</span>
                @if (p.annualPriceKey) {
                  <div class="text-[11px] text-gray-400">{{ t(p.annualPriceKey) }}</div>
                }
              </div>
            </div>
            <p class="text-[12px] text-gray-500 leading-relaxed mb-3">{{ t(p.featuresKey) }}</p>
            @if (tier.current() === p.tier) {
              <span class="text-[11px] font-medium text-gw-green-dark">{{ t('upgrade.current') }}</span>
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
    { tier: 'free', nameKey: 'upgrade.free', priceKey: 'upgrade.freePrice', featuresKey: 'upgrade.freeFeatures' },
    { tier: 'plus', nameKey: 'upgrade.plus', priceKey: 'upgrade.plusPrice', annualPriceKey: 'upgrade.plusPriceAnnual', featuresKey: 'upgrade.plusFeatures' },
    { tier: 'pro',  nameKey: 'upgrade.pro',  priceKey: 'upgrade.proPrice',  featuresKey: 'upgrade.proFeatures' },
  ];
}
