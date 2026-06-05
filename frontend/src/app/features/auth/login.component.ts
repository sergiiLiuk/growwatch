import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, IconComponent, TranslocoDirective],
  template: `
    <div class="min-h-screen bg-gw-parchment flex flex-col items-center justify-center px-6" *transloco="let t">

      <!-- Logo + branding -->
      <div class="flex flex-col items-center mb-10">
        <div class="w-20 h-20 rounded-full bg-gw-green flex items-center justify-center mb-5 shadow-sm text-white">
          <app-icon name="leaf" class="w-9 h-9" strokeWidth="1.8" />
        </div>
        <h1 class="text-[1.75rem] tracking-tight">
          <span class="font-bold text-gw-green-dark">Grow</span><span class="font-normal text-gray-500">Watch</span>
        </h1>
        <p class="text-gray-400 text-sm mt-1">{{ t('auth.tagline') }}</p>
      </div>

      <!-- Form card -->
      <form (ngSubmit)="signIn()"
            class="w-full max-w-sm bg-gw-surface rounded-2xl p-8 shadow-sm border border-gw-border/50">

        <!-- Email -->
        <div class="mb-5">
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
        </div>

        <!-- Password -->
        <div class="mb-7">
          <label class="block text-sm font-medium text-gray-700 mb-1.5">{{ t('auth.password') }}</label>
          <div class="relative">
            <input
              [type]="showPassword() ? 'text' : 'password'"
              autocomplete="current-password"
              [(ngModel)]="password"
              name="password"
              [placeholder]="t('auth.passwordPlaceholder')"
              class="w-full px-4 py-3 pr-11 rounded-xl border border-gw-border bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gw-green/30 focus:border-gw-green transition-colors"
            />
            <button type="button" (click)="showPassword.set(!showPassword())"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
              <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" class="w-[18px] h-[18px]" strokeWidth="1.8" />
            </button>
          </div>
        </div>

        @if (error()) {
          <p class="text-sm text-red-500 mb-4 text-center">{{ error() }}</p>
        }

        <div class="text-right -mt-4 mb-5">
          <a routerLink="/forgot-password" class="text-[12px] text-gw-green-dark hover:underline">{{ t('auth.forgotPassword') }}</a>
        </div>

        <!-- Sign in button -->
        <button
          type="submit"
          [disabled]="loading()"
          class="w-full py-3.5 rounded-xl bg-gw-green text-white font-semibold text-base hover:bg-gw-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {{ loading() ? t('auth.signingIn') : t('auth.signIn') }}
        </button>

        <p class="text-[12px] text-gray-500 text-center mt-5">
          {{ t('auth.noAccount') }}
          <a routerLink="/register" class="text-gw-green-dark font-medium hover:underline">{{ t('auth.createAccount') }}</a>
        </p>
      </form>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  email = '';
  password = '';
  showPassword = signal(false);
  error = signal('');
  loading = signal(false);

  async signIn() {
    if (!this.email || !this.password) return;
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password);
      this.router.navigate(['/']);
    } catch (err: any) {
      // Backend throws i18n keys (e.g. 'auth.userNotFound') for known cases.
      // Anything else falls back to a generic translated message.
      const msg = String(err?.message ?? '');
      const key = msg.startsWith('auth.') ? msg : 'auth.loginFailed';
      this.error.set(this.transloco.translate(key));
    } finally {
      this.loading.set(false);
    }
  }
}
