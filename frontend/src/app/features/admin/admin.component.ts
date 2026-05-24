import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import dayjs from 'dayjs';
import { AdminService, AdminUser } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin',
  imports: [],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-6">

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">Admin</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">All registered users · superuser only</p>
      </div>

      @if (loading()) {
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-6 text-center text-[13px] text-gray-400">
          Loading users…
        </div>
      } @else if (errorMessage()) {
        <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">
          {{ errorMessage() }}
        </div>
      } @else if (users().length === 0) {
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-6 text-center">
          <div class="text-[14px] text-gray-600">No users yet</div>
        </div>
      } @else {

        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">
          {{ users().length }} user{{ users().length === 1 ? '' : 's' }}
        </div>

        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl overflow-hidden">
          <!-- Header -->
          <div class="hidden sm:grid grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr_1fr] gap-3 p-3 border-b border-gray-100 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            <div>Email</div>
            <div>Role</div>
            <div class="text-right">Devices</div>
            <div class="text-right">Plants</div>
            <div class="text-right">Created</div>
          </div>

          @for (u of users(); track u.id) {
            <div class="sm:grid sm:grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr_1fr] gap-3 p-4 border-b border-gray-100 last:border-b-0 flex flex-col sm:items-center">
              <!-- Mobile-stacked, desktop-grid layout -->
              <div class="text-[13px] font-medium text-gray-800 break-all flex items-center gap-2">
                {{ u.email }}
                @if (u.role === 'superuser') {
                  <span class="text-[10px] font-medium bg-gw-green-light text-gw-green-dark px-2 py-0.5 rounded-full">super</span>
                }
              </div>
              <div class="text-[12px] text-gray-500 sm:block hidden">{{ u.role }}</div>
              <div class="text-[12px] text-gray-700 sm:text-right">
                <span class="sm:hidden text-gray-400">Devices: </span>{{ u.deviceCount }}
              </div>
              <div class="text-[12px] text-gray-700 sm:text-right">
                <span class="sm:hidden text-gray-400">Plants: </span>{{ u.plantCount }}
              </div>
              <div class="text-[11px] text-gray-400 sm:text-right">
                <span class="sm:hidden">Joined </span>{{ formatCreated(u.createdAt) }}
              </div>
            </div>
          }
        </div>

      }
    </div>
  `,
})
export class AdminComponent implements OnInit {
  private adminService = inject(AdminService);
  private router = inject(Router);

  users = signal<AdminUser[]>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  back() { this.router.navigate(['/']); }

  formatCreated(iso: string): string {
    const d = dayjs(iso);
    return d.isValid() ? d.format('D MMM YYYY') : '—';
  }

  private load() {
    this.loading.set(true);
    this.adminService.allUsers().subscribe({
      next: list => {
        this.users.set(list);
        this.loading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message ?? 'Failed to load users');
        this.loading.set(false);
      },
    });
  }
}
