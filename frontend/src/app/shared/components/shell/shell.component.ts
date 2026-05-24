import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../atoms/icon.component';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <div class="flex h-dvh bg-gw-parchment overflow-hidden">

      <!-- Desktop sidebar — icon-only rail -->
      <aside class="hidden lg:flex flex-col w-16 bg-gw-parchment border-r border-gw-border shrink-0">

        <!-- Logo -->
        <div class="flex items-center justify-center py-4 shrink-0">
          <a routerLink="/" title="Home"
             class="w-8 h-8 rounded-lg bg-gw-green-light flex items-center justify-center hover:bg-gw-green-light/60 transition-colors text-gw-green-dark">
            <app-icon name="logo" class="w-4 h-4" strokeWidth="1.8" />
          </a>
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
              <app-icon [name]="item.icon" class="w-[22px] h-[22px]" />
            </a>
          }
        </nav>

        <!-- Admin (superuser only) + Settings + Logout -->
        <div class="flex flex-col items-center gap-1 px-2 pb-5">
          @if (isSuperuser()) {
            <a routerLink="/admin" title="Admin"
               routerLinkActive="" #arla="routerLinkActive"
               [class.bg-gw-green-light]="arla.isActive"
               [class.text-gw-green-dark]="arla.isActive"
               [class.text-gray-400]="!arla.isActive"
               class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gw-surface hover:text-gray-600 transition-colors">
              <app-icon name="admin" class="w-[22px] h-[22px]" />
            </a>
          }
          <a routerLink="/settings" title="Settings"
             routerLinkActive="" #srla="routerLinkActive"
             [class.bg-gw-green-light]="srla.isActive"
             [class.text-gw-green-dark]="srla.isActive"
             [class.text-gray-400]="!srla.isActive"
             class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gw-surface hover:text-gray-600 transition-colors">
            <app-icon name="settings" class="w-[22px] h-[22px]" />
          </a>
          <button (click)="logout()" title="Log out"
                  class="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gw-surface hover:text-red-500 transition-colors">
            <app-icon name="logout" class="w-[22px] h-[22px]" />
          </button>
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
              <app-icon [name]="item.icon" class="w-[22px] h-[22px]" />
            </span>
          </a>
        }
      </nav>

    </div>
  `,
})
export class ShellComponent {
  private auth = inject(AuthService);

  navItems = [
    { path: '/',       label: 'Home',     icon: 'home' as const    },
    { path: '/plants', label: 'Plants',   icon: 'plants' as const  },
    { path: '/digest', label: 'Digest',   icon: 'digest' as const  },
    { path: '/alerts', label: 'Alerts',   icon: 'alerts' as const  },
  ];

  allNavItems = [
    ...this.navItems,
    { path: '/settings', label: 'Settings', icon: 'settings' as const },
  ];

  isSuperuser = () => this.auth.user()?.role === 'superuser';

  logout() {
    this.auth.logout();
  }
}
