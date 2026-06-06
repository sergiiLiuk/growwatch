/**
 * Tiny wrapper around the Google Identity Services button. The GSI script is
 * loaded once from index.html with `async defer`, so on the first auth-page
 * visit it may not be ready yet — we poll until `google.accounts.id` exists.
 */
declare const google: any;

/**
 * Whether the current environment can host a GSI button at all. Currently
 * we let every browser try — if GSI fails to render or fails to authenticate
 * on a given platform, the calling component shows a small "sign-in failed"
 * notice and the email/password form still works.
 *
 * We only short-circuit for non-browser contexts (SSR) and cross-origin
 * iframes (where FedCM is fundamentally blocked by the browser).
 */
export function isGsiEnvironmentSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined') return false;
  // Inside an iframe — FedCM blocks third-party frames at the browser level.
  if (window.self !== window.top) return false;
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
