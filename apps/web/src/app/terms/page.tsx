import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing your use of the Kodi service.',
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
      <header className="mb-12">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Legal
        </p>
        <h1 className="text-4xl tracking-[-0.05em]">Terms of Service</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated: April 2026
        </p>
      </header>

      <div>
        <LegalSection title="1. Acceptance of terms">
          <p>
            By accessing or using the Kodi service, you agree to be bound by these Terms
            of Service. If you do not agree to these terms, you may not use the service.
          </p>
        </LegalSection>

        <LegalSection title="2. Description of service">
          <p>
            Kodi provides an AI-powered meeting assistant that joins meetings, processes
            audio and context with your authorization, and can perform follow-through
            actions in connected third-party tools at the autonomy levels you configure.
          </p>
        </LegalSection>

        <LegalSection title="3. Account responsibilities">
          <p>You are responsible for:</p>
          <ul>
            <li>Maintaining the security of your account credentials</li>
            <li>All activity that occurs under your account</li>
            <li>Ensuring you have appropriate authorization before connecting team tools</li>
            <li>Complying with applicable laws when using the service</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Acceptable use">
          <p>You agree not to:</p>
          <ul>
            <li>Use the service in violation of any law or regulation</li>
            <li>Record or process meetings without appropriate participant consent</li>
            <li>Attempt to gain unauthorized access to systems or data</li>
            <li>Interfere with the service&apos;s integrity or performance</li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Integrations and third-party tools">
          <p>
            Kodi connects to third-party tools through OAuth and API integrations.
            Your use of those tools is governed by their respective terms of service.
            Kodi is not responsible for the availability or behavior of third-party tools.
          </p>
        </LegalSection>

        <LegalSection title="6. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Kodi shall not be liable for any
            indirect, incidental, special, or consequential damages arising from your use
            of the service. Our total liability for any claim shall not exceed the amounts
            you paid to Kodi in the twelve months preceding the claim.
          </p>
        </LegalSection>

        <LegalSection title="7. Changes to terms">
          <p>
            We may update these terms from time to time. We will notify you of material
            changes via email or a prominent notice in the service. Continued use after
            changes constitutes acceptance of the updated terms.
          </p>
        </LegalSection>

        <LegalSection title="8. Contact">
          <p>
            Questions about these terms? Contact us at{' '}
            <a href="mailto:legal@kodi.so" className="text-foreground underline underline-offset-4">
              legal@kodi.so
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
