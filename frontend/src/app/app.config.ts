import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTransloco } from '@jsverse/transloco';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { AuthService } from './core/services/auth.service';
import { UserSettingsService } from './core/services/user-settings.service';
import { HttpTranslocoLoader } from './core/transloco-loader';

import { routes } from './app.routes';

export const SUPPORTED_LOCALES = ['en', 'da'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

function detectInitialLocale(): Locale {
  const browser = (navigator.language ?? '').slice(0, 2).toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(browser) ? (browser as Locale) : 'da';
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideCharts(withDefaultRegisterables()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LOCALES],
        defaultLang: detectInitialLocale(),
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: HttpTranslocoLoader,
    }),
    // Block bootstrap until per-user settings are loaded — avoids a flash of
    // default values on the first paint after a refresh. If the user isn't
    // logged in, this resolves immediately.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      const settings = inject(UserSettingsService);
      if (!auth.isAuthenticated()) return Promise.resolve();
      return settings.loadFromBackend();
    }),
  ],
};
