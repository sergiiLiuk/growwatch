import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-dvh bg-gray-50 overflow-hidden">

      <!-- Desktop sidebar -->
      <aside class="hidden md:flex flex-col w-56 bg-white border-r border-gray-100 shrink-0">
        <div class="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
          <div class="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
            <svg class="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c0 0-6 4-6 9a6 6 0 0012 0c0-5-6-9-6-9z"/>
            </svg>
          </div>
          <span class="font-medium text-gray-800 text-sm">GrowWatch</span>
        </div>
        <nav class="flex flex-col gap-1 p-3 flex-1">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="bg-green-50 text-green-700"
               [routerLinkActiveOptions]="{exact: item.path === '/'}"
               class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              <span class="text-base" [innerHTML]="item.icon"></span>
              {{ item.label }}
            </a>
          }
        </nav>
        <div class="p-3 border-t border-gray-100">
          <div class="flex items-center gap-2 px-3 py-2">
            <div class="w-2 h-2 rounded-full bg-green-400"></div>
            <span class="text-xs text-gray-400">Sensor online</span>
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 overflow-y-auto pb-20 md:pb-0">
        <router-outlet />
      </main>

      <!-- Mobile bottom nav -->
      <nav class="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-50">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="text-green-600"
             [routerLinkActiveOptions]="{exact: item.path === '/'}"
             class="flex-1 flex flex-col items-center gap-1 py-3 text-gray-400 hover:text-gray-600 transition-colors text-xs">
            <span class="text-xl leading-none" [innerHTML]="item.icon"></span>
            {{ item.label }}
          </a>
        }
      </nav>
    </div>
  `,
})
export class ShellComponent {
  navItems = [
    { path: '/',          label: 'Home',    icon: '🌿' },
    { path: '/plants',    label: 'Plants',  icon: '🌱' },
    { path: '/digest',    label: 'Digest',  icon: '📋' },
    { path: '/alerts',    label: 'Alerts',  icon: '🔔' },
    { path: '/settings',  label: 'Settings',icon: '⚙️' },
  ];
}
