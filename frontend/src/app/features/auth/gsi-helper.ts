/**
 * Tiny wrapper around the Google Identity Services button. The GSI script is
 * loaded once from index.html with `async defer`, so on the first auth-page
 * visit it may not be ready yet — we poll until `google.accounts.id` exists.
 */
declare const google: any;

/**
 * Quick environment check used to decide whether to render the GSI button.
 * GSI / FedCM is only reliable in top-level browser tabs on Chromium-based
 * browsers. We hide the button in any of these cases instead of showing the
 * user a broken UI:
 *   - Installed PWA running in standalone mode (no Web Identity access)
 *   - Inside an iframe (FedCM blocks cross-origin frames)
 *   - Brave (Shields block accounts.google.com by default)
 *   - Firefox / Safari (FedCM not generally available)
 *
 * Email/password remains the universal fallback for everyone else.
 */
export function isGsiEnvironmentSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined') return false;

  // Installed PWA standalone mode — multiple ways browsers report it.
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return false;
    if ((window.navigator as any).standalone === true) return false;
  } catch { /* ignore matchMedia issues */ }

  // Inside iframe — FedCM blocks third-party frames.
  if (window.self !== window.top) return false;

  const ua = navigator.userAgent;
  // Brave exposes a sync `brave` property on navigator
  if ((navigator as any).brave?.isBrave) return false;
  // Firefox — FedCM is behind a flag and frequently off
  if (/Firefox/.test(ua)) return false;
  // Safari (any iOS browser is Safari under the hood too) — no FedCM support
  if (/^((?!chrome|android|edg).)*safari/i.test(ua)) return false;

  return true;
}

export interface GsiOptions {
  clientId: string;
  element: HTMLElement;
  /** Called with the raw Google ID token (JWT) once the user picks an account. */
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  /** Approximate render width in pixels — GSI accepts a string. */
  width?: number;
}

/**
 * Initialise GSI and render a sign-in button into `element`. Returns when
 * rendering is complete; throws if the GSI script never loads.
 */
export async function renderGsiButton(opts: GsiOptions): Promise<void> {
  await waitForGsi();
  // GSI's internal module init is async even after `google.accounts.id` is
  // defined. On a cold page-load `renderButton` may throw or no-op on the
  // first try, so retry a couple of times with a short backoff.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      google.accounts.id.initialize({
        client_id: opts.clientId,
        callback: (resp: { credential: string }) => opts.onCredential(resp.credential),
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      // Match the rendered button width to the host container so it never
      // exceeds the surrounding form. GSI clamps width to [200, 400] and only
      // accepts a string of pixels.
      const measured = opts.element.clientWidth;
      const targetWidth = Math.max(200, Math.min(400, opts.width ?? (measured || 280)));
      google.accounts.id.renderButton(opts.element, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: opts.text ?? 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: String(targetWidth),
      });
      // Give GSI a tick to actually inject the iframe; if it didn't, retry.
      await new Promise(r => setTimeout(r, 150));
      if (opts.element.querySelector('iframe, [role="button"]')) return;
      lastErr = new Error('GSI renderButton produced no iframe');
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
  }
  throw lastErr;
}

function waitForGsi(timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (typeof google !== 'undefined' && google?.accounts?.id) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Google Identity Services failed to load'));
      setTimeout(check, 100);
    };
    check();
  });
}
