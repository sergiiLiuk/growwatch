import { Injectable } from '@angular/core';

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unsupported' | 'failed';

@Injectable({ providedIn: 'root' })
export class ShareService {
  /**
   * Try `navigator.share()`, falling back to clipboard copy when the OS dialog
   * isn't available (desktop browsers, secure-context restrictions). Never
   * throws — the caller can react to the returned outcome.
   */
  async share(payload: SharePayload): Promise<ShareOutcome> {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share(payload);
        return 'shared';
      } catch (err: any) {
        // AbortError = user dismissed the sheet
        if (err?.name === 'AbortError') return 'cancelled';
        // Some browsers throw NotAllowedError outside a user gesture — fall through to clipboard
      }
    }
    return this.copyToClipboard(this.flatten(payload));
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';
  }

  private async copyToClipboard(text: string): Promise<ShareOutcome> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return 'unsupported';
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  private flatten(payload: SharePayload): string {
    return [payload.title, payload.text, payload.url].filter(Boolean).join('\n');
  }
}
