import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Kodi collects, uses, and protects your information.',
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
      <header className="mb-12">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Legal
        </p>
        <h1 className="text-4xl tracking-[-0.05em]">Privacy Policy</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated: April 2026
        </p>
      </header>

      <div className="prose-legal">
        <LegalSection title="1. Introduction">
          <p>
            Kodi (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) takes your
            privacy seriously. This Privacy Policy explains how we collect, use, disclose,
            and safeguard your information when you use the Kodi service.
          </p>
        </LegalSection>

        <LegalSection title="2. Information we collect">
          <p>We collect information you provide directly, including:</p>
          <ul>
            <li>Account information such as name and email address</li>
            <li>Meeting audio and transcription data processed with your authorization</li>
            <li>Integration credentials and OAuth tokens for connected tools</li>
            <li>Usage data and interaction logs within the Kodi service</li>
          </ul>
        </LegalSection>

        <LegalSection title="3. How we use your information">
          <p>We use collected information to:</p>
          <ul>
            <li>Provide, operate, and improve the Kodi service</li>
            <li>Process meeting context and generate follow-through actions you authorize</li>
            <li>Communicate with you about your account and service changes</li>
            <li>Ensure security, prevent fraud, and comply with legal obligations</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Data sharing">
          <p>
            We do not sell your personal data. We share data only with service providers
            necessary to deliver the Kodi service, and only to the extent necessary for
            that purpose. We may disclose information when required by law.
          </p>
        </LegalSection>

        <LegalSection title="5. Data retention">
          <p>
            We retain your data for as long as your account is active or as needed to
            provide services. You may request deletion of your data at any time by
            contacting us.
          </p>
        </LegalSection>

        <LegalSection title="6. Security">
          <p>
            We implement appropriate technical and organizational measures to protect your
            information. No transmission over the internet is completely secure, and we
            cannot guarantee absolute security.
          </p>
        </LegalSection>

        <LegalSection title="7. Your rights">
          <p>
            Depending on your location, you may have rights to access, correct, delete, or
            port your personal data, or to object to certain processing. Contact us to
            exercise these rights.
          </p>
        </LegalSection>

        <LegalSection title="8. Contact">
          <p>
            For privacy questions or requests, contact us at{' '}
            <a href="mailto:privacy@kodi.so" className="text-foreground underline underline-offset-4">
              privacy@kodi.so
            </a>
            .
          </p>
        </LegalSection>
      </div>
    </div>
  )
}

function LegalSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10 border-b border-border/50 pb-10 last:border-0 last:pb-0">
      <h2 className="mb-4 text-lg tracking-[-0.03em]">{title}</h2>
      <div className="space-y-3 text-sm leading-8 text-muted-foreground [&_a]:text-foreground [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  )
}
