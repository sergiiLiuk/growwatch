import { Routes } from '@angular/router';
import { ShellComponent } from './shared/components/shell/shell.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
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
        path: 'plants/:id',
        loadComponent: () => import('./features/plants/plant-detail.component').then(m => m.PlantDetailComponent),
      },
      {
        path: 'light',
        loadComponent: () => import('./features/light/light-insights.component').then(m => m.LightInsightsComponent),
      },
      {
        path: 'temperature',
        loadComponent: () => import('./features/temperature/temperature-insights.component').then(m => m.TemperatureInsightsComponent),
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
        path: 'settings/sensor-setup',
        loadComponent: () => import('./features/settings/sensor-setup.component').then(m => m.SensorSetupComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
