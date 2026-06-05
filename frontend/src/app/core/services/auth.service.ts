import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { STORAGE_KEYS } from '../constants/storage-keys';

const TOKEN_KEY = STORAGE_KEYS.TOKEN;
const TIER_KEY = STORAGE_KEYS.TIER;
const ROLE_KEY = STORAGE_KEYS.ROLE;

export type SubscriptionTier = 'free' | 'plus' | 'pro';
export type UserRole = 'user' | 'superuser' | 'demo';

export interface User {
  email: string;
  userId: string;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
  emailVerified: boolean;
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
          // JWT role doesn't include 'demo' yet (legacy tokens), so trust ROLE_KEY when present.
          const storedRole = (localStorage.getItem(ROLE_KEY) as UserRole | null);
          const role: UserRole = storedRole ?? (payload.role as UserRole);
          this._user.set({
            email: payload.email,
            role,
            userId: payload.userId,
            subscriptionTier: tier,
            // JWT doesn't carry emailVerified; assume true and let refreshMe() correct it.
            emailVerified: true,
          });
          // Refresh from server so role/tier changes from another session apply
          this.refreshMe().catch(() => {/* non-fatal */});
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(TIER_KEY);
          localStorage.removeItem(ROLE_KEY);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TIER_KEY);
        localStorage.removeItem(ROLE_KEY);
      }
    }
  }

  async login(email: string, password: string): Promise<void> {
    await this.authMutation(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) { token email role userId subscriptionTier emailVerified }
      }`,
      { email, password },
      'login',
    );
  }

  async register(email: string, password: string): Promise<void> {
    await this.authMutation(
      `mutation Register($email: String!, $password: String!) {
        register(email: $email, password: $password) { token email role userId subscriptionTier emailVerified }
      }`,
      { email, password },
      'register',
    );
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.plainMutation(
      `mutation RequestPasswordReset($email: String!) { requestPasswordReset(email: $email) }`,
      { email },
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.plainMutation(
      `mutation ResetPassword($token: String!, $newPassword: String!) {
        resetPassword(token: $token, newPassword: $newPassword)
      }`,
      { token, newPassword },
    );
  }

  async requestEmailVerification(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not signed in');
    const res = await fetch(environment.backendHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: `mutation RequestEmailVerification { requestEmailVerification }`,
      }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
  }

  /** Unauthenticated — used by the login screen when the user gets
   *  'auth.emailNotVerified' and needs the verification email re-sent. */
  async resendVerificationByEmail(email: string): Promise<void> {
    await this.plainMutation(
      `mutation ResendVerificationEmail($email: String!) { resendVerificationEmail(email: $email) }`,
      { email },
    );
  }

  async verifyEmail(token: string): Promise<void> {
    await this.plainMutation(
      `mutation VerifyEmail($token: String!) { verifyEmail(token: $token) }`,
      { token },
    );
    // Refresh the local user so emailVerified flips to true immediately.
    await this.refreshMe();
  }

  /** Permanently delete the signed-in user's account and all related data. */
  async deleteAccount(password: string): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not signed in');
    const res = await fetch(environment.backendHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: `mutation DeleteMyAccount($password: String!) { deleteMyAccount(password: $password) }`,
        variables: { password },
      }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    // Wipe local state — same as logout — and bounce to login.
    this.logout();
  }

  private async plainMutation(query: string, variables: Record<string, unknown>): Promise<void> {
    const res = await fetch(environment.backendHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
  }

  private async authMutation(query: string, variables: Record<string, unknown>, field: 'login' | 'register'): Promise<void> {
    const res = await fetch(environment.backendHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const { token, email: userEmail, role, userId, subscriptionTier, emailVerified } = json.data[field];
    const tier: SubscriptionTier = subscriptionTier ?? 'free';
    const userRole: UserRole = (role as UserRole) ?? 'user';
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TIER_KEY, tier);
    localStorage.setItem(ROLE_KEY, userRole);
    this._user.set({ email: userEmail, role: userRole, userId, subscriptionTier: tier, emailVerified: !!emailVerified });
  }

  async refreshMe(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch(environment.backendHttpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `query Me { me { email role userId subscriptionTier emailVerified } }`,
        }),
      });
      const json = await res.json();
      const m = json.data?.me;
      if (!m) return;
      const tier: SubscriptionTier = m.subscriptionTier ?? 'free';
      const userRole: UserRole = (m.role as UserRole) ?? 'user';
      localStorage.setItem(TIER_KEY, tier);
      localStorage.setItem(ROLE_KEY, userRole);
      this._user.set({ email: m.email, role: userRole, userId: m.userId, subscriptionTier: tier, emailVerified: !!m.emailVerified });
    } catch {
      // non-fatal
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TIER_KEY);
    localStorage.removeItem(ROLE_KEY);
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
