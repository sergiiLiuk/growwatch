# Shelly Pairing Wizard — User-Friendly MQTT Setup (Design)

**Date:** 2026-06-17
**Status:** Approved for planning
**Area:** Frontend only — `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` + i18n

## Problem

The Shelly H&T Gen3 MQTT setup is too technical for the target user (a
non-technical greenhouse owner doing self-serve pairing). Two concrete pains
surfaced during a real setup:

1. **Wrong step order drops the hotspot mid-config.** The wizard currently tells
   the user to set the Shelly's home Wi-Fi *before* MQTT. Saving Wi-Fi makes the
   Shelly join the home network and shut down its `192.168.33.1` setup hotspot,
   which kicks the phone off it — *before* the user finished the MQTT fields.
   The MQTT settings never get saved and the hotspot is gone.
2. **One dense screen of jargon.** Step 4 is a single wall of instructions
   covering Wi-Fi, four copy-paste values, and three toggles, using Shelly's raw
   field names ("RPC status notifications over MQTT", "Custom MQTT prefix").

The genuinely technical part lives in **Shelly's own firmware web UI** at
`192.168.33.1`, which we do not control and cannot restyle. So the improvement is
entirely in **how GrowWatch's wizard guides the user** into that panel.

## Non-goals

- No automation of the Shelly config (e.g. via the device's local `/rpc` API).
  Blocked for a web app: no internet on the hotspot, and browsers block
  HTTPS→HTTP calls to the device. Revisit only if a native/PWA companion exists.
- No pre-provisioning / installer flow. The user is self-serve.
- No backend changes. The GraphQL `ShellyDevice` already returns
  `mqttBrokerUrl`, `mqttUsername`, `mqttPassword`, `mqttPrefix`.

## Approach

Keep the copy-paste-into-Shelly model, but make it nearly foolproof by:

1. **Reordering** the Shelly configuration so home Wi-Fi is the *last* action.
2. **Breaking the single config screen into guided micro-steps** — one or two
   actions per screen, each carrying only the copy button(s) it needs.
3. **Reframing the four values** as "three shared (same for everyone) + one
   personal code," with each value labeled by the exact Shelly box it goes into.
4. Leaving **clearly-marked screenshot slots** on the device-config screens to
   drop annotated images into later (no images in this iteration).

## New wizard step sequence

The wizard grows from 6 to 9 steps. Network needs are called out because steps
4–7 happen while the phone is on the Shelly hotspot (no internet).

| # | Screen | Network? | Notes |
|---|--------|----------|-------|
| 1 | Power on the Shelly | no | unchanged |
| 2 | Name your sensor | **yes** | creates device + fetches the four values |
| 3 | Join the Shelly's Wi-Fi hotspot | no | unchanged copy, new step number |
| 4 | Open `192.168.33.1` → Settings → MQTT; turn **Enable MQTT** on | no | screenshot slot |
| 5 | Paste the **three shared values** — Server, Username, Password | no | 3 copy cards, each labeled with its Shelly box; screenshot slot |
| 6 | Paste your **personal code** into *Custom MQTT prefix*; flip the two *status over MQTT* switches on; tap **Save** | no | 1 copy card + toggle reminder; screenshot slot |
| 7 | Set home Wi-Fi **last** → Settings → Wi-Fi → your network → Save | no | "Shelly Wi-Fi will vanish — that's success" + recovery note; screenshot slot |
| 8 | Reconnect your phone to home Wi-Fi | no | unchanged copy, new step number |
| 9 | Test — wait for first reading | **yes** | unchanged polling/detection logic |

### Why offline steps work

The wizard is an already-loaded Angular SPA. Advancing steps is a client-side
signal update — no network. The four values are fetched at step 2 (device
creation) and held in the `device` signal, so the copy buttons on steps 5–7
work without internet. Only step 2 (mutation) and step 9 (polling
`shelly.list()`) require the network — both happen while on home Wi-Fi. Clipboard
copies on steps 5–7 happen entirely on the hotspot (the user tab-switches between
the GrowWatch SPA and the `192.168.33.1` tab on the same network), so nothing is
lost.

## Component changes

File: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`

- **`StepNum`** widens from `1..6` to `1..9`.
- **`stepDots`** array → replaced by a compact **"Step {{n}} of 9"** label to
  avoid crowding 9 dots on mobile.
- **`advance()`** — the terminal step becomes 9 (was 6): emit `completed` on 9;
  start polling when entering 9 (was the 5→6 transition). Plain "next" increments
  otherwise.
- **`canAdvance()`** — name required on step 2 (unchanged); detection required on
  step 9 (was 6); all other steps freely advance.
- **`canGoBack()`** — allow back on steps 2–8 (was 2..5); never on 1 or the final
  detection step 9.
- **`ctaLabel()`** — "Done" on step 9, "Next" otherwise.
- **Resume effect** — an existing (already-created) device resumes at step 4
  (the first device-config screen), not the old step 3.
- **Template `@switch`** — split the old `@case (4)` into `@case (4..7)`; renumber
  old 5→8 and old 6→9. Existing `copyValue(value, field)` / `copiedField()` reused;
  step 5 uses three distinct field keys (`server`, `user`, `pass`), step 6 uses
  `prefix`.
- **Screenshot slots** — each of steps 4–7 includes a commented, clearly-labeled
  placeholder block (e.g. a bordered box with alt text) ready for a real image.

## i18n

Update **both** `frontend/public/i18n/en.json` and `da.json` under `shelly.wizard`:

- Renumber/replace `step3Title`/`step3Body` … `step6*` to the new 1–9 scheme.
- New keys for steps 4–7 (titles + bodies), the "three shared values" vs
  "personal code" framing, per-box labels (already have `brokerUrlLabel`,
  `usernameLabel`, `passwordLabel`, `prefixLabel` — reuse), the toggle reminder,
  the "Wi-Fi will vanish / that's success" line, and the recovery note.
- A `stepCounter` key like `"Step {{n}} of {{total}}"`.
- Remove any now-orphaned keys.

Danish strings mirror English (per project i18n convention).

## Error handling / edge cases

- **Hotspot lost before finishing** (the reported failure) — step 7 includes a
  recovery note: reach the Shelly via the Shelly Smart Control app or its IP on
  the home network and finish there.
- **Resume** — a user who closed the wizard after device creation re-enters at
  step 4 with the values intact (fetched fresh via the resume path).
- **Detection never arrives** — unchanged: step 9 keeps polling; the existing
  "press the button to force a report" hint applies.

## Verification

- `npx tsc -p tsconfig.app.json --noEmit` in `frontend/` passes (strict
  templates — this is the check that catches Angular template errors).
- Both i18n files parse as valid JSON.
- Manual: walk the wizard, confirm 9 steps render, copy buttons work, "Step X of
  9" updates, back/next bounds are correct, and resume lands on step 4.

## Out of scope / follow-ups

- Real annotated screenshots (slots are left ready).
- Any backend or GraphQL change.
- Native/PWA companion that could auto-configure the device.
