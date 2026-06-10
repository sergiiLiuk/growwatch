# Shelly Pairing Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare "Add Shelly → copy URL → go follow a written guide" flow with an in-app full-screen 6-step wizard that walks users through power-on, Wi-Fi onboarding, webhook configuration, and live success detection — no third-party app required.

**Architecture:** New full-screen Angular standalone component `ShellyPairingWizardComponent` owns `currentStep`, `device`, and step-validation state. The existing `ShellySetupComponent` toggles a `wizardOpen` signal: while open, it renders the wizard in place of the device list. Wizard reuses existing GraphQL (`addShellyDevice` for step 4 creation, `myShellyDevices` for step 6 polling). No backend changes.

**Tech Stack:** Angular 21 standalone components, signals/computed, Apollo Client, Transloco i18n, Tailwind v4, rxjs.

**Note on tests:** This area has no existing unit tests. Verification follows the project pattern: `npx tsc --noEmit` plus manual browser walkthroughs of the wizard. Each task ends with a typecheck and (where meaningful) a manual-verify checklist.

**Note on `npm run build`:** Do NOT run `npm run build` during these tasks. Its `prebuild` hook overwrites `frontend/src/environments/environment.prod.ts`. Use `npx tsc --noEmit` exclusively.

---

## File map

- **Modify:** `frontend/public/i18n/en.json` and `frontend/public/i18n/da.json` — add `shelly.wizard.*` block (~30 keys).
- **Create:** `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — the full-screen 6-step wizard.
- **Modify:** `frontend/src/app/features/settings/shelly-setup.component.ts` — open/close the wizard from the existing page; adapt Add/Continue button to resume logic.

No backend, no service changes, no schema changes.

---

## Task 1: Add wizard i18n keys

**Files:**
- Modify: `frontend/public/i18n/en.json` — inside existing `shelly` object, add `wizard` sub-object
- Modify: `frontend/public/i18n/da.json` — same

- [ ] **Step 1: Add English keys**

In `frontend/public/i18n/en.json`, inside the existing `"shelly": { ... }` object, add this new key directly before the closing brace of the `shelly` block:

```json
"wizard": {
  "step1Title": "Let's pair your Shelly",
  "step1Body": "You'll need your Shelly H&T Gen3, its battery, and your home Wi-Fi name + password. Open the device and insert the battery — the LED should start blinking. Tap Next when it's blinking.",
  "step2Title": "Connect to the Shelly's Wi-Fi",
  "step2Body": "On your phone, open Wi-Fi settings and join the network named ShellyHTG3-… (no password). Once connected, come back here.",
  "step3Title": "Set your home Wi-Fi on the Shelly",
  "step3Body": "Open a new browser tab and go to http://192.168.33.1. In the Shelly's page that loads, find Settings → Wi-Fi → Wi-Fi 1, enter your home Wi-Fi name and password, and tap Save. The Shelly will reconnect to your home Wi-Fi within ~10 seconds. Reconnect your phone to your home Wi-Fi too, then come back here.",
  "step4Title": "Name your sensor",
  "step4Body": "Give your Shelly a nickname so you recognise it later.",
  "step4NamePlaceholder": "Greenhouse",
  "step5Title": "Tell the Shelly where to send data",
  "step5Body": "Copy this URL, then open the Shelly's web UI (its new IP on your home Wi-Fi — find it in the Shelly app or your router's device list) and add a webhook:",
  "step5UrlLabel": "Your webhook URL",
  "step5Instructions": "In the Shelly's web UI: Settings → Webhooks (or Outbound Webhooks / URL Actions — labels vary by firmware) → Add. Set method to POST and trigger on temperature OR humidity change. Save. Repeat for the other one (so both temperature and humidity changes fire the webhook).",
  "step6Title": "Test the connection",
  "step6BodyWaiting": "Waiting for the first reading from your Shelly…",
  "step6BodyButtonHint": "Tip: press the small button on the side of the Shelly to force a report.",
  "step6BodySuccess": "Got it! Your Shelly is talking to GrowWatch.",
  "next": "Next",
  "back": "Back",
  "close": "Close",
  "done": "Done",
  "continue": "Continue pairing",
  "closeConfirmTitle": "Cancel pairing?",
  "closeConfirmBody": "Your progress is saved. You can finish later from Settings → Shelly H&T sensors."
}
```

- [ ] **Step 2: Add Danish keys**

In `frontend/public/i18n/da.json`, inside the existing `"shelly": { ... }` object, add the Danish equivalent before the closing brace:

```json
"wizard": {
  "step1Title": "Lad os tilkoble din Shelly",
  "step1Body": "Du skal bruge din Shelly H&T Gen3, dens batteri og navn + adgangskode på dit hjem-Wi-Fi. Åbn enheden og sæt batteriet i — LED'en begynder at blinke. Tryk Næste når den blinker.",
  "step2Title": "Tilslut til Shellyens Wi-Fi",
  "step2Body": "Åbn Wi-Fi-indstillinger på telefonen og forbind til netværket ShellyHTG3-… (ingen adgangskode). Når du er forbundet, kom tilbage hertil.",
  "step3Title": "Indstil dit hjem-Wi-Fi på Shellyen",
  "step3Body": "Åbn en ny browserfane og gå til http://192.168.33.1. På Shellyens side: Settings → Wi-Fi → Wi-Fi 1, indtast dit hjem-Wi-Fi-navn og adgangskode, og tryk Save. Shellyen forbinder til dit hjem-Wi-Fi inden for ~10 sekunder. Tilslut din telefon til hjem-Wi-Fi igen, og kom så tilbage hertil.",
  "step4Title": "Navngiv din sensor",
  "step4Body": "Giv din Shelly et kaldenavn, så du kan kende den senere.",
  "step4NamePlaceholder": "Drivhus",
  "step5Title": "Fortæl Shellyen hvor den skal sende data",
  "step5Body": "Kopiér denne URL og åbn Shellyens web-UI (dens nye IP på hjem-Wi-Fi — find den i Shelly-appen eller din routers enhedsliste) og tilføj en webhook:",
  "step5UrlLabel": "Din webhook-URL",
  "step5Instructions": "I Shellyens web-UI: Settings → Webhooks (eller Outbound Webhooks / URL Actions — navne varierer efter firmware) → Add. Sæt method til POST og trigger ved ændring i temperatur eller fugtighed. Save. Gentag for den anden (så både temperatur- og fugtighedsændringer udløser webhooken).",
  "step6Title": "Test forbindelsen",
  "step6BodyWaiting": "Venter på første måling fra din Shelly…",
  "step6BodyButtonHint": "Tip: tryk på den lille knap på siden af Shellyen for at tvinge en rapport.",
  "step6BodySuccess": "Modtaget! Din Shelly taler nu med GrowWatch.",
  "next": "Næste",
  "back": "Tilbage",
  "close": "Luk",
  "done": "Færdig",
  "continue": "Fortsæt tilkobling",
  "closeConfirmTitle": "Annullér tilkobling?",
  "closeConfirmBody": "Dit forløb er gemt. Du kan fuldføre det senere fra Indstillinger → Shelly H&T-sensorer."
}
```

- [ ] **Step 3: Commit**

```
git add frontend/public/i18n/en.json frontend/public/i18n/da.json
git commit -m "i18n: add Shelly pairing wizard keys"
```

---

## Task 2: Wizard component skeleton — chrome + step navigation

This task creates the file with the shell: signals, top bar (back / dots / close), sticky bottom CTA, body container, and step routing for the 6 step bodies (each rendered as an empty placeholder for now — populated in Tasks 3–6).

**Files:**
- Create: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`

