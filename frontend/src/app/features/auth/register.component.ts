import { AfterViewInit, Component, ElementRef, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService, GOOGLE_CLIENT_ID } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { renderGsiButton, isGsiEnvironmentSupported } from './gsi-helper';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, IconComponent, TranslocoDirective],
  template: `
    <div class="min-h-screen bg-gw-parchment flex flex-col items-center justify-center px-6 py-10" *transloco="let t">

      <div class="flex flex-col items-center mb-8">
        <img src="/icons/icon-192x192.png" alt="GrowWatch" class="w-20 h-20 rounded-2xl shadow-sm mb-5" />
        <h1 class="text-[1.75rem] tracking-tight">
          <span class="font-bold text-gw-green-dark">Grow</span><span class="font-normal text-gray-500">Watch</span>
        </h1>
        <p class="text-gray-400 text-sm mt-1">{{ t('auth.registerTagline') }}</p>
      </div>

      <form (ngSubmit)="submit()" autocomplete="on"
            class="w-full max-w-sm bg-gw-surface rounded-2xl p-8 shadow-sm border border-gw-border/50">

        @if (googleEnabled) {
          <div class="mb-5 flex flex-col items-center gap-3">
            <div class="gsi-host flex justify-center"></div>
            @if (googleError()) {
              <p class="text-[12px] text-red-500">{{ t('auth.googleFailed') }}</p>
            }
            <div class="w-full flex items-center gap-3 text-[11px] text-gray-400 uppercase tracking-wider">
              <span class="flex-1 h-px bg-gw-border"></span>
              {{ t('auth.or') }}
              <span class="flex-1 h-px bg-gw-border"></span>
            </div>
          </div>
        }

        <div class="mb-5">
          <label class="block text-sm font-medium text-gray-700 mb-1.5">{{ t('auth.email') }}</label>
          <input
            type="email"
            inputmode="email"
            autocomplete="email"
            [(ngModel)]="email"
            name="email"
            [placeholder]="t('auth.emailPlaceholder')"
            class="w-full px-4 py-3 rounded-xl shadow-gw-sm bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gw-green/30 focus:border-gw-green transition-colors"
          />
        </div>

        <div class="mb-5">
          <label class="block text-sm font-medium text-gray-700 mb-1.5">{{ t('auth.password') }}</label>
          <div class="relative">
            <input
              [type]="showPassword() ? 'text' : 'password'"
              autocomplete="new-password"
              [(ngModel)]="password"
              name="password"
              [placeholder]="t('auth.passwordPlaceholder')"
              class="w-full px-4 py-3 pr-11 rounded-xl shadow-gw-sm bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gw-green/30 focus:border-gw-green transition-colors"
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
            class="w-full px-4 py-3 rounded-xl shadow-gw-sm bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gw-green/30 focus:border-gw-green transition-colors"
          />
        </div>

        <!-- GDPR: explicit consent to terms + privacy policy. Required to submit. -->
        <label class="flex items-start gap-2 mb-5 cursor-pointer">
          <input type="checkbox" [(ngModel)]="acceptedTerms" name="acceptedTerms"
                 class="mt-0.5 w-4 h-4 accent-gw-green shrink-0" />
          <span class="text-[12px] text-gray-600 leading-relaxed">
            {{ t('auth.consentPrefix') }}
            <a routerLink="/terms" target="_blank" class="text-gw-green-dark font-medium hover:underline">{{ t('auth.consentTerms') }}</a>
            {{ t('auth.consentAnd') }}
            <a routerLink="/privacy" target="_blank" class="text-gw-green-dark font-medium hover:underline">{{ t('auth.consentPrivacy') }}</a>.
          </span>
        </label>

        @if (error()) {
          <p class="text-sm text-red-500 mb-4 text-center">{{ error() }}</p>
        }

        <button
          type="submit"
          [disabled]="loading() || !canSubmit()"
          class="w-full py-3.5 rounded-xl bg-gw-green text-white font-semibold text-base hover:bg-gw-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {{ loading() ? t('auth.creating') : t('auth.createAccount') }}
        </button>

        <p class="text-[12px] text-gray-500 text-center mt-5">
          {{ t('auth.haveAccount') }}
          <a routerLink="/login" class="text-gw-green-dark font-medium hover:underline">{{ t('auth.signIn') }}</a>
        </p>
      </form>
    </div>
  `,
})
export class RegisterComponent implements AfterViewInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);

  email = '';
  password = '';
  confirm = '';
  acceptedTerms = false;
  showPassword = signal(false);
  error = signal('');
  loading = signal(false);

  // Google sign-in — gated on both client id presence and the browser/PWA
  // actually supporting GSI/FedCM. Skipping the unsupported cases keeps the
  // signup form clean (no flash of a broken Google button + red error).
  readonly googleEnabled = !!GOOGLE_CLIENT_ID && isGsiEnvironmentSupported();
  googleError = signal(false);

  canSubmit = computed(() => true);

  async ngAfterViewInit() {
    if (!this.googleEnabled) return;
    const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.gsi-host');
    if (!el) {
      this.googleError.set(true);
      return;
    }
    try {
      await renderGsiButton({
        clientId: GOOGLE_CLIENT_ID,
        element: el,
        text: 'signup_with',
        onCredential: (credential) => this.handleGoogleCredential(credential),
      });
    } catch {
      this.googleError.set(true);
    }
  }

  private async handleGoogleCredential(credential: string) {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.loginWithGoogle(credential);
      this.router.navigate(['/']);
    } catch {
      this.error.set('Google sign-in failed');
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    const email = this.email.trim();
    if (!email || !this.password || !this.confirm) {
      this.error.set('Please fill in all fields');
      return;
    }
    if (!this.acceptedTerms) {
      this.error.set('Please accept the Terms and Privacy Policy to continue.');
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
      await this.auth.register(email, this.password);
      this.router.navigate(['/']);
    } catch (err: any) {
      this.error.set(err.message || 'Registration failed');
    } finally {
      this.loading.set(false);
    }
  }
}
