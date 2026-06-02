import { Component, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink, IconComponent, TranslocoDirective],
  template: `
    <div class="min-h-screen bg-gw-parchment flex flex-col items-center justify-center px-6 py-10" *transloco="let t">

      <div class="flex flex-col items-center mb-8">
        <div class="w-20 h-20 rounded-full bg-gw-green flex items-center justify-center mb-5 shadow-sm text-white">
          <app-icon name="leaf" class="w-9 h-9" strokeWidth="1.8" />
        </div>
        <h1 class="text-[1.75rem] tracking-tight">
          <span class="font-bold text-gw-green-dark">Grow</span><span class="font-normal text-gray-500">Watch</span>
        </h1>
        <p class="text-gray-400 text-sm mt-1">{{ t('auth.resetTagline') }}</p>
      </div>

      <form (ngSubmit)="submit()" autocomplete="on"
            class="w-full max-w-sm bg-gw-surface rounded-2xl p-8 shadow-sm border border-gw-border/50">

        @if (!token()) {
          <p class="text-sm text-red-500 text-center">{{ t('auth.missingToken') }}</p>
          <a routerLink="/forgot-password" class="block text-center text-[13px] text-gw-green-dark font-medium hover:underline mt-6">{{ t('auth.requestNewLink') }}</a>
        } @else if (done()) {
          <p class="text-sm text-gray-700 text-center leading-relaxed">{{ t('auth.resetSuccess') }}</p>
          <a routerLink="/login" class="block text-center mt-6 py-3.5 rounded-xl bg-gw-green text-white font-semibold text-base hover:bg-gw-green-dark transition-colors">{{ t('auth.signIn') }}</a>
        } @else {
          <div class="mb-5">
            <label class="block text-sm font-medium text-gray-700 mb-1.5">{{ t('auth.newPassword') }}</label>
            <div class="relative">
              <input
                [type]="showPassword() ? 'text' : 'password'"
                autocomplete="new-password"
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
            <p class="text-[11px] text-gray-400 mt-1.5">{{ t('auth.passwordHint') }}</p>
          </div>

          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1.5">{{ t('auth.confirmPassword') }}</label>
            <input
              [type]="showPassword() ? 'text' : 'password'"
              autocomplete="new-password"
              [(ngModel)]="confirm"
              name="confirm"
              [placeholder]="t('auth.confirmPlaceholder')"
              class="w-full px-4 py-3 rounded-xl border border-gw-border bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gw-green/30 focus:border-gw-green transition-colors"
            />
          </div>

          @if (error()) {
            <p class="text-sm text-red-500 mb-4 text-center">{{ error() }}</p>
          }

          <button
            type="submit"
            [disabled]="loading()"
            class="w-full py-3.5 rounded-xl bg-gw-green text-white font-semibold text-base hover:bg-gw-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {{ loading() ? t('auth.resetting') : t('auth.resetPassword') }}
          </button>
        }
      </form>
    </div>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  token = signal<string | null>(null);
  password = '';
  confirm = '';
  showPassword = signal(false);
  done = signal(false);
  error = signal('');
  loading = signal(false);

  ngOnInit() {
    this.token.set(this.route.snapshot.queryParamMap.get('token'));
  }

  async submit() {
    const token = this.token();
    if (!token) return;
    if (!this.password || !this.confirm) {
      this.error.set('Please fill in both fields');
      return;
    }
    if (this.password.length < 8) {
      this.error.set('Password must be at least 8 characters');
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set('Passwords do not match');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.resetPassword(token, this.password);
      this.done.set(true);
    } catch (err: any) {
      this.error.set(err.message || 'Could not reset password');
    } finally {
      this.loading.set(false);
    }
  }
}