- [ ] **Step 1: Write the skeleton**

Create `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` with exactly:

```ts
import { Component, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ShellyService, ShellyDevice } from '../../core/services/shelly.service';

type StepNum = 1 | 2 | 3 | 4 | 5 | 6;

@Component({
  selector: 'app-shelly-pairing-wizard',
  imports: [FormsModule, TranslocoDirective],
  template: `
    <div class="fixed inset-0 z-50 bg-white flex flex-col" *transloco="let t">

      <!-- Top bar -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button (click)="goBack()" [disabled]="!canGoBack()"
                class="text-[13px] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:text-gray-700 transition-colors">
          ‹ {{ t('shelly.wizard.back') }}
        </button>
        <div class="flex items-center gap-1.5">
          @for (n of stepDots; track n) {
            <span class="w-2 h-2 rounded-full"
                  [class.bg-gw-green]="n === currentStep()"
                  [class.bg-gw-green-light]="n < currentStep()"
                  [class.bg-gray-200]="n > currentStep()"></span>
          }
        </div>
        <button (click)="requestClose()"
                class="text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-6 max-w-lg w-full mx-auto">
        @switch (currentStep()) {
          @case (1) { <div data-step="1"></div> }
          @case (2) { <div data-step="2"></div> }
          @case (3) { <div data-step="3"></div> }
          @case (4) { <div data-step="4"></div> }
          @case (5) { <div data-step="5"></div> }
          @case (6) { <div data-step="6"></div> }
        }
      </div>

      <!-- Sticky bottom CTA -->
      <div class="px-5 py-4 border-t border-gray-100 max-w-lg w-full mx-auto">
        <button (click)="advance()"
                [disabled]="!canAdvance() || busy()"
                class="w-full bg-gw-green text-white text-[14px] py-3 rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {{ ctaLabel() }}
        </button>
      </div>
    </div>
  `,
})
export class ShellyPairingWizardComponent implements OnDestroy {
  private shelly = inject(ShellyService);
  private transloco = inject(TranslocoService);

  /** Existing device when resuming (null when starting from step 1). */
  existingDevice = input<ShellyDevice | null>(null);

  closed = output<void>();
  completed = output<void>();

  currentStep = signal<StepNum>(1);
  device = signal<ShellyDevice | null>(null);
  busy = signal(false);
  stepDots: StepNum[] = [1, 2, 3, 4, 5, 6];

  // Step 4 input
  draftName = signal('');

  constructor() {
    const existing = this.existingDevice();
    if (existing) {
      this.device.set(existing);
      this.currentStep.set(5);
    }
  }

  canGoBack = computed(() => this.currentStep() > 1 && this.currentStep() < 6);

  canAdvance = computed<boolean>(() => {
    const step = this.currentStep();
    if (step === 4) return this.draftName().trim().length > 0;
    if (step === 6) return false; // Step 6 advances itself once the reading is detected (Task 6)
    return true;
  });

  ctaLabel = computed<string>(() => {
    const step = this.currentStep();
    if (step === 6) return this.transloco.translate('shelly.wizard.done');
    return this.transloco.translate('shelly.wizard.next');
  });

  goBack() {
    if (!this.canGoBack()) return;
    this.currentStep.update(s => (s - 1) as StepNum);
  }

  advance() {
    const step = this.currentStep();
    if (step === 4) {
      this.createDevice();
      return;
    }
    if (step === 6) {
      this.completed.emit();
      return;
    }
    if (step < 6) this.currentStep.update(s => (s + 1) as StepNum);
  }

  private createDevice() {
    if (this.busy()) return;
    this.busy.set(true);
    this.shelly.add(this.draftName().trim()).subscribe({
      next: d => {
        this.device.set(d);
        this.busy.set(false);
        this.currentStep.set(5);
      },
      error: err => {
        this.busy.set(false);
        alert(err?.message ?? 'Failed to pair device');
      },
    });
  }

  requestClose() {
    if (this.currentStep() === 1) {
      this.closed.emit();
      return;
    }
    const ok = confirm(
      this.transloco.translate('shelly.wizard.closeConfirmTitle') + '\n\n' +
      this.transloco.translate('shelly.wizard.closeConfirmBody')
    );
    if (ok) this.closed.emit();
  }

  ngOnDestroy() {
    // Step 6 will install polling later — cleanup happens in Task 6.
  }
}
```

