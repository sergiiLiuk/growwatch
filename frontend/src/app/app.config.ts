import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { AuthService } from './core/services/auth.service';
import { UserSettingsService } from './core/services/user-settings.service';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideCharts(withDefaultRegisterables()),
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
