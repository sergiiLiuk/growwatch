import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'growwatch-token';
const TIER_KEY = 'growwatch-tier';
const DEMO_KEY = 'growwatch-demo';

export type SubscriptionTier = 'free' | 'plus' | 'pro';

export interface User {
  email: string;
  userId: string;
  role: 'user' | 'superuser';
  subscriptionTier: SubscriptionTier;
  isDemo: boolean;
}

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  exp: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private _user = signal<User | null>(null);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const payload = this.decodeToken(token);
        if (payload.exp * 1000 > Date.now()) {
          const tier = (localStorage.getItem(TIER_KEY) as SubscriptionTier | null) ?? 'free';
          const isDemo = localStorage.getItem(DEMO_KEY) === '1';
          this._user.set({
            email: payload.email,
            role: payload.role as 'user' | 'superuser',
            userId: payload.userId,
            subscriptionTier: tier,
            isDemo,
          });
          // Refresh from server so tier changes from another session apply
          this.refreshMe().catch(() => {/* non-fatal */});
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(TIER_KEY);
          localStorage.removeItem(DEMO_KEY);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TIER_KEY);
        localStorage.removeItem(DEMO_KEY);
      }
    }
  }

  async login(email: string, password: string): Promise<void> {
    const res = await fetch(environment.backendHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) { token email role userId subscriptionTier isDemo }
        }`,
        variables: { email, password },
      }),
    });

    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const { token, email: userEmail, role, userId, subscriptionTier, isDemo } = json.data.login;
    const tier: SubscriptionTier = subscriptionTier ?? 'free';
    const demo = !!isDemo;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TIER_KEY, tier);
    localStorage.setItem(DEMO_KEY, demo ? '1' : '0');
    this._user.set({ email: userEmail, role, userId, subscriptionTier: tier, isDemo: demo });
  }

  async refreshMe(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch(environment.backendHttpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `query Me { me { email role userId subscriptionTier isDemo } }`,
        }),
      });
      const json = await res.json();
      const m = json.data?.me;
      if (!m) return;
      const tier: SubscriptionTier = m.subscriptionTier ?? 'free';
      const demo = !!m.isDemo;
      localStorage.setItem(TIER_KEY, tier);
      localStorage.setItem(DEMO_KEY, demo ? '1' : '0');
      this._user.set({ email: m.email, role: m.role, userId: m.userId, subscriptionTier: tier, isDemo: demo });
    } catch {
      // non-fatal
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TIER_KEY);
    localStorage.removeItem(DEMO_KEY);
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
