import { ArrowLeft } from 'lucide-react'
import { BrandLogo } from '@kodi/ui/components/brand-logo'

export const metadata = {
  title: 'Privacy Policy — Kodi',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border/70 pt-8">
      <h2 className="text-xl tracking-[-0.03em] text-foreground">{title}</h2>
      <div className="space-y-3 text-base leading-7 text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-5 sm:px-6 lg:px-8">

        <nav className="flex items-center justify-between border-b border-border/80 pb-5">
          <BrandLogo size={34} />
          <a
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back to home
          </a>
        </nav>

        <div className="mt-12">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
          <h1 className="mt-3 text-4xl tracking-[-0.05em]">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="mt-8 space-y-8">
          <p className="text-base leading-7 text-muted-foreground">
            Kodi (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, and share information when you use our services,
            including our AI meeting assistant, web application, and any related integrations.
          </p>

          <Section title="Information we collect">
            <p>We collect information you provide directly, information generated through your use of the service, and information from the third-party tools you connect.</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-foreground">Account information:</span> Name, email address, organization name, and billing details when you register.
              </li>
              <li>
                <span className="font-medium text-foreground">Meeting and conversation data:</span> Audio, transcripts, and metadata from calls you connect Kodi to. We only process meetings where Kodi has been explicitly enabled.
              </li>
              <li>
                <span className="font-medium text-foreground">Company context:</span> Documents, records, and other information you choose to provide to give Kodi context about your organization.
              </li>
              <li>
                <span className="font-medium text-foreground">Integration data:</span> Information from connected tools (Slack, Linear, Notion, etc.) necessary to perform actions on your behalf.
              </li>
              <li>
                <span className="font-medium text-foreground">Usage data:</span> Log data, feature usage, and performance information collected automatically to operate and improve the service.
              </li>
            </ul>
          </Section>

          <Section title="How we use your information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide, operate, and improve the Kodi service</li>
              <li>Process meeting transcripts and generate summaries, action items, and follow-ups</li>
              <li>Execute authorized agent actions within your connected tools</li>
              <li>Answer questions using your organization&apos;s context</li>
              <li>Send service communications, billing notices, and product updates</li>
              <li>Detect and prevent fraud, abuse, and security incidents</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p>
              We do not use your meeting content or company data to train general-purpose AI models shared across customers.
              AI processing of your data is used solely to deliver your Kodi experience.
            </p>
          </Section>

          <Section title="Information sharing">
            <p>We do not sell your personal information. We share information only in the following circumstances:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-foreground">Third-party integrations:</span> When you authorize Kodi to act within a tool (e.g., create a Linear ticket), we share the minimum necessary information with that service.
              </li>
              <li>
                <span className="font-medium text-foreground">AI infrastructure providers:</span> We use third-party AI providers to process language. These providers are contractually prohibited from using your data to train their models.
              </li>
              <li>
                <span className="font-medium text-foreground">Service providers:</span> We share information with vendors who help us operate the service (hosting, payments, analytics) under strict data processing agreements.
              </li>
              <li>
                <span className="font-medium text-foreground">Legal requirements:</span> We may disclose information when required by law or to protect the rights and safety of Kodi, our users, or the public.
              </li>
              <li>
                <span className="font-medium text-foreground">Business transfers:</span> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.
              </li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We retain your data for as long as your account is active or as needed to provide the service.
              Meeting transcripts and generated content are retained for the period specified in your subscription plan.
              You may request deletion of your data at any time by contacting us.
            </p>
            <p>
              When you delete your account, we will delete or anonymize your personal information within 30 days,
              except where retention is required by law or legitimate business purposes (such as fraud prevention or financial records).
            </p>
          </Section>

          <Section title="Security">
            <p>
              We implement industry-standard security measures including encryption in transit and at rest,
              access controls, and regular security reviews. However, no system is completely secure,
              and we cannot guarantee absolute security of your information.
            </p>
            <p>
              If you believe your account or data has been compromised, please contact us immediately at{' '}
              <a href="mailto:security@kodi.so" className="text-foreground underline underline-offset-2">
                security@kodi.so
              </a>.
            </p>
          </Section>

          <Section title="Third-party integrations">
            <p>
              Kodi connects to tools like Slack, Linear, Notion, HubSpot, and others at your direction.
              When you authorize an integration, you are subject to that third party&apos;s privacy policy in addition to ours.
              We recommend reviewing the privacy practices of any tools you connect.
            </p>
            <p>
              You can revoke Kodi&apos;s access to any integration at any time from your account settings or
              directly through the connected service.
            </p>
          </Section>

          <Section title="Cookies and tracking">
            <p>
              We use cookies and similar technologies to operate the service, maintain your session,
              and understand how the product is used. We do not use third-party advertising cookies.
            </p>
            <p>
              You can configure your browser to refuse cookies, but some features of the service may not
              function correctly without them.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Depending on your location, you may have rights regarding your personal information, including:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Access to the personal information we hold about you</li>
              <li>Correction of inaccurate or incomplete information</li>
              <li>Deletion of your personal information</li>
              <li>Restriction or objection to certain processing</li>
              <li>Data portability (receiving a copy of your data in a machine-readable format)</li>
              <li>Withdrawal of consent where processing is based on consent</li>
            </ul>
            <p>
              To exercise these rights, contact us at{' '}
              <a href="mailto:privacy@kodi.so" className="text-foreground underline underline-offset-2">
                privacy@kodi.so
              </a>. We will respond within 30 days.
            </p>
          </Section>

          <Section title="Children's privacy">
            <p>
              Kodi is not directed to children under 16. We do not knowingly collect personal information
              from children. If we become aware that a child has provided us with personal information,
              we will delete it promptly.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes
              by email or through a notice in the application at least 14 days before the change takes effect.
              Your continued use of Kodi after the effective date constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              If you have questions about this Privacy Policy or how we handle your data, please contact us:
            </p>
            <ul className="list-none space-y-1">
              <li>
                Email:{' '}
                <a href="mailto:privacy@kodi.so" className="text-foreground underline underline-offset-2">
                  privacy@kodi.so
                </a>
              </li>
              <li>Website: kodi.so</li>
            </ul>
          </Section>
        </div>

      </div>
    </main>
  )
}
