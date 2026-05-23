import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { GraphQLClientService } from './graphql-client.service';
import { AuthService } from './auth.service';

/**
 * Per-user preferences (currently temp min/max) persisted in a dedicated
 * UserSettings collection on the backend. No localStorage involvement.
 *
 * Lifecycle:
 *   - signals start as null (no data known yet)
 *   - effect() watches auth state: on login → loadFromBackend(), on logout → clear
 *   - effectiveTempMin/Max apply defaults when the underlying value is null
 */
@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private auth = inject(AuthService);
  private apolloClient: ApolloClient;

  readonly DEFAULT_TEMP_MIN = 15;
  readonly DEFAULT_TEMP_MAX = 30;

  tempMin = signal<number | null>(null);
  tempMax = signal<number | null>(null);

  effectiveTempMin = computed(() => this.tempMin() ?? this.DEFAULT_TEMP_MIN);
  effectiveTempMax = computed(() => this.tempMax() ?? this.DEFAULT_TEMP_MAX);

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;

    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadFromBackend();
      } else {
        this.tempMin.set(null);
        this.tempMax.set(null);
      }
    });
  }

  async loadFromBackend(): Promise<void> {
    try {
      const result = await this.apolloClient.query<{
        myUserSettings: { tempMin: number | null; tempMax: number | null };
      }>({
        query: gql`query MyUserSettings { myUserSettings { tempMin tempMax } }`,
        fetchPolicy: 'network-only',
      });
      const s = result.data?.myUserSettings;
      if (s) {
        this.tempMin.set(s.tempMin);
        this.tempMax.set(s.tempMax);
      }
    } catch (err) {
      console.error('Failed to load user settings:', err);
    }
  }

  async setTempMin(value: number | null): Promise<void> {
    this.tempMin.set(value);
    await this.persist({ tempMin: value });
  }

  async setTempMax(value: number | null): Promise<void> {
    this.tempMax.set(value);
    await this.persist({ tempMax: value });
  }

  async resetTempRange(): Promise<void> {
    this.tempMin.set(null);
    this.tempMax.set(null);
    await this.persist({ tempMin: null, tempMax: null });
  }

  private async persist(args: { tempMin?: number | null; tempMax?: number | null }): Promise<void> {
    try {
      const result = await this.apolloClient.mutate<{
        updateUserSettings: { tempMin: number | null; tempMax: number | null };
      }>({
        mutation: gql`
          mutation UpdateUserSettings($tempMin: Float, $tempMax: Float) {
            updateUserSettings(tempMin: $tempMin, tempMax: $tempMax) { tempMin tempMax }
          }
        `,
        variables: args,
      });
      // Sync local state to whatever the backend actually persisted.
      // This is the canonical source of truth — eliminates drift if a partial
      // save leaves one field at a previously-stored value the UI didn't know about.
      const s = result.data?.updateUserSettings;
      if (s) {
        this.tempMin.set(s.tempMin);
        this.tempMax.set(s.tempMax);
      }
    } catch (err) {
      console.error('Failed to save user settings:', err);
    }
  }

  isTempOutOfRange(temp: number): boolean {
    return temp < this.effectiveTempMin() || temp > this.effectiveTempMax();
  }
}
