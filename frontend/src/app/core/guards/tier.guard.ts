import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TierService } from '../services/tier.service';
import { SubscriptionTier } from '../services/auth.service';

export function tierGuard(required: SubscriptionTier): CanActivateFn {
  return () => {
    const tier = inject(TierService);
    const router = inject(Router);
    if (tier.isAtLeast(required)) return true;
    router.navigate(['/upgrade'], { queryParams: { required } });
    return false;
  };
}