- [ ] **Step 2: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors. The wizard isn't mounted anywhere yet — that's fine.

- [ ] **Step 3: Commit**

```
git add frontend/src/app/features/settings/shelly-pairing-wizard.component.ts
git commit -m "shelly: wizard component skeleton (chrome + step nav)"
```

---

## Task 3: Steps 1–3 bodies (pure instruction screens)

Fill in the three pure-instruction screens.

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — replace the three empty `@case (1)`, `@case (2)`, `@case (3)` bodies

- [ ] **Step 1: Replace step 1's body**

In the template, replace this line:
```html
@case (1) { <div data-step="1"></div> }
```
with:
```html
@case (1) {
  <div class="space-y-4">
    <div class="text-4xl">🔌</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step1Title') }}</h1>
    <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step1Body') }}</p>
  </div>
}
```

- [ ] **Step 2: Replace step 2's body**

Replace:
```html
@case (2) { <div data-step="2"></div> }
```
with:
```html
@case (2) {
  <div class="space-y-4">
    <div class="text-4xl">📶</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step2Title') }}</h1>
    <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step2Body') }}</p>
  </div>
}
```

- [ ] **Step 3: Replace step 3's body**

Replace:
```html
@case (3) { <div data-step="3"></div> }
```
with:
```html
@case (3) {
  <div class="space-y-4">
    <div class="text-4xl">🌐</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step3Title') }}</h1>
    <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step3Body') }}</p>
  </div>
}
```

