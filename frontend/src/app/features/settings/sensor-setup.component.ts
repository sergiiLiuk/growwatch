import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

const STEPS = [
  {
    n: 1,
    title: 'Reset the sensor',
    body: 'Hold the <strong>BOOT</strong> button on your ESP32 for 3 seconds until the LED flashes blue. This puts it into setup mode.',
    hint: { icon: 'hand', text: 'Hold <strong>BOOT</strong> · 3 seconds · LED flashes blue' },
  },
  {
    n: 2,
    title: 'Connect to GrowWatch-Setup',
    body: 'Go to your phone\'s <strong>WiFi settings</strong> and connect to the network called <strong>GrowWatch-Setup</strong>. It will appear within a few seconds of step 1.',
    hint: { icon: 'wifi', text: 'Settings → WiFi → <strong>GrowWatch-Setup</strong>' },
  },
  {
    n: 3,
    title: 'Open the setup page',
    body: 'A setup page may open automatically. If nothing appears, open your browser and go to:',
    hint: { icon: 'globe', text: '<strong>http://192.168.4.1</strong> — type this in your browser address bar' },
  },
  {
    n: 4,
    title: 'Enter your home WiFi details',
    body: 'Select your home network from the list and enter your password. Tap <strong>Connect sensor</strong>. Your phone will disconnect from GrowWatch-Setup — that\'s normal.',
    hint: { icon: 'check', text: 'Sensor reboots automatically and connects to your home WiFi' },
  },
];

const ISSUES = [
  { q: 'GrowWatch-Setup not showing?', a: 'Make sure you held BOOT for a full 3 seconds until the LED flashed.' },
  { q: '192.168.4.1 not loading?', a: 'Make sure your phone is still connected to GrowWatch-Setup, not your home WiFi.' },
  { q: 'Sensor not connecting?', a: 'Check your password and make sure your network is 2.4 GHz — the sensor doesn\'t support 5 GHz.' },
];

const HINT_ICONS: Record<string, string> = { hand: '☝️', wifi: '📶', globe: '🌐', check: '✓' };

@Component({
  selector: 'app-sensor-setup',
  imports: [],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6">

      <!-- Header -->
      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ Settings
      </button>

      <h1 class="text-[18px] font-medium text-gray-800 mb-5">Sensor setup guide</h1>

      <!-- Hero card -->
      <div class="bg-gw-green-light rounded-2xl p-5 flex items-center gap-4 mb-6">
        <div class="w-14 h-14 rounded-full bg-white flex items-center justify-center shrink-0">
          <svg class="w-7 h-7 text-gw-green-dark" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1" fill="currentColor"/>
          </svg>
        </div>
        <div>
          <p class="text-[16px] font-semibold text-gw-green-dark leading-tight">Connect sensor to WiFi</p>
          <p class="text-[13px] text-gw-green-dark/70 mt-0.5 leading-snug">
            Follow these steps to connect your GrowWatch sensor to your home network.
          </p>
        </div>
      </div>

      <!-- Steps -->
      <div class="flex flex-col gap-3 mb-6">
        @for (step of steps; track step.n) {
          <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
            <div class="flex items-start gap-3 mb-3">
              <div class="w-7 h-7 rounded-full bg-gw-green-light flex items-center justify-center shrink-0 mt-0.5">
                <span class="text-[12px] font-semibold text-gw-green-dark">{{ step.n }}</span>
              </div>
              <div>
                <p class="text-[14px] font-semibold text-gray-900 mb-1">{{ step.title }}</p>
                <p class="text-[13px] text-gray-500 leading-relaxed" [innerHTML]="step.body"></p>
              </div>
            </div>
            <div class="bg-gray-50 rounded-xl px-4 py-3 flex items-start gap-3">
              <span class="text-[15px] mt-0.5 shrink-0">{{ hintIcon(step.hint.icon) }}</span>
              <p class="text-[13px] text-gray-600 leading-snug" [innerHTML]="step.hint.text"></p>
            </div>
          </div>
        }
      </div>

      <!-- Troubleshooting -->
      <div class="bg-amber-50 border-[0.5px] border-amber-200 rounded-xl p-4 mb-6">
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p class="text-[13px] font-semibold text-amber-800">If something goes wrong</p>
        </div>
        <ul class="flex flex-col gap-2.5 list-disc list-inside">
          @for (issue of issues; track issue.q) {
            <li class="text-[13px] text-amber-900 leading-snug">
              <span class="font-semibold">{{ issue.q }}</span> {{ issue.a }}
            </li>
          }
        </ul>
      </div>

      <!-- Changing WiFi later -->
      <div>
        <p class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Changing WiFi later</p>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4 flex items-start gap-3">
          <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg class="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </div>
          <div>
            <p class="text-[14px] font-semibold text-gray-900 mb-1">Need to change network?</p>
            <p class="text-[13px] text-gray-500 leading-relaxed">
              Hold the BOOT button for 3 seconds at any time to clear the saved WiFi and restart the setup.
              Then follow steps 2–4 above with your new network details.
            </p>
          </div>
        </div>
      </div>

    </div>
  `,
})
export class SensorSetupComponent {
  private router = inject(Router);
  steps = STEPS;
  issues = ISSUES;
  back() { this.router.navigate(['/settings']); }
  hintIcon(key: string): string { return HINT_ICONS[key] ?? '•'; }
}
