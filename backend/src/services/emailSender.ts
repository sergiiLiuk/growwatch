/**
 * Email sending shim.
 *
 * STUB IMPLEMENTATION: logs to console only — no real delivery.
 * TODO: replace with Resend integration once DNS records on growwatch.dk
 * are verified and RESEND_API_KEY is set. The function signature should not
 * need to change — only the body of sendPasswordResetEmail.
 *
 * Drop-in replacement sketch:
 *   const resend = new Resend(process.env.RESEND_API_KEY);
 *   await resend.emails.send({
 *     from: 'no-reply@growwatch.dk',
 *     to: email,
 *     subject: '...',
 *     html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
 *   });
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    console.log('────────── [STUB EMAIL] Password reset ──────────');
    console.log(`To:      ${email}`);
    console.log(`Link:    ${resetUrl}`);
    console.log(`Expires: 1 hour from now`);
    console.log('─────────────────────────────────────────────────');
}
