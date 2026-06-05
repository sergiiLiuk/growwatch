import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink, TranslocoDirective],
  template: `
    <div class="min-h-screen bg-gw-parchment flex flex-col items-center justify-center px-6 py-10" *transloco="let t">

      <div class="flex flex-col items-center mb-8">
        <img src="/icons/icon-192x192.png" alt="GrowWatch" class="w-20 h-20 rounded-2xl shadow-sm mb-5" />
        <h1 class="text-[1.75rem] tracking-tight">
          <span class="font-bold text-gw-green-dark">Grow</span><span class="font-normal text-gray-500">Watch</span>
        </h1>
        <p class="text-gray-400 text-sm mt-1">{{ t('auth.forgotTagline') }}</p>
      </div>

      <form (ngSubmit)="submit()" autocomplete="on"
            class="w-full max-w-sm bg-gw-surface rounded-2xl p-8 shadow-sm border border-gw-border/50">

        @if (sent()) {
          <p class="text-sm text-gray-700 text-center leading-relaxed">{{ t('auth.resetEmailSent') }}</p>
          <a routerLink="/login" class="block text-center text-[13px] text-gw-green-dark font-medium hover:underline mt-6">{{ t('auth.backToLogin') }}</a>
        } @else {
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1.5">{{ t('auth.email') }}</label>
            <input
              type="email"
              inputmode="email"
              autocomplete="email"
              [(ngModel)]="email"
              name="email"
              [placeholder]="t('auth.emailPlaceholder')"
              class="w-full px-4 py-3 rounded-xl border border-gw-border bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gw-green/30 focus:border-gw-green transition-colors"
            />
            <p class="text-[11px] text-gray-400 mt-1.5">{{ t('auth.forgotHint') }}</p>
          </div>

          @if (error()) {
            <p class="text-sm text-red-500 mb-4 text-center">{{ error() }}</p>
          }

          <button
            type="submit"
            [disabled]="loading()"
            class="w-full py-3.5 rounded-xl bg-gw-green text-white font-semibold text-base hover:bg-gw-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {{ loading() ? t('auth.sending') : t('auth.sendResetLink') }}
          </button>

          <p class="text-[12px] text-gray-500 text-center mt-5">
            <a routerLink="/login" class="text-gw-green-dark font-medium hover:underline">{{ t('auth.backToLogin') }}</a>
          </p>
        }
      </form>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);

  email = '';
  sent = signal(false);
  error = signal('');
  loading = signal(false);

  async submit() {
    if (!this.email.trim()) {
      this.error.set('Please enter your email');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.requestPasswordReset(this.email.trim());
      this.sent.set(true);
    } catch (err: any) {
      this.error.set(err.message || 'Could not send reset link');
    } finally {
      this.loading.set(false);
    }
  }
}
