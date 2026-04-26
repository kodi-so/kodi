import { ArrowLeft } from 'lucide-react'
import { BrandLogo } from '@kodi/ui/components/brand-logo'

export const metadata = {
  title: 'Terms of Service — Kodi',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border/70 pt-8">
      <h2 className="text-xl tracking-[-0.03em] text-foreground">{title}</h2>
      <div className="space-y-3 text-base leading-7 text-muted-foreground">{children}</div>
    </section>
  )
}

export default function TermsPage() {
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
          <h1 className="mt-3 text-4xl tracking-[-0.05em]">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="mt-8 space-y-8">
          <p className="text-base leading-7 text-muted-foreground">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Kodi&apos;s services,
            including our web application, AI meeting assistant, and integrations (collectively, the &ldquo;Service&rdquo;),
            operated by Kodi (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;).
            By using the Service, you agree to these Terms.
          </p>

          <Section title="Acceptance of terms">
            <p>
              By creating an account or using the Service, you agree to be bound by these Terms and our
              Privacy Policy. If you are using the Service on behalf of an organization, you represent that
              you have authority to bind that organization to these Terms.
            </p>
            <p>
              If you do not agree to these Terms, do not access or use the Service.
            </p>
          </Section>

          <Section title="Description of service">
            <p>
              Kodi is an AI-powered assistant that joins your calls, captures decisions and context,
              and deploys agents to complete follow-up work in your connected tools. The Service includes:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Real-time AI assistance during meetings and calls</li>
              <li>Automated creation of tickets, summaries, messages, and documents</li>
              <li>Integration with third-party tools at your direction</li>
              <li>A web application for managing your workspace and settings</li>
            </ul>
          </Section>

          <Section title="Account registration and eligibility">
            <p>
              You must be at least 18 years old to use the Service. You agree to provide accurate,
              current, and complete information when creating your account, and to keep that information updated.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for
              all activity that occurs under your account. Notify us immediately at{' '}
              <a href="mailto:support@kodi.so" className="text-foreground underline underline-offset-2">
                support@kodi.so
              </a>{' '}
              if you suspect unauthorized access.
            </p>
          </Section>

          <Section title="Acceptable use">
            <p>You agree to use the Service lawfully and in accordance with these Terms. You may not:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Use the Service to record or process meetings without the knowledge and consent of all participants, where required by applicable law</li>
              <li>Use the Service to collect, store, or process information in violation of applicable privacy laws</li>
              <li>Attempt to reverse engineer, decompile, or extract the source code of the Service</li>
              <li>Use the Service to send spam, conduct phishing attacks, or distribute malware</li>
              <li>Circumvent or attempt to circumvent any usage limits, security measures, or access controls</li>
              <li>Resell, sublicense, or otherwise commercialize access to the Service without our written consent</li>
              <li>Use the Service in any way that could damage, disable, or impair our infrastructure</li>
            </ul>
            <p>
              You are solely responsible for ensuring you have the necessary rights and consents to process
              any meetings, conversations, or data through the Service.
            </p>
          </Section>

          <Section title="Meeting and conversation data">
            <p>
              You retain ownership of all meeting content, transcripts, and company data you provide to or
              generate through Kodi. By using the Service, you grant us a limited license to process that
              data solely to provide and improve the Service for you.
            </p>
            <p>
              You represent that you have the right to share any data you provide to the Service, including
              obtaining any necessary consents from meeting participants before enabling Kodi on a call.
            </p>
          </Section>

          <Section title="AI-generated content">
            <p>
              The Service uses AI to generate summaries, action items, messages, tickets, and other content.
              This content is generated automatically and may contain errors or omissions. You are responsible
              for reviewing AI-generated content before relying on it or sharing it externally.
            </p>
            <p>
              AI-generated content does not constitute legal, financial, medical, or professional advice.
              We make no warranty that outputs are accurate, complete, or suitable for any particular purpose.
            </p>
          </Section>

          <Section title="Agent actions and guardrails">
            <p>
              Kodi can take actions in your connected tools on your behalf, such as creating tickets,
              drafting messages, or updating documents. You control the scope of these actions through
              your workspace settings.
            </p>
            <p>
              You acknowledge that agent actions are taken at your direction and within limits you configure.
              We are not responsible for the consequences of agent actions that you have authorized.
              We recommend configuring appropriate guardrails and reviewing agent activity regularly.
            </p>
          </Section>

          <Section title="Third-party integrations">
            <p>
              The Service integrates with third-party tools (Slack, Linear, Notion, HubSpot, and others).
              Your use of those tools is governed by their respective terms and privacy policies.
              We are not responsible for the availability, accuracy, or conduct of third-party services.
            </p>
            <p>
              By connecting a third-party tool, you authorize us to access and act within that tool on
              your behalf to the extent necessary to provide the Service.
            </p>
          </Section>

          <Section title="Billing and subscriptions">
            <p>
              Access to certain features requires a paid subscription. By subscribing, you authorize us
              to charge your payment method on a recurring basis at the then-current subscription price.
            </p>
            <p>
              You may cancel your subscription at any time. Cancellation takes effect at the end of the
              current billing period and you will retain access through that date. We do not provide
              refunds for unused portions of a subscription period except where required by law.
            </p>
            <p>
              We reserve the right to change subscription pricing with at least 30 days&apos; notice.
              Continued use after the price change constitutes acceptance.
            </p>
          </Section>

          <Section title="Intellectual property">
            <p>
              The Service, including its design, code, and AI models, is owned by Kodi and protected by
              applicable intellectual property laws. Nothing in these Terms grants you any rights in
              the Service except as expressly set out here.
            </p>
            <p>
              You retain all rights to your data. You grant us no rights to your data beyond what is
              necessary to provide the Service.
            </p>
          </Section>

          <Section title="Disclaimer of warranties">
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
              FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              We do not warrant that the Service will be uninterrupted, error-free, or that AI-generated
              content will be accurate or complete.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, KODI SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS,
              DATA, OR GOODWILL, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE.
            </p>
            <p>
              OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE
              GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS PRIOR TO THE CLAIM OR (B) $100.
            </p>
          </Section>

          <Section title="Indemnification">
            <p>
              You agree to indemnify and hold Kodi harmless from any claims, damages, or expenses
              (including reasonable legal fees) arising from your use of the Service, your violation of
              these Terms, or your violation of any applicable law or third-party rights.
            </p>
          </Section>

          <Section title="Termination">
            <p>
              You may stop using the Service and close your account at any time from your account settings
              or by contacting us.
            </p>
            <p>
              We reserve the right to suspend or terminate your access to the Service at our discretion,
              with or without notice, if we believe you have violated these Terms or for any other legitimate
              business reason. Upon termination, your right to use the Service ceases immediately.
            </p>
          </Section>

          <Section title="Governing law and disputes">
            <p>
              These Terms are governed by the laws of the State of Delaware, without regard to conflict of
              law principles. Any disputes arising from these Terms or your use of the Service shall be
              resolved by binding arbitration in accordance with the rules of the American Arbitration
              Association, except that either party may seek injunctive relief in a court of competent
              jurisdiction.
            </p>
          </Section>

          <Section title="Changes to these terms">
            <p>
              We may update these Terms from time to time. We will notify you of material changes by email
              or through a notice in the application at least 14 days before the change takes effect.
              Your continued use of the Service after the effective date constitutes acceptance of the
              updated Terms.
            </p>
          </Section>

          <Section title="Contact us">
            <p>If you have questions about these Terms, please contact us:</p>
            <ul className="list-none space-y-1">
              <li>
                Email:{' '}
                <a href="mailto:legal@kodi.so" className="text-foreground underline underline-offset-2">
                  legal@kodi.so
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
