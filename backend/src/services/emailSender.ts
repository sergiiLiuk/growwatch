import { Resend } from 'resend';

export type EmailLocale = 'en' | 'da';

let resend: Resend | null = null;

function getClient(): Resend | null {
    if (resend) return resend;
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    resend = new Resend(key);
    return resend;
}

const FROM = process.env.FROM_EMAIL ?? 'GrowWatch <no-reply@growwatch.app>';

const COPY: Record<EmailLocale, { subject: string; heading: string; body: string; cta: string; footer: string }> = {
    en: {
        subject: 'Reset your GrowWatch password',
        heading: 'Reset your password',
        body: "Someone (hopefully you) asked to reset the password for your GrowWatch account. Click the button below to choose a new one. The link works for one hour.",
        cta: 'Reset password',
        footer: "If you didn't request this, you can safely ignore this email — your password stays the same.",
    },
    da: {
        subject: 'Nulstil din GrowWatch-adgangskode',
        heading: 'Nulstil din adgangskode',
        body: 'Nogen (forhåbentlig dig) har bedt om at nulstille adgangskoden til din GrowWatch-konto. Klik på knappen nedenfor for at vælge en ny. Linket virker i én time.',
        cta: 'Nulstil adgangskode',
        footer: 'Hvis det ikke var dig, kan du ignorere denne e-mail — din adgangskode bliver ikke ændret.',
    },
};

function renderHtml(locale: EmailLocale, resetUrl: string): string {
    const c = COPY[locale];
    return `<!DOCTYPE html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#15803d;">GrowWatch</h1>
          <h2 style="margin:0 0 16px;font-size:18px;font-weight:500;">${c.heading}</h2>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${c.body}</p>
          <p style="margin:0 0 24px;">
            <a href="${resetUrl}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">${c.cta}</a>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b7280;">${c.footer}</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;word-break:break-all;">${resetUrl}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderText(locale: EmailLocale, resetUrl: string): string {
    const c = COPY[locale];
    return `${c.heading}\n\n${c.body}\n\n${c.cta}: ${resetUrl}\n\n${c.footer}`;
}

/**
 * Sends a password reset email via Resend. Falls back to a console log if
 * RESEND_API_KEY is not configured (useful in local dev).
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string, locale: EmailLocale = 'da'): Promise<void> {
    const client = getClient();
    if (!client) {
        console.log('────────── [STUB EMAIL] Password reset ──────────');
        console.log(`To:      ${email}`);
        console.log(`Locale:  ${locale}`);
        console.log(`Link:    ${resetUrl}`);
        console.log('(RESEND_API_KEY not set — set it in env to send real email)');
        console.log('─────────────────────────────────────────────────');
        return;
    }
    const c = COPY[locale];
    const { error } = await client.emails.send({
        from: FROM,
        to: email,
        subject: c.subject,
        html: renderHtml(locale, resetUrl),
        text: renderText(locale, resetUrl),
    });
    if (error) {
        console.error('Resend send failed:', error);
        throw new Error('Failed to send password reset email');
    }
}
