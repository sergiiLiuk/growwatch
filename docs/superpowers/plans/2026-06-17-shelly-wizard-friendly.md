# User-Friendly Shelly MQTT Pairing Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Shelly H&T Gen3 MQTT pairing wizard foolproof for a non-technical user by reordering the device config (MQTT first, Wi-Fi last) and splitting the one dense config screen into guided one-action-per-screen micro-steps.

**Architecture:** Frontend-only. The wizard ([shelly-pairing-wizard.component.ts](../../../frontend/src/app/features/settings/shelly-pairing-wizard.component.ts)) grows from 6 to 9 steps. The step machinery (a `currentStep` signal + `@switch` template) widens, the dot indicator becomes a "Step X of 9" label, and home-Wi-Fi config moves to the last device-config step so it no longer drops the setup hotspot mid-configuration. All user-visible text lives in `en.json` + `da.json`. No backend or GraphQL change — `ShellyDevice` already exposes `mqttBrokerUrl`/`mqttUsername`/`mqttPassword`/`mqttPrefix`.

**Tech Stack:** Angular 21 standalone component, signals, Transloco i18n, Tailwind v4.

**Note on tests:** This wizard has no unit-test suite (consistent with the prior Shelly MQTT work). Verification is `npx tsc -p tsconfig.app.json --noEmit` (strict templates — catches Angular template errors that plain `tsc --noEmit` misses), JSON validity of both i18n files, and a manual walk-through.

**Note on `npm run build`:** Do NOT run `npm run build` in the frontend — its prebuild hook overwrites `frontend/src/environments/environment.prod.ts`. Use `npx tsc -p tsconfig.app.json --noEmit` only.

**Deviation from spec (intentional):** The spec said a resumed device lands on "step 4." On reflection it must land on **step 3 (join the hotspot)** — to configure the device the phone must be on the Shelly hotspot again, so resume re-enters at the hotspot-join step. This is the current behavior and stays unchanged.

---

## File map

### Modified files
- `frontend/public/i18n/en.json` — replace the `shelly.wizard` block with the 9-step keys (Task 1)
- `frontend/public/i18n/da.json` — parallel Danish block (Task 2)
- `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — widen step machinery, rewrite template (Task 3)

### Note on the "Box:" labels
`brokerUrlLabel`/`usernameLabel`/`passwordLabel`/`prefixLabel` are reframed to name the **exact Shelly firmware field** each value is pasted into (e.g. "Box: Server"). Shelly's firmware UI is English regardless of app language, so the field names stay in English inside the Danish file too — translating them would mislead the user.

---

## Task 1: English i18n — rewrite the wizard block

**Files:**
- Modify: `frontend/public/i18n/en.json`

- [ ] **Step 1: Replace the entire `wizard` object**

In `frontend/public/i18n/en.json`, inside `"shelly"`, replace the whole existing `"wizard": { ... }` object (currently starting at `"step1Title"` and ending at the `closeConfirmBody` line + closing brace) with exactly:

```json
    "wizard": {
      "stepCounter": "Step {{n}} of {{total}}",
      "step1Title": "Let's pair your Shelly",
      "step1Body": "You'll need your Shelly H&T Gen3 and its battery, plus your home Wi-Fi name and password. Open the device and insert the battery — the LED should start blinking. Tap Next when it's blinking.",
      "step2Title": "Name your sensor",
      "step2Body": "Give your Shelly a nickname so you recognise it later. When you tap Next, we'll set up your unique connection details.",
      "step2NamePlaceholder": "Greenhouse",
      "step3Title": "Join the Shelly's Wi-Fi",
      "step3Body": "1. Open your phone's Wi-Fi settings.\n2. Connect to the network named ShellyHTG3-… (no password).\n3. Come back here and tap Next.\n\nWe'll guide you one step at a time from here — keep this page open.",
      "step4Title": "Open the Shelly's settings",
      "step4Body": "In a new browser tab, go to http://192.168.33.1\n\nThen open Settings → MQTT, and switch Enable MQTT on.\n\nLeave that tab open and come back here.",
      "step5Title": "Copy in these three",
      "step5Body": "These three are the same for everyone. Copy each one into the matching box on the Shelly's MQTT page.",
      "step6Title": "Your sensor's personal code",
      "step6Body": "This code is unique to your sensor. Paste it into the Custom MQTT prefix box.\n\nThen switch these two on:\n• Generic status update over MQTT\n• RPC status notifications over MQTT\n\nTap Save on the Shelly page, then come back and tap Next.",
      "step7Title": "Last: connect the Shelly to your Wi-Fi",
      "step7Body": "On the Shelly page: Settings → Wi-Fi → Wi-Fi 1 → enter your home Wi-Fi name and password → Save.\n\nThe Shelly's own Wi-Fi network will disappear right after — that's the sign it worked, not an error.\n\nLost the Shelly's Wi-Fi before you finished? Open the Shelly Smart Control app (or find the Shelly on your home network) and finish the MQTT settings there.",
      "step8Title": "Reconnect your phone",
      "step8Body": "Switch your phone's Wi-Fi back to your home network, then tap Next.",
      "step9Title": "Test the connection",
      "step9BodyWaiting": "Waiting for the first reading from your Shelly…",
      "step9BodyButtonHint": "Tip: press the small button on the side of the Shelly to force a report.",
      "step9BodySuccess": "Got it! Your Shelly is talking to GrowWatch.",
      "screenshotSlot": "Screenshot coming soon",
      "brokerUrlLabel": "Box: Server",
      "usernameLabel": "Box: MQTT user",
      "passwordLabel": "Box: MQTT password",
      "prefixLabel": "Box: Custom MQTT prefix",
      "next": "Next",
      "back": "Back",
      "close": "Close",
      "done": "Done",
      "continue": "Continue pairing",
      "closeConfirmTitle": "Cancel pairing?",
      "closeConfirmBody": "Your progress is saved. You can finish later from Settings → Shelly H&T sensors."
    }
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/public/i18n/en.json','utf8')); console.log('en OK')"`
Expected: `en OK`