- [ ] **Step 4: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```
git add frontend/src/app/features/settings/shelly-pairing-wizard.component.ts
git commit -m "shelly: wizard steps 1-3 (instruction screens)"
```

---

## Task 4: Step 4 body — name input

The Next button on step 4 already calls `createDevice()` (wired in Task 2). This task is the input.

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — replace the empty `@case (4)` body

- [ ] **Step 1: Replace step 4's body**

Replace:
```html
@case (4) { <div data-step="4"></div> }
```
with:
```html
@case (4) {
  <div class="space-y-4">
    <div class="text-4xl">🏷️</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step4Title') }}</h1>
    <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step4Body') }}</p>
    <input type="text"
           [ngModel]="draftName()"
           (ngModelChange)="draftName.set($event)"
           [placeholder]="t('shelly.wizard.step4NamePlaceholder')"
           class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green transition-colors" />
  </div>
}
```

- [ ] **Step 2: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add frontend/src/app/features/settings/shelly-pairing-wizard.component.ts
git commit -m "shelly: wizard step 4 (name input)"
```

---

## Task 5: Step 5 body — webhook URL + copy + instructions

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — replace the empty `@case (5)` body and add a `copy()` method + `copied` signal

- [ ] **Step 1: Add the `copied` signal**

Inside the class body, find the existing `busy = signal(false);` line and add directly below:

```ts
copied = signal(false);
```

- [ ] **Step 2: Add the `copy()` method**

Inside the class body, add a new method (a good place is just above `ngOnDestroy()`):

```ts
copy() {
  const url = this.device()?.webhookUrl;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  });
}
```

- [ ] **Step 3: Replace step 5's body**

In the template, replace:
```html
@case (5) { <div data-step="5"></div> }
```
with:
```html
@case (5) {
  <div class="space-y-4">
    <div class="text-4xl">🔗</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step5Title') }}</h1>
    <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step5Body') }}</p>
    @if (device(); as d) {
      <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
        <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.step5UrlLabel') }}</div>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.webhookUrl }}</code>
          <button (click)="copy()"
                  class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
            {{ copied() ? t('shelly.copied') : t('shelly.copyUrl') }}
          </button>
        </div>
      </div>
    }
    <p class="text-[13px] text-gray-500 leading-relaxed">{{ t('shelly.wizard.step5Instructions') }}</p>
  </div>
}
```

- [ ] **Step 4: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```
git add frontend/src/app/features/settings/shelly-pairing-wizard.component.ts
git commit -m "shelly: wizard step 5 (webhook URL + copy + instructions)"
```

---

## Task 6: Step 6 — polling + success state

Poll `myShellyDevices` every 5 seconds while step 6 is active. When the wizard's device's `lastSeenAt` becomes non-null, stop polling and show success. Enable the Done button.

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — replace empty `@case (6)`, add polling lifecycle

- [ ] **Step 1: Add the polling state**

Inside the class body, find the existing `copied = signal(false);` line and add directly below:

```ts
private pollHandle: ReturnType<typeof setInterval> | null = null;
detected = signal(false);
```

- [ ] **Step 2: Add the polling start/stop methods**

Inside the class body, add these two methods (place them above `ngOnDestroy()`):

```ts
private startPolling() {
  this.stopPolling();
  this.poll(); // immediate first hit
  this.pollHandle = setInterval(() => this.poll(), 5000);
}

