import { Component, signal, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';

type Status = 'pending' | 'success' | 'error';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, TranslocoDirective],
  template: `
    <div class="min-h-screen bg-gw-parchment flex flex-col items-center justify-center px-6 py-10" *transloco="let t">
      <div class="flex flex-col items-center mb-8">
        <img src="/icons/icon-192x192.png" alt="GrowWatch" class="w-20 h-20 rounded-2xl shadow-sm mb-5" />
        <h1 class="text-[1.75rem] tracking-tight">
          <span class="font-bold text-gw-green-dark">Grow</span><span class="font-normal text-gray-500">Watch</span>
        </h1>
      </div>

      <div class="w-full max-w-sm bg-gw-surface rounded-2xl p-8 shadow-sm border border-gw-border/50 text-center">
        @if (status() === 'pending') {
          <p class="text-sm text-gray-600">{{ t('verifyEmail.checking') }}</p>
        } @else if (status() === 'success') {
          <div class="w-12 h-12 rounded-full bg-gw-green-light flex items-center justify-center mx-auto mb-3 text-2xl">✓</div>
          <h2 class="text-[16px] font-medium text-gray-900 mb-1">{{ t('verifyEmail.successTitle') }}</h2>
          <p class="text-[13px] text-gray-500 leading-relaxed mb-5">{{ t('verifyEmail.successBody') }}</p>
          <a routerLink="/" class="inline-block py-3 px-6 rounded-xl bg-gw-green text-white font-medium text-[13px] hover:bg-gw-green-dark transition-colors">{{ t('verifyEmail.continue') }}</a>
        } @else {
          <div class="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3 text-2xl text-red-500">!</div>
          <h2 class="text-[16px] font-medium text-gray-900 mb-1">{{ t('verifyEmail.errorTitle') }}</h2>
          <p class="text-[13px] text-gray-500 leading-relaxed mb-5">{{ errorMessage() }}</p>
          <a routerLink="/" class="text-[13px] text-gw-green-dark font-medium hover:underline">{{ t('verifyEmail.backHome') }}</a>
        }
      </div>
    </div>
  `,
})
export class VerifyEmailComponent implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  status = signal<Status>('pending');
  errorMessage = signal('');

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.status.set('error');
      this.errorMessage.set('Missing verification token.');
      return;
    }
    try {
      await this.auth.verifyEmail(token);
      this.status.set('success');
    } catch (err: any) {
      this.status.set('error');
      this.errorMessage.set(err?.message || 'Verification failed.');
    }
  }
}
