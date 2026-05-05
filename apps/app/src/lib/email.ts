import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY)
  return resendClient
}

const FROM = 'Kodi <noreply@kodi.so>'

export async function sendMagicLinkEmail({
  email,
  url,
}: {
  email: string
  url: string
}): Promise<void> {
  const resend = getResend()

  if (!resend) {
    console.log(`[DEV] Magic link for ${email}: ${url}`)
    return
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Your Kodi sign-in link',
    html: magicLinkHtml(url),
  })

  if (error) {
    throw new Error(`Failed to send magic link email: ${error.message}`)
  }
}

function magicLinkHtml(url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to Kodi</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#12121a;border-radius:12px;border:1px solid #2a2a3a;padding:48px 40px;width:100%;max-width:520px;">

          <!-- Logo / wordmark -->
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Kodi</span>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom:12px;">
              <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;line-height:1.3;">
                Your sign-in link
              </h1>
            </td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:15px;line-height:1.65;color:#a0a0b8;">
                Click the button below to sign in to Kodi. This link expires in
                <strong style="color:#e5e5e5;">10 minutes</strong> and can only be used once.
              </p>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="padding-bottom:32px;">
              <a href="${url}"
                 style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;
                        font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px;
                        letter-spacing:0.01em;">
                Sign in to Kodi
              </a>
            </td>
          </tr>

          <!-- Fallback URL -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#666680;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#6366f1;word-break:break-all;">
                ${url}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #2a2a3a;padding-top:24px;">
              <p style="margin:0;font-size:13px;color:#666680;line-height:1.5;">
                If you didn't request this link, you can safely ignore this email.
                Someone may have entered your email address by mistake.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