---

## Task 2: Danish i18n — rewrite the wizard block

**Files:**
- Modify: `frontend/public/i18n/da.json`

- [ ] **Step 1: Replace the entire `wizard` object**

In `frontend/public/i18n/da.json`, inside `"shelly"`, replace the whole existing `"wizard": { ... }` object with exactly:

```json
    "wizard": {
      "stepCounter": "Trin {{n}} af {{total}}",
      "step1Title": "Lad os tilkoble din Shelly",
      "step1Body": "Du skal bruge din Shelly H&T Gen3 og dens batteri, plus navn + adgangskode på dit hjem-Wi-Fi. Åbn enheden og sæt batteriet i — LED'en begynder at blinke. Tryk Næste når den blinker.",
      "step2Title": "Navngiv din sensor",
      "step2Body": "Giv din Shelly et kaldenavn, så du kan kende den senere. Når du trykker Næste, opsætter vi dine unikke forbindelsesoplysninger.",
      "step2NamePlaceholder": "Drivhus",
      "step3Title": "Tilslut Shellyens Wi-Fi",
      "step3Body": "1. Åbn Wi-Fi-indstillinger på telefonen.\n2. Forbind til netværket ShellyHTG3-… (ingen adgangskode).\n3. Kom tilbage hertil og tryk Næste.\n\nVi guider dig ét trin ad gangen herfra — lad denne side være åben.",
      "step4Title": "Åbn Shellyens indstillinger",
      "step4Body": "I en ny browserfane, gå til http://192.168.33.1\n\nÅbn derefter Settings → MQTT, og slå Enable MQTT til.\n\nLad fanen være åben og kom tilbage hertil.",
      "step5Title": "Indsæt disse tre",
      "step5Body": "Disse tre er ens for alle. Kopiér hver enkelt ind i den tilsvarende boks på Shellyens MQTT-side.",
      "step6Title": "Din sensors personlige kode",
      "step6Body": "Denne kode er unik for din sensor. Indsæt den i boksen Custom MQTT prefix.\n\nSlå derefter disse to til:\n• Generic status update over MQTT\n• RPC status notifications over MQTT\n\nTryk Save på Shelly-siden, kom så tilbage og tryk Næste.",
      "step7Title": "Til sidst: forbind Shellyen til dit Wi-Fi",
      "step7Body": "På Shelly-siden: Settings → Wi-Fi → Wi-Fi 1 → indtast dit hjem-Wi-Fi-navn og adgangskode → Save.\n\nShellyens eget Wi-Fi-netværk forsvinder lige efter — det er tegnet på at det virkede, ikke en fejl.\n\nMistede du Shellyens Wi-Fi før du blev færdig? Åbn Shelly Smart Control-appen (eller find Shellyen på dit hjem-netværk) og færdiggør MQTT-indstillingerne der.",
      "step8Title": "Forbind din telefon igen",
      "step8Body": "Skift telefonens Wi-Fi tilbage til dit hjem-netværk, og tryk Næste.",
      "step9Title": "Test forbindelsen",
      "step9BodyWaiting": "Venter på første måling fra din Shelly…",
      "step9BodyButtonHint": "Tip: tryk på den lille knap på siden af Shellyen for at tvinge en rapport.",
      "step9BodySuccess": "Modtaget! Din Shelly taler nu med GrowWatch.",
      "screenshotSlot": "Skærmbillede kommer snart",
      "brokerUrlLabel": "Boks: Server",
      "usernameLabel": "Boks: MQTT user",
      "passwordLabel": "Boks: MQTT password",
      "prefixLabel": "Boks: Custom MQTT prefix",
      "next": "Næste",
      "back": "Tilbage",
      "close": "Luk",
      "done": "Færdig",
      "continue": "Fortsæt tilkobling",
      "closeConfirmTitle": "Annullér tilkobling?",
      "closeConfirmBody": "Dit forløb er gemt. Du kan fuldføre det senere fra Indstillinger → Shelly H&T-sensorer."
    }
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/public/i18n/da.json','utf8')); console.log('da OK')"`
Expected: `da OK`

