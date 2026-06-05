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

interface EmailCopy {
    subject: string;
    heading: string;
    body: string;
    cta: string;
    footer: string;
}

const RESET_COPY: Record<EmailLocale, EmailCopy> = {
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

const VERIFY_COPY: Record<EmailLocale, EmailCopy> = {
    en: {
        subject: 'Confirm your GrowWatch email',
        heading: 'Confirm your email',
        body: 'Welcome to GrowWatch! Tap the button below to confirm this is your email address. The link works for 24 hours.',
        cta: 'Confirm email',
        footer: "If you didn't sign up for GrowWatch, you can ignore this email.",
    },
    da: {
        subject: 'Bekræft din GrowWatch-e-mail',
        heading: 'Bekræft din e-mail',
        body: 'Velkommen til GrowWatch! Tryk på knappen nedenfor for at bekræfte, at dette er din e-mailadresse. Linket virker i 24 timer.',
        cta: 'Bekræft e-mail',
        footer: 'Hvis du ikke har oprettet en GrowWatch-konto, kan du ignorere denne e-mail.',
    },
};

function renderHtml(c: EmailCopy, locale: EmailLocale, url: string): string {
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
            <a href="${url}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">${c.cta}</a>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b7280;">${c.footer}</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;word-break:break-all;">${url}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderText(c: EmailCopy, url: string): string {
    return `${c.heading}\n\n${c.body}\n\n${c.cta}: ${url}\n\n${c.footer}`;
}

async function sendOrStub(label: string, email: string, locale: EmailLocale, url: string, c: EmailCopy): Promise<void> {
    const client = getClient();
    if (!client) {
        console.log(`────────── [STUB EMAIL] ${label} ──────────`);
        console.log(`To:      ${email}`);
        console.log(`Locale:  ${locale}`);
        console.log(`Link:    ${url}`);
        console.log('(RESEND_API_KEY not set — set it in env to send real email)');
        console.log('─────────────────────────────────────────────────');
        return;
    }
    const { error } = await client.emails.send({
        from: FROM,
        to: email,
        subject: c.subject,
        html: renderHtml(c, locale, url),
        text: renderText(c, url),
    });
    if (error) {
        console.error(`Resend ${label} send failed:`, error);
        throw new Error(`Failed to send ${label.toLowerCase()} email`);
    }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string, locale: EmailLocale = 'da'): Promise<void> {
    await sendOrStub('Password reset', email, locale, resetUrl, RESET_COPY[locale]);
}

export async function sendEmailVerificationEmail(email: string, verifyUrl: string, locale: EmailLocale = 'da'): Promise<void> {
    await sendOrStub('Email verification', email, locale, verifyUrl, VERIFY_COPY[locale]);
}
