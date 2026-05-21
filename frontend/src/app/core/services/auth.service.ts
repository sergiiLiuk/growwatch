import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY = 'growwatch-user';

interface StoredUser {
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<StoredUser | null>(this.readStoredUser());

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  async login(email: string, _password: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const user: StoredUser = { email };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    this._user.set(user);
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._user.set(null);
  }

  private readStoredUser(): StoredUser | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
