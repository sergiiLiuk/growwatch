import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

const HOME_ICON = `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
const LEAF_ICON  = `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 2C6 2 3 7 3 12c0 5 4 10 9 10s9-5 9-10C21 7 18 2 12 2z"/><path d="M12 22V12M12 12C9 9 6 8 3 12"/></svg>`;
const CAL_ICON   = `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const BELL_ICON  = `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`;
const GEAR_ICON  = `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-dvh bg-gray-50 overflow-hidden">

      <!-- Desktop sidebar — lg+ -->
      <aside class="hidden lg:flex flex-col w-56 bg-white border-r border-[0.5px] border-gray-200 shrink-0">
        <div class="flex items-center gap-2 px-5 py-5 border-b border-[0.5px] border-gray-200">
          <div class="w-7 h-7 rounded-full bg-gw-green-light flex items-center justify-center">
            <svg class="w-4 h-4 text-gw-green-dark" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3c0 0-6 4-6 9a6 6 0 0012 0c0-5-6-9-6-9z"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
            </svg>
          </div>
          <span class="font-medium text-[14px] text-gray-800">GrowWatch</span>
        </div>
        <nav class="flex flex-col gap-1 p-3 flex-1">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path"
               routerLinkActive="bg-gw-green-light text-gw-green-dark"
               [routerLinkActiveOptions]="{exact: item.path === '/'}"
               class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              <span [innerHTML]="item.icon"></span>
              {{ item.label }}
            </a>
          }
        </nav>
      </aside>

      <!-- Main content -->
      <main class="flex-1 overflow-y-auto pb-20 lg:pb-0">
        <router-outlet />
      </main>

      <!-- Mobile bottom nav -->
      <nav class="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[0.5px] border-gray-200 flex z-50">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path"
             routerLinkActive="text-gw-green"
             [routerLinkActiveOptions]="{exact: item.path === '/'}"
             class="flex-1 flex flex-col items-center gap-1 py-3 text-gray-400 hover:text-gray-600 transition-colors text-[11px]">
            <span [innerHTML]="item.icon"></span>
            {{ item.label }}
          </a>
        }
      </nav>
    </div>
  `,
})
export class ShellComponent {
  navItems = [
    { path: '/',         label: 'Home',     icon: HOME_ICON },
    { path: '/plants',   label: 'Plants',   icon: LEAF_ICON  },
    { path: '/digest',   label: 'Digest',   icon: CAL_ICON   },
    { path: '/alerts',   label: 'Alerts',   icon: BELL_ICON  },
    { path: '/settings', label: 'Settings', icon: GEAR_ICON  },
  ];
}
