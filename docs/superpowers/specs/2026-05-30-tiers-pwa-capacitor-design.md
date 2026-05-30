# Tiers, PWA, and Capacitor Wrap — Design

**Date:** 2026-05-30
**Status:** Approved for implementation

## Goal

Move GrowWatch from a single-experience web app to a tiered product shippable to the web, App Store, and Google Play from the same Angular codebase.

## Tiers

| Tier | Price (target) | What's included |
|------|----------------|-----------------|
| Free | $0 | Plant manager (add/edit/archive), action log, history, manual daily digest |
| Plus | $3–5/mo | Free + Claude-powered daily brief + 3-day weather warnings + multilingual |
| Pro  | $X + hardware | Plus + ESP32 sensor: live mood, sensor cards, light/temperature/humidity insights pages |

## Gating rules

- `tier >= 'plus'` to see: AI smart tips (plant detail + home brief), weather forecast warnings (`/forecast` route, home strip, alerts page weather entries, digest weather items), morning/evening time pickers in Settings
- `tier === 'pro'` to see: sensor cards on home, mood ring driven by live sensor, `/light` `/temperature` `/humidity` routes, sensor-derived alerts, BME688 fields in digest
- Free tier sees plant management surfaces unchanged

## Implementation strategy

- One `subscriptionTier` field on `User`. JWT payload carries it; backend resolvers re-read DB on mutations so changes propagate after re-login.
- Frontend `TierService` exposes computed booleans. Components consume them in `*ngIf` / `@if` blocks. Routes use a `tierGuard` to redirect insufficient tiers to `/upgrade`.
- Backend scheduler skips briefing generation for users below `plus` to avoid wasted Claude calls.
- Manual refresh throttled to 5 min/user; every Claude call logged to `AiUsage` for cost tracking.

## Deployment targets

- **Web**: existing Vercel deploy. PWA support added via `@angular/pwa` so users can "Install" on desktop or mobile browsers.
- **iOS App Store**: Capacitor wraps the production web build in a WKWebView shell. Built locally via Xcode, submitted via App Store Connect.
- **Google Play Store**: Capacitor + Android Studio. Built locally, submitted via Play Console.
- All three targets consume the **same** production build (`dist/frontend/browser`).

## Billing — out of scope for v1

- Stripe checkout on the web for Plus subscriptions: deferred.
- IAP via RevenueCat for iOS/Android: deferred.
- v1 ships with a manual `setSubscriptionTier` superuser mutation and an admin UI dropdown for upgrading test accounts.

## Out of scope

- Real payment integration
- Tier downgrade flows
- Trial periods
- Family / team plans
- Pro-tier hardware bundle SKU (handled outside the app)
- Push notifications (PWA + Capacitor can be added later)