---

## Task 3: Rewrite the wizard component (9 steps)

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` with exactly:

```ts
import { Component, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ShellyService, ShellyDevice } from '../../core/services/shelly.service';

type StepNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const TOTAL_STEPS = 9;

@Component({
  selector: 'app-shelly-pairing-wizard',
  imports: [FormsModule, TranslocoDirective],
  template: `
    <div class="fixed inset-0 z-[60] bg-white flex flex-col" *transloco="let t">

      <!-- Top bar -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button (click)="goBack()" [disabled]="!canGoBack()"
                class="text-[13px] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:text-gray-700 transition-colors">
          ‹ {{ t('shelly.wizard.back') }}
        </button>
        <div class="text-[12px] text-gray-400 font-medium">
          {{ t('shelly.wizard.stepCounter', { n: currentStep(), total: total }) }}
        </div>
        <button (click)="requestClose()"
                class="text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-6 max-w-lg w-full mx-auto">
        @switch (currentStep()) {
          @case (1) {
            <div class="space-y-4">
              <div class="text-4xl">🔌</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step1Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step1Body') }}</p>
            </div>
          }
          @case (2) {
            <div class="space-y-4">
              <div class="text-4xl">🏷️</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step2Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step2Body') }}</p>
              <input type="text"
                     [ngModel]="draftName()"
                     (ngModelChange)="draftName.set($event)"
                     [placeholder]="t('shelly.wizard.step2NamePlaceholder')"
                     class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green transition-colors" />
            </div>
          }
          @case (3) {
            <div class="space-y-4">
              <div class="text-4xl">📶</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step3Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step3Body') }}</p>
            </div>
          }
          @case (4) {
            <div class="space-y-4">
              <div class="text-4xl">⚙️</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step4Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step4Body') }}</p>
              <div class="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-[12px] text-gray-300">
                {{ t('shelly.wizard.screenshotSlot') }}
              </div>
            </div>
          }
          @case (5) {
            <div class="space-y-4">
              <div class="text-4xl">📋</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step5Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step5Body') }}</p>
              @if (device(); as d) {
                <div class="space-y-2">
                  <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
                    <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.brokerUrlLabel') }}</div>
                    <div class="flex items-center gap-2">
                      <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttBrokerUrl }}</code>
                      <button (click)="copyValue(d.mqttBrokerUrl, 'broker')"
                              class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
                        {{ copiedField() === 'broker' ? t('shelly.copied') : t('shelly.copyUrl') }}
                      </button>
                    </div>
                  </div>
                  <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
                    <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.usernameLabel') }}</div>
                    <div class="flex items-center gap-2">
                      <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttUsername }}</code>
                      <button (click)="copyValue(d.mqttUsername, 'user')"
                              class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
                        {{ copiedField() === 'user' ? t('shelly.copied') : t('shelly.copyUrl') }}
                      </button>
                    </div>
                  </div>
                  <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
                    <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.passwordLabel') }}</div>
                    <div class="flex items-center gap-2">
                      <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttPassword }}</code>
                      <button (click)="copyValue(d.mqttPassword, 'pass')"
                              class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
                        {{ copiedField() === 'pass' ? t('shelly.copied') : t('shelly.copyUrl') }}
                      </button>
                    </div>
                  </div>
                </div>
              }
              <div class="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-[12px] text-gray-300">
                {{ t('shelly.wizard.screenshotSlot') }}
              </div>
            </div>
          }
          @case (6) {
            <div class="space-y-4">
              <div class="text-4xl">🔑</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step6Title') }}</h1>
              @if (device(); as d) {
                <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
                  <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.prefixLabel') }}</div>
                  <div class="flex items-center gap-2">
                    <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttPrefix }}</code>
                    <button (click)="copyValue(d.mqttPrefix, 'prefix')"
                            class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
                      {{ copiedField() === 'prefix' ? t('shelly.copied') : t('shelly.copyUrl') }}
                    </button>
                  </div>
                </div>
              }
              <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step6Body') }}</p>
              <div class="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-[12px] text-gray-300">
                {{ t('shelly.wizard.screenshotSlot') }}
              </div>
            </div>
          }
          @case (7) {
            <div class="space-y-4">
              <div class="text-4xl">📶</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step7Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step7Body') }}</p>
              <div class="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-[12px] text-gray-300">
                {{ t('shelly.wizard.screenshotSlot') }}
              </div>
            </div>
          }
          @case (8) {
            <div class="space-y-4">
              <div class="text-4xl">🔁</div>
              <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step8Title') }}</h1>
              <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step8Body') }}</p>
            </div>
          }
          @case (9) {
            <div class="space-y-4">
              @if (!detected()) {
                <div class="text-4xl">⏳</div>
                <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step9Title') }}</h1>
                <p class="text-[14px] text-gray-600 leading-relaxed">{{ t('shelly.wizard.step9BodyWaiting') }}</p>
                <p class="text-[13px] text-gray-400 leading-relaxed">{{ t('shelly.wizard.step9BodyButtonHint') }}</p>
              } @else {
                <div class="text-4xl">✅</div>
                <h1 class="text-[20px] font-medium text-gw-green-dark">{{ t('shelly.wizard.step9BodySuccess') }}</h1>
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

  total = TOTAL_STEPS;
  currentStep = signal<StepNum>(1);
  device = signal<ShellyDevice | null>(null);
  busy = signal(false);
  copiedField = signal<string | null>(null);
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  detected = signal(false);

  // Step 2 input
  draftName = signal('');

  private resumed = false;

  constructor() {
    // Signal inputs aren't bound during constructor — read them in an effect so we
    // see the value the parent passes in. Resume at step 3 (join the hotspot) so the
    // user re-establishes the Shelly Wi-Fi before re-entering the config screens.
    effect(() => {
      const existing = this.existingDevice();
      if (existing && !this.resumed) {
        this.resumed = true;
        this.device.set(existing);
        this.currentStep.set(3);
      }
    });
  }

  canGoBack = computed(() => this.currentStep() > 1 && this.currentStep() < 9);

  canAdvance = computed<boolean>(() => {
    const step = this.currentStep();
    if (step === 2) return this.draftName().trim().length > 0;
    if (step === 9) return this.detected();
    return true;
  });

  ctaLabel = computed<string>(() => {
    const step = this.currentStep();
    if (step === 9) return this.transloco.translate('shelly.wizard.done');
    return this.transloco.translate('shelly.wizard.next');
  });

  goBack() {
    if (!this.canGoBack()) return;
    this.currentStep.update(s => (s - 1) as StepNum);
  }

  advance() {
    const step = this.currentStep();
    if (step === 2) {
      this.createDevice();
      return;
    }
    if (step === 9) {
      this.completed.emit();
      return;
    }
    if (step === 8) {
      this.currentStep.set(9);
      this.startPolling();
      return;
    }
    if (step < 9) this.currentStep.update(s => (s + 1) as StepNum);
  }

  private createDevice() {
    if (this.busy()) return;
    this.busy.set(true);
    this.shelly.add(this.draftName().trim()).subscribe({
      next: d => {
        this.device.set(d);
        this.busy.set(false);
        this.currentStep.set(3);
      },
      error: err => {
        this.busy.set(false);
        alert(err?.message ?? 'Failed to pair device');
      },
    });
  }

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

  copyValue(value: string, field: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      this.copiedField.set(field);
      setTimeout(() => this.copiedField.set(null), 1500);
    });
  }

  ngOnDestroy() {
    this.stopPolling();
  }
}
```

- [ ] **Step 2: Typecheck (strict templates)**

Run: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
Expected: no output, exit 0. (This compiles the Angular templates — confirms every `t('shelly.wizard.*')` reference and the `currentStep()` cases are valid.)

---

## Task 4: Verify and commit

**Files:** none (verification + commit)

- [ ] **Step 1: Re-validate both i18n files**

Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/public/i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('frontend/public/i18n/da.json','utf8'));console.log('JSON OK')"`
Expected: `JSON OK`

- [ ] **Step 2: Final strict-template typecheck**

Run: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
Expected: no output, exit 0.

- [ ] **Step 3: Confirm no orphaned old keys remain**

Run: `node -e "const w=JSON.parse(require('fs').readFileSync('frontend/public/i18n/en.json','utf8')).shelly.wizard; const dead=['urlLabel','step5Title2','step6BodyWaiting','step6BodySuccess'].filter(k=>k in w); console.log(dead.length?'ORPHANS: '+dead:'no orphans')"`
Expected: `no orphans` (the old `urlLabel`/`step6BodyWaiting`/`step6BodySuccess` keys must be gone — they were renamed to the `step9*` scheme).

- [ ] **Step 4: Commit**

```bash
git add frontend/public/i18n/en.json frontend/public/i18n/da.json frontend/src/app/features/settings/shelly-pairing-wizard.component.ts
git commit -m "shelly: guided 9-step MQTT pairing wizard (MQTT before Wi-Fi)"
```

(End the commit message body with the standard `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.)

- [ ] **Step 5: Manual verification (record the result)**

Run `cd frontend && npm start`, open the Shelly pairing wizard (Settings → Shelly H&T sensors → Add Shelly), and confirm:
1. Header shows "Step 1 of 9", incrementing as you advance.
2. Step 2 requires a name before Next enables.
3. After naming, you land on step 3 (join hotspot).
4. Step 5 shows three copy cards (Server / MQTT user / MQTT password); step 6 shows the prefix card; each Copy button flips to "Copied" independently.
5. Step 7 is the home-Wi-Fi step (now last in device config) with the "Wi-Fi will disappear" + recovery note.
6. Back is disabled on step 1 and step 9; enabled on 2–8.
7. Screenshot placeholder boxes render on steps 4–7.

---

## Self-review notes

- **Spec coverage:**
  - Reorder MQTT-first / Wi-Fi-last → step 6 (MQTT save) precedes step 7 (Wi-Fi); Task 1/2 bodies + Task 3 cases.
  - Micro-steps (one action per screen) → 9-step `@switch`, Task 3.
  - Reframe "three shared + one personal" → step 5 (three cards) vs step 6 (prefix), with `Box: <field>` labels.
  - Screenshot slots → dashed placeholder on steps 4–7, `screenshotSlot` key.
  - "Step X of 9" indicator replaces dots → `stepCounter` key + header label; `stepDots` removed.
  - Recovery note for lost hotspot → step7Body.
  - Both en.json + da.json updated → Tasks 1 + 2.
  - Verification via strict-template tsc + JSON parse → Tasks 3/4.
- **Intentional spec deviation:** resume lands on step 3 (join hotspot), not step 4 — documented in the header.
- **Type consistency:** `StepNum` is `1..9`; `advance()` terminal step is 9; polling starts on the 8→9 transition; `canAdvance`/`ctaLabel` gate on step 9; `copyValue(value, field)` and `copiedField()` reused unchanged with field keys `broker`/`user`/`pass`/`prefix`. `total` (=`TOTAL_STEPS`=9) is bound in the header counter.
- **No placeholders:** every step ships the exact file content or exact command + expected output.
```
