import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const ICONS = {
  home: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  plants: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 3c0 0-6 4-6 9a6 6 0 0012 0c0-5-6-9-6-9z"/><line x1="12" y1="12" x2="12" y2="21"/></svg>`,
  digest: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  alerts: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  settings: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  logo: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 3c0 0-6 4-6 9a6 6 0 0012 0c0-5-6-9-6-9z"/><line x1="12" y1="12" x2="12" y2="21"/></svg>`,
};

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-dvh bg-gw-parchment overflow-hidden">

      <!-- Desktop sidebar — icon-only rail -->
      <aside class="hidden lg:flex flex-col w-16 bg-gw-parchment border-r border-gw-border shrink-0">

        <!-- Logo -->
        <div class="flex items-center justify-center py-4 shrink-0">
          <div class="w-8 h-8 rounded-lg bg-gw-green-light flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0e3624" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3c0 0-6 4-6 9a6 6 0 0 0 12 0c0-5-6-9-6-9z"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
            </svg>
          </div>
        </div>

        <!-- Nav -->
        <nav class="flex flex-col items-center gap-1 px-2 flex-1">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" [title]="item.label"
               routerLinkActive="" #rla="routerLinkActive"
               [routerLinkActiveOptions]="{exact: item.path === '/'}"
               [class.bg-gw-green-light]="rla.isActive"
               [class.text-gw-green-dark]="rla.isActive"
               [class.text-gray-400]="!rla.isActive"
               class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gw-surface hover:text-gray-600 transition-colors">
              <span [innerHTML]="item.icon"></span>
            </a>
          }
        </nav>

        <!-- Settings -->
        <div class="flex items-center justify-center px-2 pb-5">
          <a routerLink="/settings" title="Settings"
             routerLinkActive="" #srla="routerLinkActive"
             [class.bg-gw-green-light]="srla.isActive"
             [class.text-gw-green-dark]="srla.isActive"
             [class.text-gray-400]="!srla.isActive"
             class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gw-surface hover:text-gray-600 transition-colors">
            <span [innerHTML]="icons.settings"></span>
          </a>
        </div>

      </aside>

      <!-- Main content -->
      <main class="flex-1 overflow-y-auto pb-20 lg:pb-0">
        <router-outlet />
      </main>

      <!-- Mobile bottom nav -->
      <nav class="lg:hidden fixed bottom-0 inset-x-0 bg-gw-surface/95 backdrop-blur-sm border-t border-gw-border flex z-50">
        @for (item of allNavItems; track item.path) {
          <a [routerLink]="item.path"
             routerLinkActive="active-tab"
             [routerLinkActiveOptions]="{exact: item.path === '/'}"
             #rla="routerLinkActive"
             class="flex-1 flex items-center justify-center py-3 text-gray-400 transition-colors">
            <span class="w-10 h-10 flex items-center justify-center rounded-xl transition-colors"
                  [class.bg-gw-green-light]="rla.isActive"
                  [class.text-gw-green-dark]="rla.isActive"
                  [class.text-gray-400]="!rla.isActive">
              <span [innerHTML]="item.icon"></span>
            </span>
          </a>
        }
      </nav>

    </div>
  `,
})
export class ShellComponent {
  private san = inject(DomSanitizer);
  private s = (svg: string): SafeHtml => this.san.bypassSecurityTrustHtml(svg);

  icons = { logo: this.s(ICONS.logo), settings: this.s(ICONS.settings) };

  navItems = [
    { path: '/',       label: 'Home',     icon: this.s(ICONS.home)    },
    { path: '/plants', label: 'Plants',   icon: this.s(ICONS.plants)  },
    { path: '/digest', label: 'Digest',   icon: this.s(ICONS.digest)  },
    { path: '/alerts', label: 'Alerts',   icon: this.s(ICONS.alerts)  },
  ];

  allNavItems = [
    ...this.navItems,
    { path: '/settings', label: 'Settings', icon: this.s(ICONS.settings) },
  ];
}