private stopPolling() {
  if (this.pollHandle !== null) {
    clearInterval(this.pollHandle);
    this.pollHandle = null;
  }
}

private poll() {
  const currentId = this.device()?.id;
  if (!currentId) return;
  this.shelly.list().subscribe({
    next: list => {
      const fresh = list.find(d => d.id === currentId);
      if (fresh) {
        this.device.set(fresh);
        if (fresh.lastSeenAt && !this.detected()) {
          this.detected.set(true);
          this.stopPolling();
        }
      }
    },
    error: () => { /* keep polling on transient errors */ },
  });
}
```

- [ ] **Step 3: Trigger polling when entering step 6**

Find the existing `advance()` method. Replace it with:

```ts
advance() {
  const step = this.currentStep();
  if (step === 4) {
    this.createDevice();
    return;
  }
  if (step === 6) {
    this.completed.emit();
    return;
  }
  if (step === 5) {
    this.currentStep.set(6);
    this.startPolling();
    return;
  }
  if (step < 6) this.currentStep.update(s => (s + 1) as StepNum);
}
```

(The change vs Task 2 is the new `if (step === 5)` block that starts polling on entry to step 6.)

- [ ] **Step 4: Handle resume entering step 6**

If the user resumes the wizard at step 5 (via the existing-device case in the constructor) and then advances to step 6, polling starts via the `advance()` change above. That covers resume too — no extra change needed for the constructor.

If, however, someone resumes already past step 6, that's not possible by design: the resume case sets step to 5. Skip this.

- [ ] **Step 5: Update `canAdvance` and `ctaLabel` for step 6**

Find the existing `canAdvance = computed<boolean>(...)` block. Replace it with:

```ts
canAdvance = computed<boolean>(() => {
  const step = this.currentStep();
  if (step === 4) return this.draftName().trim().length > 0;
  if (step === 6) return this.detected();
  return true;
});
```

(Change: `if (step === 6) return false;` → `return this.detected();` so Done lights up on success.)

- [ ] **Step 6: Stop polling on destroy**

Find the existing `ngOnDestroy()` method. Replace its body so the comment is removed and the call is real:

```ts
ngOnDestroy() {
  this.stopPolling();
}
```

- [ ] **Step 7: Replace step 6's body**

In the template, replace:
```html
@case (6) { <div data-step="6"></div> }
```
with:
```html
@case (6) {
  <div class="space-y-4">
    @if (!detected()) {
      <div class="text-4xl">⏳</div>
      <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step6Title') }}</h1>
      <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step6BodyWaiting') }}</p>
      <p class="text-[13px] text-gray-400 leading-relaxed">{{ t('shelly.wizard.step6BodyButtonHint') }}</p>
    } @else {
      <div class="text-4xl">✅</div>
      <h1 class="text-[20px] font-medium text-gw-green-dark">{{ t('shelly.wizard.step6BodySuccess') }}</h1>
      @if (device(); as d) {
        <div class="bg-gw-green-light rounded-xl p-4 space-y-1">
          <div class="text-[11px] text-gw-green-dark/70 uppercase tracking-wide">{{ d.name }}</div>
          @if (d.lastBatteryPercent != null) {
            <div class="text-[14px] text-gw-green-dark">{{ t('shelly.battery', { n: d.lastBatteryPercent }) }}</div>
          }
        </div>
      }
    }
  </div>
}
```

- [ ] **Step 8: Stop polling on close**

Find the existing `requestClose()` method. Add `this.stopPolling()` at the very start of the method (right after the function opening brace):

```ts
requestClose() {
  this.stopPolling();
  if (this.currentStep() === 1) {
    this.closed.emit();
    return;
  }
  const ok = confirm(
    this.transloco.translate('shelly.wizard.closeConfirmTitle') + '\n\n' +
    this.transloco.translate('shelly.wizard.closeConfirmBody')
  );
  if (ok) this.closed.emit();
}
```

- [ ] **Step 9: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 10: Commit**

```
git add frontend/src/app/features/settings/shelly-pairing-wizard.component.ts
git commit -m "shelly: wizard step 6 (poll + success detection)"
```

---

## Task 7: Wire the wizard into the existing Settings page

Replace the existing "Add Shelly" button with logic that opens the wizard inline. Adapt the Add/Continue label for resume.

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-setup.component.ts`

