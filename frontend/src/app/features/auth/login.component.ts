import { AfterViewInit, Component, ElementRef, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AuthService, GOOGLE_CLIENT_ID } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import { renderGsiButton, isGsiEnvironmentSupported } from './gsi-helper';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, IconComponent, TranslocoDirective],
  template: `
    <div class="min-h-screen bg-gw-parchment flex flex-col items-center justify-center px-6" *transloco="let t">

      <!-- Logo + branding -->
      <div class="flex flex-col items-center mb-10">
        <img src="/icons/icon-192x192.png" alt="GrowWatch" class="w-20 h-20 rounded-2xl shadow-sm mb-5" />
        <h1 class="text-[1.75rem] tracking-tight">
          <span class="font-bold text-gw-green-dark">Grow</span><span class="font-normal text-gray-500">Watch</span>
        </h1>
        <p class="text-gray-400 text-sm mt-1">{{ t('auth.tagline') }}</p>
      </div>

      <!-- Form card -->
      <form (ngSubmit)="signIn()"
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

        <!-- Inline "email not verified" resend prompt -->
        @if (showResendVerification()) {
          <div class="text-center mb-4">
            @if (resendSent()) {
              <p class="text-[12px] text-gw-green-dark">{{ t('auth.verificationResent') }}</p>
            } @else {
              <button type="button" (click)="resendVerification()"
                      [disabled]="resending()"
                      class="text-[12px] font-medium text-gw-green-dark hover:underline disabled:opacity-40">
                {{ resending() ? t('auth.sending') : t('auth.resendVerification') }}
              </button>
            }
          </div>
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
export class LoginComponent implements AfterViewInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);
  private host = inject(ElementRef<HTMLElement>);

  email = '';
  password = '';
  showPassword = signal(false);
  error = signal('');
  loading = signal(false);
  showResendVerification = signal(false);
  resending = signal(false);
  resentSentSig = signal(false);

  // Google sign-in — gated on both client id presence and the browser/PWA
  // actually supporting GSI/FedCM. Skipping the unsupported cases keeps the
  // login form clean (no flash of a broken Google button + red error).
  readonly googleEnabled = !!GOOGLE_CLIENT_ID && isGsiEnvironmentSupported();
  googleError = signal(false);

  resendSent() { return this.resentSentSig(); }

  async ngAfterViewInit() {
    if (!this.googleEnabled) {
      console.warn('[GSI] disabled — no client id');
      return;
    }
    console.log('[GSI] ngAfterViewInit — searching for .gsi-host');
    // The @if block may not have rendered yet on the first AfterViewInit pass
    // (esp. when nested inside *transloco's embedded view), so poll for the
    // element instead of giving up after one query.
    const host = this.host.nativeElement as HTMLElement;
    let el: HTMLElement | null = null;
    for (let i = 0; i < 30; i++) {
      el = host.querySelector<HTMLElement>('.gsi-host');
      if (el) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!el) {
      console.error('[GSI] .gsi-host not found after 3s of polling');
      this.googleError.set(true);
      return;
    }
    console.log('[GSI] element found, calling renderGsiButton');
    try {
      await renderGsiButton({
        clientId: GOOGLE_CLIENT_ID,
        element: el,
        text: 'signin_with',
        onCredential: (credential) => this.handleGoogleCredential(credential),
      });
      console.log('[GSI] renderGsiButton finished, children =', el.children.length);
    } catch (err) {
      console.error('[GSI] renderGsiButton failed:', err);
      this.googleError.set(true);
    }
  }

  private async handleGoogleCredential(credential: string) {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.loginWithGoogle(credential);
      this.router.navigate(['/']);
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      const key = msg.startsWith('auth.') ? msg : 'auth.googleFailed';
      this.error.set(this.transloco.translate(key));
    } finally {
      this.loading.set(false);
    }
  }

  async signIn() {
    if (!this.email || !this.password) return;
    this.error.set('');
    this.showResendVerification.set(false);
    this.resentSentSig.set(false);
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password);
      this.router.navigate(['/']);
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      const key = msg.startsWith('auth.') ? msg : 'auth.loginFailed';
      this.error.set(this.transloco.translate(key));
      if (key === 'auth.emailNotVerified') {
        this.showResendVerification.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async resendVerification() {
    if (this.resending() || !this.email) return;
    this.resending.set(true);
    try {
      await this.auth.resendVerificationByEmail(this.email);
      this.resentSentSig.set(true);
    } catch (err) {
      console.error('Resend verification failed:', err);
    } finally {
      this.resending.set(false);
    }
  }
}
