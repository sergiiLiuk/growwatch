/**
 * Tiny wrapper around the Google Identity Services button. The GSI script is
 * loaded once from index.html with `async defer`, so on the first auth-page
 * visit it may not be ready yet — we poll until `google.accounts.id` exists.
 */
declare const google: any;

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
  google.accounts.id.initialize({
    client_id: opts.clientId,
    callback: (resp: { credential: string }) => opts.onCredential(resp.credential),
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  google.accounts.id.renderButton(opts.element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: opts.text ?? 'continue_with',
    shape: 'pill',
    logo_alignment: 'left',
    width: String(opts.width ?? 320),
  });
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