- [ ] **Step 1: Import the wizard component**

At the top of `shelly-setup.component.ts`, add:

```ts
import { ShellyPairingWizardComponent } from './shelly-pairing-wizard.component';
```

And add `ShellyPairingWizardComponent` to the component's `imports: [...]` array.

- [ ] **Step 2: Add the wizard signals and computed**

Inside the class body, near the other signals, add:

```ts
wizardOpen = signal(false);
```

And add a computed signal for the existing unfinished device:

```ts
unfinishedDevice = computed<ShellyDevice | null>(() => {
  const d = this.devices()[0];
  return d && !d.lastSeenAt ? d : null;
});
```

(Make sure `computed` is in the `@angular/core` import — it should already be there from earlier work; if not, add it.)

- [ ] **Step 3: Add open/close handlers**

Inside the class body, add:

```ts
openWizard() {
  this.wizardOpen.set(true);
}

onWizardClosed() {
  this.wizardOpen.set(false);
  this.reload();
}

onWizardCompleted() {
  this.wizardOpen.set(false);
  this.reload();
}
```

- [ ] **Step 4: Replace the Add Shelly button block**

Find the existing block in the template:

```html
@if (!addingNew() && devices().length === 0) {
  <button (click)="startAdd()"
          class="w-full mt-4 px-4 py-3 rounded-xl bg-gw-green text-white text-[14px] font-medium">
    {{ t('shelly.addDevice') }}
  </button>
} @else if (addingNew()) {
```

Replace ONLY the first `@if` branch (the Add button) — keep the `@else if (addingNew())` form branch intact. The replacement:

```html
@if (devices().length === 0 || unfinishedDevice()) {
  <button (click)="openWizard()"
          class="w-full mt-4 px-4 py-3 rounded-xl bg-gw-green text-white text-[14px] font-medium">
    {{ unfinishedDevice() ? t('shelly.wizard.continue') : t('shelly.addDevice') }}
  </button>
}
```

Now find the OLD `@else if (addingNew()) { ... }` form block — it's an entire inline form (~30 lines) that's no longer reachable, because we removed the `addingNew()` flow. Delete the entire `@else if (addingNew()) { ... }` block. Also remove these now-dead methods and signals from the class body:

- `addingNew = signal(false);`
- `draftName = ''` (top-level field, NOT inside the wizard — the wizard has its own `draftName`)
- `saving = signal(false);` — KEEP THIS, it's used elsewhere? Search first. If not, delete.
- `startAdd()`, `cancelAdd()`, `canSave()`, `saveNew()` methods

Do this carefully — read the file before each delete and confirm the symbol isn't used elsewhere in the same file (Ctrl-F equivalent). If `saving` is used in the rotate/remove paths, leave it. If `draftName` isn't used outside the deleted form, delete it.

- [ ] **Step 5: Mount the wizard**

In the template, find the outermost `<div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">` (the root of the page). Add an `@if`/`@else` wrapper around its contents so the wizard takes over the whole page when open:

Change:

```html
<div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">
  <button (click)="back()" ...
```

to:

```html
@if (wizardOpen()) {
  <app-shelly-pairing-wizard
    [existingDevice]="unfinishedDevice()"
    (closed)="onWizardClosed()"
    (completed)="onWizardCompleted()" />
} @else {
  <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">
    <button (click)="back()" ...
```

And close the `@else { ... }` block at the corresponding end of the existing root `</div>`.

- [ ] **Step 6: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Manual verify**

