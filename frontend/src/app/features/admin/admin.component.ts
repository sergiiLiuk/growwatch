import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import dayjs from 'dayjs';
import { AdminService, AdminUser } from '../../core/services/admin.service';
import { AuthService, SubscriptionTier } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';

interface UserFormState {
  id?: string;
  email: string;
  password: string;
  role: 'user' | 'superuser';
  tier: SubscriptionTier;
}

@Component({
  selector: 'app-admin',
  imports: [FormsModule, TranslocoDirective, IconComponent],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-6" *transloco="let t">

      <div class="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 class="text-[18px] font-medium text-gray-800">{{ t('admin.title') }}</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">{{ t('admin.subtitle') }}</p>
        </div>
        <button (click)="openAddModal()"
                class="text-[13px] font-medium bg-gw-green text-white px-4 py-2 rounded-lg hover:bg-gw-green-dark transition-colors shrink-0">
          + {{ t('admin.addUser') }}
        </button>
      </div>

      @if (errorMessage()) {
        <div class="p-3 mb-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">
          {{ errorMessage() }}
        </div>
      }

      @if (loading()) {
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-6 text-center text-[13px] text-gray-400">
          {{ t('admin.loadingUsers') }}
        </div>
      } @else if (users().length === 0) {
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-6 text-center">
          <div class="text-[14px] text-gray-600">{{ t('admin.noUsersYet') }}</div>
        </div>
      } @else {

        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">
          {{ users().length }} {{ users().length === 1 ? t('admin.user') : t('admin.users') }}
        </div>

        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl overflow-hidden">
          <!-- Header -->
          <div class="hidden sm:grid grid-cols-[1.5fr_0.6fr_0.8fr_0.5fr_0.5fr_0.9fr_0.7fr] gap-3 p-3 border-b border-gray-100 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            <div>{{ t('admin.emailHeader') }}</div>
            <div>{{ t('admin.roleHeader') }}</div>
            <div>{{ t('admin.tier') }}</div>
            <div class="text-right">{{ t('admin.devicesHeader') }}</div>
            <div class="text-right">{{ t('admin.plantsHeader') }}</div>
            <div class="text-right">{{ t('admin.createdHeader') }}</div>
            <div class="text-right">{{ t('admin.actionsHeader') }}</div>
          </div>

          @for (u of users(); track u.id) {
            <div class="sm:grid sm:grid-cols-[1.5fr_0.6fr_0.8fr_0.5fr_0.5fr_0.9fr_0.7fr] gap-3 p-4 border-b border-gray-100 last:border-b-0 flex flex-col sm:items-center">
              <div class="text-[13px] font-medium text-gray-800 break-all flex items-center gap-2">
                {{ u.email }}
                @if (u.role === 'superuser') {
                  <span class="text-[10px] font-medium bg-gw-green-light text-gw-green-dark px-2 py-0.5 rounded-full">{{ t('admin.superBadge') }}</span>
                }
              </div>
              <div class="text-[12px] text-gray-500 sm:block hidden">{{ u.role }}</div>
              <div>
                <span class="sm:hidden text-[11px] text-gray-400">{{ t('admin.tier') }}: </span>
                @if (u.role === 'superuser') {
                  <span class="text-[12px] text-gray-500 px-2 py-1 inline-block" [title]="t('admin.superuserAlwaysPro')">
                    {{ t('upgrade.pro') }}
                  </span>
                } @else {
                  <select [ngModel]="u.subscriptionTier"
                          (ngModelChange)="onTierChange(u.id, $event)"
                          class="text-[12px] border-[0.5px] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gw-green transition-colors">
                    <option value="free">{{ t('upgrade.free') }}</option>
                    <option value="plus">{{ t('upgrade.plus') }}</option>
                    <option value="pro">{{ t('upgrade.pro') }}</option>
                  </select>
                }
              </div>
              <div class="text-[12px] text-gray-700 sm:text-right">
                <span class="sm:hidden text-gray-400">{{ t('admin.devicesHeader') }}: </span>{{ u.deviceCount }}
              </div>
              <div class="text-[12px] text-gray-700 sm:text-right">
                <span class="sm:hidden text-gray-400">{{ t('admin.plantsHeader') }}: </span>{{ u.plantCount }}
              </div>
              <div class="text-[11px] text-gray-400 sm:text-right">
                <span class="sm:hidden">{{ t('admin.joined') }} </span>{{ formatCreated(u.createdAt) }}
              </div>
              <div class="flex items-center gap-1 sm:justify-end">
                <button (click)="openEditModal(u)"
                        [title]="t('admin.edit')"
                        class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gw-green-dark rounded hover:bg-gray-50 transition-colors">
                  <app-icon name="pencil-square" class="w-3.5 h-3.5" />
                </button>
                @if (u.id !== currentUserId()) {
                  <button (click)="confirmDelete(u)"
                          [title]="t('admin.delete')"
                          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gw-red rounded hover:bg-red-50 transition-colors">
                    <app-icon name="trash" class="w-3.5 h-3.5" />
                  </button>
                }
              </div>
            </div>
          }
        </div>

      }
    </div>

    <!-- Add / Edit modal -->
    @if (formOpen()) {
      <div class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30" (click)="closeForm()">
        <div class="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 pb-24 sm:pb-5 max-h-[85vh] overflow-y-auto"
             (click)="$event.stopPropagation()" *transloco="let t">
          <h2 class="text-[16px] font-medium text-gray-800 mb-4">
            {{ form().id ? t('admin.editUser') : t('admin.addUser') }}
          </h2>

          <div class="flex flex-col gap-3">
            <label class="block">
              <span class="text-[11px] text-gray-400">{{ t('admin.emailHeader') }}</span>
              <input type="email" [ngModel]="form().email" (ngModelChange)="updateForm({ email: $event })"
                     class="w-full mt-1 text-[14px] text-gray-800 border-[0.5px] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gw-green transition-colors" />
            </label>

            @if (!form().id) {
              <label class="block">
                <span class="text-[11px] text-gray-400">{{ t('admin.password') }}</span>
                <input type="password" [ngModel]="form().password" (ngModelChange)="updateForm({ password: $event })"
                       autocomplete="new-password"
                       class="w-full mt-1 text-[14px] text-gray-800 border-[0.5px] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gw-green transition-colors" />
                <span class="text-[10px] text-gray-400 mt-0.5 block">{{ t('admin.passwordHint') }}</span>
              </label>
            }

            <label class="block">
              <span class="text-[11px] text-gray-400">{{ t('admin.roleHeader') }}</span>
              <select [ngModel]="form().role" (ngModelChange)="onRoleChange($event)"
                      class="w-full mt-1 text-[14px] text-gray-800 border-[0.5px] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gw-green transition-colors">
                <option value="user">user</option>
                <option value="superuser">superuser</option>
              </select>
            </label>

            <label class="block">
              <span class="text-[11px] text-gray-400">{{ t('admin.tier') }}</span>
              <select [ngModel]="form().tier" (ngModelChange)="updateForm({ tier: $event })"
                      [disabled]="form().role === 'superuser'"
                      class="w-full mt-1 text-[14px] text-gray-800 border-[0.5px] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gw-green transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                <option value="free">{{ t('upgrade.free') }}</option>
                <option value="plus">{{ t('upgrade.plus') }}</option>
                <option value="pro">{{ t('upgrade.pro') }}</option>
              </select>
              @if (form().role === 'superuser') {
                <span class="text-[10px] text-gray-400 mt-0.5 block">{{ t('admin.superuserAlwaysPro') }}</span>
              }
            </label>
          </div>

          @if (formError()) {
            <div class="mt-3 p-2 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700">
              {{ formError() }}
            </div>
          }

          <div class="flex justify-end gap-2 mt-5">
            <button (click)="closeForm()"
                    class="text-[13px] text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              {{ t('common.cancel') }}
            </button>
            <button (click)="submitForm()" [disabled]="saving()"
                    class="text-[13px] font-medium bg-gw-green text-white px-4 py-2 rounded-lg hover:bg-gw-green-dark transition-colors disabled:opacity-40">
              {{ saving() ? t('plants.saving') : t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Delete confirmation -->
    @if (deletingUser(); as d) {
      <div class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30" (click)="cancelDelete()">
        <div class="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 pb-24 sm:pb-5"
             (click)="$event.stopPropagation()" *transloco="let t">
          <h2 class="text-[15px] font-medium text-gray-800 mb-2">{{ t('admin.deleteConfirmTitle', { email: d.email }) }}</h2>
          <p class="text-[12px] text-gray-500 leading-relaxed mb-4">{{ t('admin.deleteConfirmBody') }}</p>

          @if (formError()) {
            <div class="mb-3 p-2 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700">
              {{ formError() }}
            </div>
          }

          <div class="flex justify-end gap-2">
            <button (click)="cancelDelete()"
                    class="text-[13px] text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              {{ t('common.cancel') }}
            </button>
            <button (click)="doDelete()" [disabled]="saving()"
                    class="text-[13px] font-medium bg-gw-red text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40">
              {{ saving() ? t('plants.removing') : t('admin.delete') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminComponent implements OnInit {
  private adminService = inject(AdminService);
  private auth = inject(AuthService);
  private router = inject(Router);

  users = signal<AdminUser[]>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  formOpen = signal(false);
  form = signal<UserFormState>({ email: '', password: '', role: 'user', tier: 'free' });
  formError = signal<string | null>(null);
  saving = signal(false);

  deletingUser = signal<AdminUser | null>(null);

  currentUserId = () => this.auth.user()?.userId ?? null;

  ngOnInit() {
    this.load();
  }

  back() { this.router.navigate(['/']); }

  formatCreated(iso: string): string {
    const d = dayjs(iso);
    return d.isValid() ? d.format('D MMM YYYY') : '—';
  }

  onTierChange(userId: string, tier: SubscriptionTier) {
    this.adminService.setSubscriptionTier(userId, tier).subscribe({
      next: updated => {
        this.users.update(list => list.map(u => u.id === userId ? { ...u, subscriptionTier: updated.subscriptionTier } : u));
      },
      error: err => this.errorMessage.set(err?.message ?? 'Failed to update tier'),
    });
  }

  // ── Add / Edit ─────────────────────────────────────────────────────────────

  openAddModal() {
    this.form.set({ email: '', password: '', role: 'user', tier: 'free' });
    this.formError.set(null);
    this.formOpen.set(true);
  }

  openEditModal(u: AdminUser) {
    this.form.set({ id: u.id, email: u.email, password: '', role: u.role as 'user' | 'superuser', tier: u.subscriptionTier });
    this.formError.set(null);
    this.formOpen.set(true);
  }

  updateForm(patch: Partial<UserFormState>) {
    this.form.update(s => ({ ...s, ...patch }));
  }

  onRoleChange(role: 'user' | 'superuser') {
    // Superusers are always pro — auto-snap the tier dropdown when role flips.
    this.form.update(s => ({ ...s, role, tier: role === 'superuser' ? 'pro' : s.tier }));
  }

  closeForm() {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  submitForm() {
    const f = this.form();
    if (!f.email.trim()) { this.formError.set('Email required'); return; }
    if (!f.id && (!f.password || f.password.length < 8)) {
      this.formError.set('Password must be at least 8 characters'); return;
    }
    this.saving.set(true);
    this.formError.set(null);

    const obs = f.id
      ? this.adminService.updateUser(f.id, { email: f.email.trim(), role: f.role, tier: f.tier })
      : this.adminService.createUser(f.email.trim(), f.password, f.role, f.tier);

    obs.subscribe({
      next: saved => {
        this.saving.set(false);
        this.users.update(list => {
          if (f.id) return list.map(u => u.id === f.id ? saved : u);
          return [...list, saved];
        });
        this.closeForm();
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.message ?? 'Failed to save user');
      },
    });
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  confirmDelete(u: AdminUser) {
    this.formError.set(null);
    this.deletingUser.set(u);
  }

  cancelDelete() {
    this.deletingUser.set(null);
    this.formError.set(null);
  }

  doDelete() {
    const u = this.deletingUser();
    if (!u) return;
    this.saving.set(true);
    this.formError.set(null);
    this.adminService.deleteUser(u.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.users.update(list => list.filter(x => x.id !== u.id));
        this.deletingUser.set(null);
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.message ?? 'Failed to delete user');
      },
    });
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
