import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, TranslocoDirective],
  template: `
    <div class="min-h-screen bg-gw-parchment py-10 px-6" *transloco="let t">
      <div class="max-w-2xl mx-auto">
        <a routerLink="/login" class="text-[12px] text-gray-500 hover:text-gw-green-dark transition-colors">← {{ t('legal.back') }}</a>
        <h1 class="text-[24px] font-bold text-gw-green-dark mt-4 mb-2">{{ t('privacy.title') }}</h1>
        <p class="text-[12px] text-gray-400 mb-6">{{ t('legal.lastUpdated') }} {{ t('privacy.lastUpdated') }}</p>
        <article class="bg-white border border-gw-border/40 rounded-2xl p-6 sm:p-8 text-[14px] leading-relaxed text-gray-700 whitespace-pre-line">{{ t('privacy.body') }}</article>
      </div>
    </div>
  `,
})
export class PrivacyComponent {}