Start both servers:

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npm run dev
cd /c/Users/Sergii/Desktop/growwatch/frontend && npm start
```

In a browser:

1. Log in, go to **Settings → Shelly H&T sensors**. If you already have a paired device with readings, remove it first.
2. Confirm Add Shelly is visible. Tap it → wizard opens at step 1.
3. Top bar shows 6 dots, Back disabled, ✕ visible.
4. Tap Next four times → reach step 4 (Name your sensor). Next is disabled until a name is typed.
5. Type "Test wizard" → Next is enabled → Next → device is created → lands on step 5 with the webhook URL.
6. Verify Copy works (label flips to "Copied" for ~1.5s).
7. Tap Next → step 6 shows "Waiting for the first reading…".
8. In a terminal, simulate a Shelly hit using the URL from step 5 with placeholders replaced:
   ```
   curl -i -X POST "http://localhost:4000/api/shelly/webhook?token=PASTE_TOKEN&deviceId=gw-PASTE_DEVICE_ID&t=21.5&h=48&bat=87"
   ```
   Expected: `HTTP/1.1 204 No Content`.
9. Within ≤5 seconds, the wizard flips to the success screen. Done button is enabled.
10. Tap Done → wizard closes → device card appears with "Just now" + "Battery 87%".

Resume test:
11. Tap the 🗑 to remove the device.
12. Tap Add Shelly → wizard opens at step 1. Advance to step 4, name "Resume test", advance to step 5.
13. Tap ✕ → confirm "Cancel pairing".
14. Back on Settings → button label is now "Continue pairing" (not "Add Shelly").
15. Tap Continue pairing → wizard opens at step 5 with the same URL.
16. Tap ✕ → confirm. Clean up by tapping 🗑 on the device card.

- [ ] **Step 8: Commit**

```
git add frontend/src/app/features/settings/shelly-setup.component.ts
git commit -m "shelly: mount pairing wizard from Settings page"
```

---

## Self-review notes

- **Spec coverage:**
  - Six-step wizard with the exact steps listed in the spec table → Tasks 3 (1–3), 4 (4), 5 (5), 6 (6).
  - Top bar with back + dots + close → Task 2.
  - Sticky bottom CTA with disabled state per step → Task 2 + Task 6 (step-6 enablement on detection).
  - Step 4 creates `ShellyDevice` via `addShellyDevice` → Task 2 (`createDevice()`).
  - Step 5 displays `webhookUrl` with Copy → Task 5.
  - Step 6 polls `myShellyDevices` every 5s, stops on detection or close → Task 6.
  - Success screen shows reading + battery → Task 6 Step 7.
  - Resume: `existingDevice` input + constructor jumps to step 5 → Task 2 (constructor); resume button label → Task 7 Step 4.
  - Close confirm dialog → Task 2 (`requestClose()`).
  - One-device-per-account stays (no Add when one device exists with `lastSeenAt`) → Task 7 Step 4 (`devices().length === 0 || unfinishedDevice()`).
  - i18n in en + da → Task 1.

- **No placeholders:** every step ships actual code or a precise list of file lines to change.

- **Type consistency:** `StepNum` is `1|2|3|4|5|6`, used in `currentStep`, `goBack`, `advance`. `ShellyDevice` matches the existing service interface. `existingDevice` is `input<ShellyDevice | null>`, `device` is `signal<ShellyDevice | null>` — names + nullability consistent. `pollHandle` is `ReturnType<typeof setInterval>` which works in both DOM and Node typings.

- **Risks called out in spec:**
  - "Step 3/5 still send users to Shelly's web UI" → reflected in step 3 and step 5 body text (Task 1 i18n).
  - "Shelly menu labels vary by firmware" → step 5 instructions list the variants ("Webhooks (or Outbound Webhooks / URL Actions — labels vary by firmware)") → Task 1 i18n.
  - "Orphaned device" → Task 7's Continue pairing flow handles the resume case; manual remove handles permanent abandon.
  - "latestSensorData mix with ESP32" → spec accepts the edge case; success screen shows the wizard's device card data (name + battery), NOT live temp/humidity — no actual cross-source risk in the implementation (Task 6 Step 7 deliberately omits temp/humidity values to avoid this).
