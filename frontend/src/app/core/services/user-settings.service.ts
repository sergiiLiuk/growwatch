import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { TranslocoService } from '@jsverse/transloco';
import { GraphQLClientService } from './graphql-client.service';
import { AuthService } from './auth.service';

/**
 * Per-user preferences persisted in a dedicated UserSettings collection.
 * Loaded on app initializer; mutations write through to the backend.
 *
 * Fields:
 *   - tempMin / tempMax  (alert thresholds, defaults 15 / 30 °C)
 *   - digestTime         ('HH:MM', default '20:00')
 *   - digestEnabled      (default true)
 *   - alertsEnabled      (default true)
 *   - locale             ('en' | 'da', default = browser language if supported, else 'en')
 *
 * `null` for any field = "use default".
 */
@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private auth = inject(AuthService);
  private transloco = inject(TranslocoService);
  private apolloClient: ApolloClient;

  readonly DEFAULT_TEMP_MIN = 15;
  readonly DEFAULT_TEMP_MAX = 30;
  readonly DEFAULT_DIGEST_TIME = '20:00';
  readonly DEFAULT_DIGEST_ENABLED = true;
  readonly DEFAULT_ALERTS_ENABLED = true;
  readonly SUPPORTED_LOCALES = ['en', 'da'] as const;

  tempMin = signal<number | null>(null);
  tempMax = signal<number | null>(null);
  digestTime = signal<string | null>(null);
  digestEnabled = signal<boolean | null>(null);
  alertsEnabled = signal<boolean | null>(null);
  locale = signal<string | null>(null);

  effectiveTempMin = computed(() => this.tempMin() ?? this.DEFAULT_TEMP_MIN);
  effectiveTempMax = computed(() => this.tempMax() ?? this.DEFAULT_TEMP_MAX);
  effectiveDigestTime = computed(() => this.digestTime() ?? this.DEFAULT_DIGEST_TIME);
  effectiveDigestEnabled = computed(() => this.digestEnabled() ?? this.DEFAULT_DIGEST_ENABLED);
  effectiveAlertsEnabled = computed(() => this.alertsEnabled() ?? this.DEFAULT_ALERTS_ENABLED);
  effectiveLocale = computed(() => {
    const stored = this.locale();
    if (stored && (this.SUPPORTED_LOCALES as readonly string[]).includes(stored)) return stored;
    const browser = (navigator.language ?? 'en').slice(0, 2).toLowerCase();
    return (this.SUPPORTED_LOCALES as readonly string[]).includes(browser) ? browser : 'en';
  });

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;

    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadFromBackend();
      } else {
        this.tempMin.set(null);
        this.tempMax.set(null);
        this.digestTime.set(null);
        this.digestEnabled.set(null);
        this.alertsEnabled.set(null);
        this.locale.set(null);
      }
    });

    // Whenever the effective locale changes, switch the transloco active lang
    effect(() => {
      const lang = this.effectiveLocale();
      if (this.transloco.getActiveLang() !== lang) {
        this.transloco.setActiveLang(lang);
      }
    });
  }

  async loadFromBackend(): Promise<void> {
    try {
      const result = await this.apolloClient.query<{
        myUserSettings: {
          tempMin: number | null;
          tempMax: number | null;
          digestTime: string | null;
          digestEnabled: boolean | null;
          alertsEnabled: boolean | null;
          locale: string | null;
        };
      }>({
        query: gql`
          query MyUserSettings {
            myUserSettings { tempMin tempMax digestTime digestEnabled alertsEnabled locale }
          }
        `,
        fetchPolicy: 'network-only',
      });
      const s = result.data?.myUserSettings;
      if (s) {
        this.tempMin.set(s.tempMin);
        this.tempMax.set(s.tempMax);
        this.digestTime.set(s.digestTime);
        this.digestEnabled.set(s.digestEnabled);
        this.alertsEnabled.set(s.alertsEnabled);
        this.locale.set(s.locale);
      }
    } catch (err) {
      console.error('Failed to load user settings:', err);
    }
  }

  setTempMin(value: number | null) { this.tempMin.set(value); return this.persist({ tempMin: value }); }
  setTempMax(value: number | null) { this.tempMax.set(value); return this.persist({ tempMax: value }); }
  setDigestTime(value: string | null) { this.digestTime.set(value); return this.persist({ digestTime: value }); }
  setDigestEnabled(value: boolean | null) { this.digestEnabled.set(value); return this.persist({ digestEnabled: value }); }
  setAlertsEnabled(value: boolean | null) { this.alertsEnabled.set(value); return this.persist({ alertsEnabled: value }); }
  setLocale(value: string | null) { this.locale.set(value); return this.persist({ locale: value }); }

  async resetTempRange(): Promise<void> {
    this.tempMin.set(null);
    this.tempMax.set(null);
    return this.persist({ tempMin: null, tempMax: null });
  }

  isTempOutOfRange(temp: number): boolean {
    return temp < this.effectiveTempMin() || temp > this.effectiveTempMax();
  }

  private async persist(args: {
    tempMin?: number | null;
    tempMax?: number | null;
    digestTime?: string | null;
    digestEnabled?: boolean | null;
    alertsEnabled?: boolean | null;
    locale?: string | null;
  }): Promise<void> {
    try {
      const result = await this.apolloClient.mutate<{
        updateUserSettings: {
          tempMin: number | null;
          tempMax: number | null;
          digestTime: string | null;
          digestEnabled: boolean | null;
          alertsEnabled: boolean | null;
          locale: string | null;
        };
      }>({
        mutation: gql`
          mutation UpdateUserSettings(
            $tempMin: Float, $tempMax: Float,
            $digestTime: String, $digestEnabled: Boolean, $alertsEnabled: Boolean,
            $locale: String
          ) {
            updateUserSettings(
              tempMin: $tempMin, tempMax: $tempMax,
              digestTime: $digestTime, digestEnabled: $digestEnabled, alertsEnabled: $alertsEnabled,
              locale: $locale
            ) { tempMin tempMax digestTime digestEnabled alertsEnabled locale }
          }
        `,
        variables: args,
      });
      // Sync local state to canonical backend response
      const s = result.data?.updateUserSettings;
      if (s) {
        this.tempMin.set(s.tempMin);
        this.tempMax.set(s.tempMax);
        this.digestTime.set(s.digestTime);
        this.digestEnabled.set(s.digestEnabled);
        this.alertsEnabled.set(s.alertsEnabled);
        this.locale.set(s.locale);
      }
    } catch (err) {
      console.error('Failed to save user settings:', err);
    }
  }
}
