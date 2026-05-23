import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'growwatch-token';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  exp: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private _user = signal<{ email: string; role: string; userId: string } | null>(null);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const payload = this.decodeToken(token);
        if (payload.exp * 1000 > Date.now()) {
          this._user.set({ email: payload.email, role: payload.role, userId: payload.userId });
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }

  async login(email: string, password: string): Promise<void> {
    // Uses fetch (not Apollo) so login can run before the auth interceptor has anything to attach.
    const res = await fetch(environment.backendHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) { token email role userId }
        }`,
        variables: { email, password },
      }),
    });

    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const { token, email: userEmail, role, userId } = json.data.login;
    localStorage.setItem(TOKEN_KEY, token);
    this._user.set({ email: userEmail, role, userId });
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getUserId(): string | null {
    return this._user()?.userId ?? null;
  }

  private decodeToken(token: string): TokenPayload {
    return JSON.parse(atob(token.split('.')[1]));
  }
}
