import { Routes } from '@angular/router';
import { ShellComponent } from './shared/components/shell/shell.component';
import { authGuard } from './core/guards/auth.guard';
import { superuserGuard } from './core/guards/superuser.guard';
import { tierGuard } from './core/guards/tier.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password.component').then(m => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password.component').then(m => m.ResetPasswordComponent),
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./features/auth/verify-email.component').then(m => m.VerifyEmailComponent),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./features/legal/privacy.component').then(m => m.PrivacyComponent),
  },
  {
    path: 'terms',
    loadComponent: () => import('./features/legal/terms.component').then(m => m.TermsComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'plants',
        loadComponent: () => import('./features/plants/plants.component').then(m => m.PlantsComponent),
      },
      {
        path: 'calendar',
        loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent),
      },
      {
        path: 'plants/:id',
        loadComponent: () => import('./features/plants/plant-detail.component').then(m => m.PlantDetailComponent),
      },
      {
        path: 'temperature',
        canActivate: [tierGuard('pro')],
        loadComponent: () => import('./features/temperature/temperature-insights.component').then(m => m.TemperatureInsightsComponent),
      },
      {
        path: 'humidity',
        canActivate: [tierGuard('pro')],
        loadComponent: () => import('./features/humidity/humidity-insights.component').then(m => m.HumidityInsightsComponent),
      },
      {
        path: 'forecast',
        canActivate: [tierGuard('plus')],
        loadComponent: () => import('./features/forecast/forecast.component').then(m => m.ForecastComponent),
      },
      {
        path: 'upgrade',
        loadComponent: () => import('./features/upgrade/upgrade.component').then(m => m.UpgradeComponent),
      },
      {
        path: 'digest',
        loadComponent: () => import('./features/digest/digest.component').then(m => m.DigestComponent),
      },
      {
        path: 'alerts',
        loadComponent: () => import('./features/alerts/alerts.component').then(m => m.AlertsComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
      },
      {
        path: 'settings/shelly-setup',
        canActivate: [tierGuard('pro')],
        loadComponent: () => import('./features/settings/shelly-setup.component').then(m => m.ShellySetupComponent),
      },
      {
        path: 'admin',
        canActivate: [superuserGuard],
        loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
