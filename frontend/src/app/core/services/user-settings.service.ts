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
  readonly DEFAULT_HUMIDITY_MIN = 40;
  readonly DEFAULT_HUMIDITY_MAX = 80;
  readonly DEFAULT_FROST_THRESHOLD = 2;
  readonly DEFAULT_HEAT_THRESHOLD = 32;
  readonly DEFAULT_WIND_THRESHOLD = 14;  // m/s — roughly former 50 km/h
  readonly DEFAULT_DIGEST_TIME = '20:00';
  readonly DEFAULT_MORNING_TIP_TIME = '07:00';
  readonly DEFAULT_EVENING_TIP_TIME = '20:00';
  readonly DEFAULT_SMART_TIPS_ENABLED = true;
  readonly DEFAULT_DIGEST_ENABLED = true;
  readonly DEFAULT_ALERTS_ENABLED = true;
  readonly SUPPORTED_LOCALES = ['en', 'da'] as const;

  name = signal<string | null>(null);
  tempMin = signal<number | null>(null);
  tempMax = signal<number | null>(null);
  humidityMin = signal<number | null>(null);
  humidityMax = signal<number | null>(null);
  frostThreshold = signal<number | null>(null);
  heatThreshold = signal<number | null>(null);
  windThreshold = signal<number | null>(null);
  digestTime = signal<string | null>(null);
  digestEnabled = signal<boolean | null>(null);
  alertsEnabled = signal<boolean | null>(null);
  locale = signal<string | null>(null);
  smartTipsEnabled = signal<boolean | null>(null);
  morningTipTime = signal<string | null>(null);
  eveningTipTime = signal<string | null>(null);
  location = signal<{ lat: number; lng: number; city?: string | null } | null>(null);

  effectiveTempMin = computed(() => this.tempMin() ?? this.DEFAULT_TEMP_MIN);
  effectiveTempMax = computed(() => this.tempMax() ?? this.DEFAULT_TEMP_MAX);
  effectiveHumidityMin = computed(() => this.humidityMin() ?? this.DEFAULT_HUMIDITY_MIN);
  effectiveHumidityMax = computed(() => this.humidityMax() ?? this.DEFAULT_HUMIDITY_MAX);
  effectiveFrostThreshold = computed(() => this.frostThreshold() ?? this.DEFAULT_FROST_THRESHOLD);
  effectiveHeatThreshold = computed(() => this.heatThreshold() ?? this.DEFAULT_HEAT_THRESHOLD);
  effectiveWindThreshold = computed(() => this.windThreshold() ?? this.DEFAULT_WIND_THRESHOLD);
  effectiveDigestTime = computed(() => this.digestTime() ?? this.DEFAULT_DIGEST_TIME);
  effectiveMorningTipTime = computed(() => this.morningTipTime() ?? this.DEFAULT_MORNING_TIP_TIME);
  effectiveEveningTipTime = computed(() => this.eveningTipTime() ?? this.DEFAULT_EVENING_TIP_TIME);
  effectiveSmartTipsEnabled = computed(() => this.smartTipsEnabled() ?? this.DEFAULT_SMART_TIPS_ENABLED);
  effectiveDigestEnabled = computed(() => this.digestEnabled() ?? this.DEFAULT_DIGEST_ENABLED);
  effectiveAlertsEnabled = computed(() => this.alertsEnabled() ?? this.DEFAULT_ALERTS_ENABLED);
  effectiveLocale = computed(() => {
    const stored = this.locale();
    if (stored && (this.SUPPORTED_LOCALES as readonly string[]).includes(stored)) return stored;
    const browser = (navigator.language ?? '').slice(0, 2).toLowerCase();
    return (this.SUPPORTED_LOCALES as readonly string[]).includes(browser) ? browser : 'da';
  });

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;

    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadFromBackend();
      } else {
        this.name.set(null);
        this.tempMin.set(null);
        this.tempMax.set(null);
        this.humidityMin.set(null);
        this.humidityMax.set(null);
        this.frostThreshold.set(null);
        this.heatThreshold.set(null);
        this.windThreshold.set(null);
        this.smartTipsEnabled.set(null);
        this.morningTipTime.set(null);
        this.eveningTipTime.set(null);
        this.location.set(null);
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
          name: string | null;
          tempMin: number | null;
          tempMax: number | null;
          humidityMin: number | null;
          humidityMax: number | null;
          frostThreshold: number | null;
          heatThreshold: number | null;
          windThreshold: number | null;
          digestTime: string | null;
          digestEnabled: boolean | null;
          alertsEnabled: boolean | null;
          locale: string | null;
          smartTipsEnabled: boolean | null;
          morningTipTime: string | null;
          eveningTipTime: string | null;
          location: { lat: number; lng: number; city: string | null } | null;
        };
      }>({
        query: gql`
          query MyUserSettings {
            myUserSettings {
              name tempMin tempMax humidityMin humidityMax
              frostThreshold heatThreshold windThreshold
              digestTime digestEnabled alertsEnabled locale
              smartTipsEnabled morningTipTime eveningTipTime
              location { lat lng city }
            }
          }
        `,
        fetchPolicy: 'network-only',
      });
      const s = result.data?.myUserSettings;
      if (s) {
        this.name.set(s.name);
        this.tempMin.set(s.tempMin);
        this.tempMax.set(s.tempMax);
        this.humidityMin.set(s.humidityMin);
        this.humidityMax.set(s.humidityMax);
        this.frostThreshold.set(s.frostThreshold);
        this.heatThreshold.set(s.heatThreshold);
        this.windThreshold.set(s.windThreshold);
        this.digestTime.set(s.digestTime);
        this.digestEnabled.set(s.digestEnabled);
        this.alertsEnabled.set(s.alertsEnabled);
        this.locale.set(s.locale);
        this.smartTipsEnabled.set(s.smartTipsEnabled);
        this.morningTipTime.set(s.morningTipTime);
        this.eveningTipTime.set(s.eveningTipTime);
        this.location.set(s.location);
      }
    } catch (err) {
      console.error('Failed to load user settings:', err);
    }
  }

  setName(value: string | null) { this.name.set(value); return this.persist({ name: value }); }
  setSmartTipsEnabled(value: boolean | null) { this.smartTipsEnabled.set(value); return this.persist({ smartTipsEnabled: value }); }
  setMorningTipTime(value: string | null) { this.morningTipTime.set(value); return this.persist({ morningTipTime: value }); }
  setEveningTipTime(value: string | null) { this.eveningTipTime.set(value); return this.persist({ eveningTipTime: value }); }
  setLocation(value: { lat: number; lng: number; city?: string | null } | null) { this.location.set(value); return this.persist({ location: value }); }

  setTempMin(value: number | null) { this.tempMin.set(value); return this.persist({ tempMin: value }); }
  setTempMax(value: number | null) { this.tempMax.set(value); return this.persist({ tempMax: value }); }
  setHumidityMin(value: number | null) { this.humidityMin.set(value); return this.persist({ humidityMin: value }); }
  setHumidityMax(value: number | null) { this.humidityMax.set(value); return this.persist({ humidityMax: value }); }
  setFrostThreshold(value: number | null) { this.frostThreshold.set(value); return this.persist({ frostThreshold: value }); }
  setHeatThreshold(value: number | null) { this.heatThreshold.set(value); return this.persist({ heatThreshold: value }); }
  setWindThreshold(value: number | null) { this.windThreshold.set(value); return this.persist({ windThreshold: value }); }
  setDigestTime(value: string | null) { this.digestTime.set(value); return this.persist({ digestTime: value }); }
  setDigestEnabled(value: boolean | null) { this.digestEnabled.set(value); return this.persist({ digestEnabled: value }); }
  setAlertsEnabled(value: boolean | null) { this.alertsEnabled.set(value); return this.persist({ alertsEnabled: value }); }
  setLocale(value: string | null) { this.locale.set(value); return this.persist({ locale: value }); }

  async resetTempRange(): Promise<void> {
    this.tempMin.set(null);
    this.tempMax.set(null);
    return this.persist({ tempMin: null, tempMax: null });
  }

  async resetHumidityRange(): Promise<void> {
    this.humidityMin.set(null);
    this.humidityMax.set(null);
    return this.persist({ humidityMin: null, humidityMax: null });
  }

  async resetWeatherThresholds(): Promise<void> {
    this.frostThreshold.set(null);
    this.heatThreshold.set(null);
    this.windThreshold.set(null);
    return this.persist({ frostThreshold: null, heatThreshold: null, windThreshold: null });
  }

  isTempOutOfRange(temp: number): boolean {
    return temp < this.effectiveTempMin() || temp > this.effectiveTempMax();
  }

  private async persist(args: {
    name?: string | null;
    tempMin?: number | null;
    tempMax?: number | null;
    humidityMin?: number | null;
    humidityMax?: number | null;
    frostThreshold?: number | null;
    heatThreshold?: number | null;
    windThreshold?: number | null;
    digestTime?: string | null;
    digestEnabled?: boolean | null;
    alertsEnabled?: boolean | null;
    locale?: string | null;
    smartTipsEnabled?: boolean | null;
    morningTipTime?: string | null;
    eveningTipTime?: string | null;
    location?: { lat: number; lng: number; city?: string | null } | null;
  }): Promise<void> {
    try {
      const result = await this.apolloClient.mutate<{
        updateUserSettings: {
          name: string | null;
          tempMin: number | null;
          tempMax: number | null;
          humidityMin: number | null;
          humidityMax: number | null;
          frostThreshold: number | null;
          heatThreshold: number | null;
          windThreshold: number | null;
          digestTime: string | null;
          digestEnabled: boolean | null;
          alertsEnabled: boolean | null;
          locale: string | null;
          smartTipsEnabled: boolean | null;
          morningTipTime: string | null;
          eveningTipTime: string | null;
          location: { lat: number; lng: number; city: string | null } | null;
        };
      }>({
        mutation: gql`
          mutation UpdateUserSettings(
            $name: String,
            $tempMin: Float, $tempMax: Float,
            $humidityMin: Float, $humidityMax: Float,
            $frostThreshold: Float, $heatThreshold: Float, $windThreshold: Float,
            $digestTime: String, $digestEnabled: Boolean, $alertsEnabled: Boolean,
            $locale: String,
            $smartTipsEnabled: Boolean, $morningTipTime: String, $eveningTipTime: String,
            $location: UserLocationInput
          ) {
            updateUserSettings(
              name: $name,
              tempMin: $tempMin, tempMax: $tempMax,
              humidityMin: $humidityMin, humidityMax: $humidityMax,
              frostThreshold: $frostThreshold, heatThreshold: $heatThreshold, windThreshold: $windThreshold,
              digestTime: $digestTime, digestEnabled: $digestEnabled, alertsEnabled: $alertsEnabled,
              locale: $locale,
              smartTipsEnabled: $smartTipsEnabled, morningTipTime: $morningTipTime, eveningTipTime: $eveningTipTime,
              location: $location
            ) {
              name tempMin tempMax humidityMin humidityMax
              frostThreshold heatThreshold windThreshold
              digestTime digestEnabled alertsEnabled locale
              smartTipsEnabled morningTipTime eveningTipTime
              location { lat lng city }
            }
          }
        `,
        variables: args,
      });
      // Sync local state to canonical backend response
      const s = result.data?.updateUserSettings;
      if (s) {
        this.name.set(s.name);
        this.tempMin.set(s.tempMin);
        this.tempMax.set(s.tempMax);
        this.humidityMin.set(s.humidityMin);
        this.humidityMax.set(s.humidityMax);
        this.frostThreshold.set(s.frostThreshold);
        this.heatThreshold.set(s.heatThreshold);
        this.windThreshold.set(s.windThreshold);
        this.digestTime.set(s.digestTime);
        this.digestEnabled.set(s.digestEnabled);
        this.alertsEnabled.set(s.alertsEnabled);
        this.locale.set(s.locale);
        this.smartTipsEnabled.set(s.smartTipsEnabled);
        this.morningTipTime.set(s.morningTipTime);
        this.eveningTipTime.set(s.eveningTipTime);
        this.location.set(s.location);
      }
    } catch (err) {
      console.error('Failed to save user settings:', err);
    }
  }
}
