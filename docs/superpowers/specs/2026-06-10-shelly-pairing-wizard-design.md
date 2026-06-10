# Shelly H&T In-App Pairing Wizard — Design

## Context

Phase 1 (shipped) gives users a webhook URL on the `Settings → Shelly H&T sensors` page and a written guide telling them to install the **Shelly Smart Control** mobile app, adopt the device, then paste the URL into the app's webhook configuration. Sending users off to a third-party app for setup is friction and hurts the GrowWatch brand experience.

This design replaces that flow with an in-app wizard that walks users through the entire pairing — including Wi-Fi onboarding — without leaving GrowWatch. The user still has to touch the Shelly's own web UI briefly (twice: to set home Wi-Fi credentials, and to add the webhook) because the device's hotspot is the only on-ramp before it reaches the internet. But the wizard tells them exactly what to do at each step and detects success live.

## Goal

A user with a brand-new Shelly H&T Gen3 can pair it to GrowWatch end-to-end through a single in-app flow, without installing any third-party app.

## Out of scope

- Real screenshots of the Shelly's built-in web UI (text + emoji descriptions for now; screenshots are a follow-up once the firmware UI stabilises across versions).
- Per-platform (iOS vs Android) Wi-Fi switching instructions — generic text covers both.
- Multi-device pairing in one flow — the one-device-per-account limit stays.
- WebSocket-based first-reading detection — polling is sufficient for the 5-second wait the user is already in.

## Architecture

### Six-step wizard

| # | Title | Purpose | Primary CTA |
|---|---|---|---|
| 1 | Welcome | Set expectations; insert battery | Next |
| 2 | Join Shelly's Wi-Fi | Switch phone to `ShellyHTG3-…` hotspot | I'm connected |
| 3 | Set Wi-Fi on Shelly | Browser to `http://192.168.33.1` → enter home Wi-Fi | Wi-Fi configured |
| 4 | Name your device | Display name input; creates `ShellyDevice` | Next |
| 5 | Add webhook on Shelly | Copy webhook URL + instructions for Shelly's web UI | I added the webhook |
| 6 | Test connection | Poll `myShellyDevices` every 5s until first reading | Done (success only) |

Steps 1–3 are pure instructions. Step 4 is the first time anything is persisted: the `addShellyDevice` mutation runs on Next, and a `ShellyDevice` row appears in the DB. Step 5 displays the resulting `webhookUrl`. Step 6 polls until `lastSeenAt` flips to non-null.

### Resume behaviour

The wizard can be closed mid-flow. When the user returns to `Settings → Shelly H&T sensors`:

- **No device** → Add Shelly button launches the wizard from step 1.
- **One device, `lastSeenAt == null`** → button label switches to "Continue pairing" and launches the wizard at step 5, populated with the existing device's webhook URL.
- **One device, `lastSeenAt != null`** → no Add button (the existing one-device-per-account rule).

### Close confirmation

Closing the wizard mid-flow shows a confirm dialog: *"Cancel pairing? Your progress is saved — you can finish later from Settings."* If they confirm, they return to the device list. The orphaned device (if step 4 was passed) shows up with "Never seen" and can be removed manually, or resumed via the "Continue pairing" entry point.

### Chrome / layout

Full-screen takeover, mobile-first:

- **Top bar:** `← Back` button (left, hidden on step 1) · step indicator (six dots — filled for completed, ring for current) · `✕ Close` button (right).
- **Body:** scrollable. Step heading (large), body text, any input or copy-able URL.
- **Bottom:** sticky primary CTA. Disabled until step validation passes (step 4 needs non-empty name; step 6 needs `lastSeenAt != null`).

Step 6 has a slightly different bottom: a status row above the CTA ("Waiting for first reading…" with a spinner, or "Got it! 21.5°C · 48%" once detected). The CTA stays disabled until detection.

### Detection mechanism (step 6)

A simple poll: every 5 seconds, refetch `myShellyDevices` with `fetchPolicy: 'network-only'`. Find the current device by id, check `lastSeenAt`. Stop polling when non-null or when the user closes the wizard. Display the device's `lastBatteryPercent` if set. The live temperature/humidity values come from the home page's existing in-memory sensor store via a one-shot query to `latestSensorData` once `lastSeenAt` becomes non-null.

This adds ~12 round-trips per minute *only* while step 6 is active. Negligible.

### Files

- **Create:** `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — full-screen wizard owning step state, navigation, and the device-creation mutation. Receives the existing device (if any) as input for resume.
- **Modify:** `frontend/src/app/features/settings/shelly-setup.component.ts` — adds a `wizardOpen` signal. While true, renders `<app-shelly-pairing-wizard>` in place of the device list. Add/Continue button label and click behaviour adapt to the resume logic above.
- **Modify:** `frontend/public/i18n/en.json` and `frontend/public/i18n/da.json` — new `shelly.wizard.*` block (~20 keys: per-step heading + body + CTA + close-confirm + success messages).

No backend changes. The wizard reuses existing GraphQL: `addShellyDevice`, `myShellyDevices`, `removeShellyDevice`.

## i18n

New keys under `shelly.wizard.*`:

```
step1Title, step1Body
step2Title, step2Body
step3Title, step3Body
step4Title, step4Body, step4NamePlaceholder
step5Title, step5Body, step5UrlLabel, step5Instructions
step6Title, step6BodyWaiting, step6BodyButtonHint, step6BodySuccess
next, back, close, done, continue
closeConfirmTitle, closeConfirmBody, closeConfirmCancel, closeConfirmDiscard
```

## Success criteria

- User opens Settings → Shelly H&T sensors → Add Shelly → completes 6 steps → sees the live temperature/humidity reading on the wizard's success screen → tapping Done returns to the device list which now shows "Just now" + battery %.
- Closing the wizard between steps 4 and 6 leaves a device with `lastSeenAt == null` in the DB. Re-opening Settings → Shelly H&T sensors shows "Continue pairing", which launches the wizard at step 5 with that device.
- Step 6 detects the first webhook within ≤5 seconds.
- No third-party Shelly app is required for pairing.
- All wizard strings render in both `en.json` and `da.json`.

## Risks

- **Step 3 and step 5 still require the user to type into Shelly's own web UI.** This is unavoidable — there's no IP-reachable API on a freshly-powered Shelly. The wizard's job is to make those two visits as short and unambiguous as possible.
- **Shelly's web UI menu labels vary by firmware version.** "Webhooks" vs "Outbound webhooks" vs "URL Actions". Step 5 body must list the likely paths the user might see and tell them all of them mean the same thing.
- **The orphaned-device case.** A user who completes step 4 then walks away never returns gets a "ghost" device in their DB. Mitigation: the resume flow handles the common case (they come back). Cleanup of true ghosts (>30 days with `lastSeenAt == null`) is out of scope here — they can be removed manually, and the one-device-per-account rule prevents accumulation.
- **`latestSensorData` shows the most recent reading regardless of source.** If a user has both ESP32 and a Shelly mid-pairing, the success-screen reading could be from the ESP32, not the Shelly. Phase 2 (UI cleanup) addresses multi-source; for now, accept the edge case — coincident pairing while ESP32 is live is rare, and the side effect (showing an ESP32 reading on the wizard's success screen) is mild.
