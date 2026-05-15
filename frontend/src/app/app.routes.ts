import { Routes } from '@angular/router';
import { ShellComponent } from './shared/components/shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
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
