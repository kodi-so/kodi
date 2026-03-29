import { Badge, Button, Card, CardContent } from '@kodi/ui'

const integrations = [
  'Zoom',
  'Google Meet',
  'Slack',
  'Microsoft Teams',
  'Linear',
  'Jira',
  'Notion',
  'HubSpot',
]

const valueCards = [
  {
    eyebrow: 'Decision capture',
    title: 'Leave the meeting with work already moving.',
    body: 'Kodi tracks decisions, owners, blockers, and open questions while your team is still talking, so nothing relies on memory after the call ends.',
  },
  {
    eyebrow: 'Live business context',
    title: 'Answer the hard question before the room goes quiet.',
    body: 'Ask Kodi about roadmap status, customer history, team capacity, or blockers and get an answer grounded in the systems your team already trusts.',
  },
  {
    eyebrow: 'Execution across tools',
    title: 'Delegate follow-through without changing your stack.',
    body: 'Create tickets, send recaps, update docs, and push next steps into the tools your team already uses instead of adding another workflow to manage.',
  },
]

const roleCards = [
  {
    role: 'Founders',
    body: 'Stay inside the critical conversations without becoming the person who has to remember every decision afterward.',
  },
  {
    role: 'Ops leaders',
    body: 'Turn recurring meetings into reliable systems with cleaner handoffs, better visibility, and less manual cleanup.',
  },
  {
    role: 'Team leads',
    body: 'Give people instant answers, clearer ownership, and one shared source of truth across meetings, chat, and tickets.',
  },
]

const workflowSteps = [
  {
    step: '01',
    title: 'Connect the tools your team already relies on',
    body: 'Meetings, chat, docs, ticketing, and the internal systems your people use every day all become part of the same context layer.',
    detail: 'Fast setup',
  },
  {
    step: '02',
    title: 'Bring Kodi into the conversation',
    body: 'Kodi joins calls, listens for decisions, and answers live questions with business context when your team needs clarity in the moment.',
    detail: 'Live support',
  },
  {
    step: '03',
    title: 'Let the agent carry the work forward',
    body: 'Recaps, tickets, ownership, and next steps are pushed into the right tools so the meeting actually turns into execution.',
    detail: 'Automatic follow-through',
  },
]

const starterFeatures = [
  'Up to 5 team members',
  'Dedicated Kodi instance',
  'Meeting and messaging integrations',
  'Live answers with business context',
  'Auto-created tasks and recaps',
  '14-day free trial',
]

const proFeatures = [
  'Unlimited team members',
  'Everything in Starter',
  'Advanced workflow automation',
  'Priority model capacity',
  'Expanded tool integrations',
  'Priority support',
]

export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <div className="site-root">
      <div className="page-glow page-glow-left" aria-hidden="true" />
      <div className="page-glow page-glow-right" aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />

      <nav className="site-nav">
        <div className="nav-shell">
          <a href="#" className="brand-lockup" aria-label="Kodi home">
            <span className="brand-mark">K</span>
            <span className="brand-wordmark">Kodi</span>
          </a>

          <div className="nav-links">
            <a href="#features" className="nav-link">
              Why Kodi
            </a>
            <a href="#how-it-works" className="nav-link">
              How it works
            </a>
            <a href="#pricing" className="nav-link">
              Pricing
            </a>
          </div>

          <div className="nav-actions">
            <a href="mailto:hello@kodi.so" className="nav-text-link">
              Book a walkthrough
            </a>
            <Button asChild className="cta-button nav-cta">
              <a href={appUrl}>Start free trial</a>
            </Button>
          </div>
        </div>
      </nav>

      <main>
        <section className="hero-section">
          <div className="section-shell hero-shell">
            <div className="hero-copy">
              <Badge className="hero-badge border-0">
                Built for startups and SMB teams
              </Badge>

              <p className="hero-kicker">
                AI teammate for meetings and follow-through
              </p>

              <h1 className="hero-title">
                Bring an AI teammate
                <span className="hero-highlight"> into every call.</span>
              </h1>

              <p className="hero-body">
                Kodi listens, answers with live business context, and turns
                decisions into assigned work across the tools your team already
                uses.
              </p>

              <div className="hero-actions">
                <Button asChild className="cta-button cta-button-lg">
                  <a href={appUrl}>Start your 14-day trial</a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="secondary-button cta-button-lg"
                >
                  <a href="mailto:hello@kodi.so">Book a walkthrough</a>
                </Button>
              </div>

              <div className="hero-proof-points">
                <span>Launch in under 5 minutes</span>
                <span>No credit card required</span>
                <span>No seat-based pricing</span>
              </div>
            </div>

            <div className="hero-panel-wrap">
              <div className="hero-panel">
                <div className="panel-topbar">
                  <div>
                    <p className="panel-label">Weekly operating review</p>
                    <h2 className="panel-title">Kodi is in the room</h2>
                  </div>
                  <div className="live-pill">
                    <span className="live-dot" />
                    Live
                  </div>
                </div>

                <div className="panel-summary">
                  <div className="summary-copy">
                    <p className="summary-label">Conversation captured</p>
                    <p className="summary-headline">
                      3 decisions, 2 risks, 4 follow-ups already mapped.
                    </p>
                  </div>
                  <div className="summary-stats">
                    <div className="summary-stat">
                      <strong>Jira</strong>
                      <span>2 drafts ready</span>
                    </div>
                    <div className="summary-stat">
                      <strong>Slack</strong>
                      <span>Recap queued</span>
                    </div>
                    <div className="summary-stat">
                      <strong>Notion</strong>
                      <span>Notes synced</span>
                    </div>
                  </div>
                </div>

                <div className="panel-grid">
                  <div className="panel-card panel-card-ink">
                    <p className="panel-card-label">Asked in the meeting</p>
                    <p className="panel-card-title">
                      Can we still ship by Friday?
                    </p>
                    <p className="panel-card-body">
                      Current sprint load is at 78%. Payments QA is the blocker.
                      Kodi recommends pushing analytics cleanup to next week.
                    </p>
                  </div>

                  <div className="panel-card panel-card-warm">
                    <p className="panel-card-label">What Kodi is doing next</p>
                    <ul className="task-list">
                      <li>Create launch tasks in Linear</li>
                      <li>Send owner recap to Slack</li>
                      <li>Update the rollout doc in Notion</li>
                    </ul>
                  </div>
                </div>

                <div className="tool-row">
                  {integrations.map((tool) => (
                    <span key={tool} className="tool-pill">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="integration-band">
          <div className="section-shell integration-shell">
            <p className="band-label">
              Connects to the stack your team already uses
            </p>
            <div className="integration-row">
              {integrations.map((tool) => (
                <span key={tool} className="integration-name">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="section-block">
          <div className="section-shell">
            <div className="section-head">
              <p className="section-kicker">Why teams convert on Kodi</p>
              <h2 className="section-title">
                Better than another note taker. Better than another dashboard.
              </h2>
              <p className="section-body">
                Startups and SMB teams do not need more software to maintain.
                They need one agent that can stay in the conversation and move
                the work forward after it ends.
              </p>
            </div>

            <div className="value-grid">
              {valueCards.map((card, index) => (
                <Card
                  key={card.title}
                  className={`value-card ${index === 0 ? 'value-card-featured' : ''}`}
                >
                  <CardContent className="value-card-content">
                    <p className="value-eyebrow">{card.eyebrow}</p>
                    <h3 className="value-title">{card.title}</h3>
                    <p className="value-body">{card.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="role-grid">
              {roleCards.map((card) => (
                <div key={card.role} className="role-card">
                  <p className="role-title">{card.role}</p>
                  <p className="role-body">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="section-block section-tinted">
          <div className="section-shell">
            <div className="section-head section-head-slim">
              <p className="section-kicker">How it works</p>
              <h2 className="section-title">
                Set it up once. Let Kodi stay on top of the work.
              </h2>
            </div>

            <div className="workflow-grid">
              {workflowSteps.map((step) => (
                <div key={step.step} className="workflow-card">
                  <div className="workflow-step">{step.step}</div>
                  <div className="workflow-detail">{step.detail}</div>
                  <h3 className="workflow-title">{step.title}</h3>
                  <p className="workflow-body">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="section-block">
          <div className="section-shell">
            <div className="section-head section-head-slim">
              <p className="section-kicker">Pricing</p>
              <h2 className="section-title">
                One shared agent. One team price.
              </h2>
              <p className="section-body">
                Simple pricing for lean teams that want to move faster without
                adding seat taxes or new operational overhead.
              </p>
            </div>

            <div className="pricing-grid">
              <Card className="pricing-card">
                <CardContent className="pricing-content">
                  <div className="pricing-tier">Starter</div>
                  <div className="pricing-amount-row">
                    <span className="pricing-amount">$49</span>
                    <span className="pricing-period">/month</span>
                  </div>
                  <p className="pricing-copy">
                    For teams getting their first shared AI teammate into calls
                    and follow-through.
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    className="secondary-button pricing-button"
                  >
                    <a href={appUrl}>Start free trial</a>
                  </Button>
                  <ul className="pricing-list">
                    {starterFeatures.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="pricing-card pricing-card-featured">
                <CardContent className="pricing-content">
                  <Badge className="pricing-badge border-0">Most popular</Badge>
                  <div className="pricing-tier">Pro</div>
                  <div className="pricing-amount-row">
                    <span className="pricing-amount">$99</span>
                    <span className="pricing-period">/month</span>
                  </div>
                  <p className="pricing-copy">
                    For teams ready to automate the handoff from conversation to
                    execution across their stack.
                  </p>
                  <Button asChild className="cta-button pricing-button">
                    <a href={appUrl}>Start free trial</a>
                  </Button>
                  <ul className="pricing-list">
                    {proFeatures.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="pricing-note">
              <span>14-day trial</span>
              <span>No credit card required</span>
              <span>
                Need a custom rollout?{' '}
                <a href="mailto:hello@kodi.so">Talk to us</a>
              </span>
            </div>
          </div>
        </section>

        <section className="section-block final-cta-section">
          <div className="section-shell">
            <div className="final-cta">
              <div className="final-cta-copy">
                <p className="section-kicker">
                  Ready to try it on a real call?
                </p>
                <h2 className="section-title">
                  Put Kodi in your next meeting and let it handle the aftermath.
                </h2>
                <p className="section-body">
                  Give your team clearer answers, cleaner handoffs, and one
                  shared agent that can work across the tools you already use.
                </p>
              </div>

              <div className="final-cta-actions">
                <Button asChild className="cta-button cta-button-lg">
                  <a href={appUrl}>Start your 14-day trial</a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="secondary-button cta-button-lg"
                >
                  <a href="mailto:hello@kodi.so">Book a walkthrough</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="section-shell footer-shell">
          <div className="brand-lockup footer-brand">
            <span className="brand-mark">K</span>
            <span className="brand-wordmark">Kodi</span>
          </div>
          <p className="footer-copy">
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span>{' '}
            Kodi. Built for teams that need an agent in the room.
          </p>
          <div className="footer-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="mailto:hello@kodi.so">Contact</a>
          </div>
        </div>
      </footer>

      <style>{`
        :root {
          --bg: oklch(97.6% 0.018 92);
          --bg-soft: oklch(95.7% 0.028 92);
          --surface: oklch(99.1% 0.008 92 / 0.88);
          --surface-strong: oklch(93.5% 0.035 88);
          --surface-ink: oklch(26% 0.028 255);
          --line: oklch(87.5% 0.02 92);
          --line-strong: oklch(79% 0.03 84);
          --text: oklch(24% 0.03 255);
          --text-soft: oklch(43% 0.028 255);
          --text-faint: oklch(58% 0.02 250);
          --accent: oklch(74% 0.16 68);
          --accent-strong: oklch(68% 0.18 62);
          --accent-ink: oklch(30% 0.04 48);
          --success: oklch(63% 0.12 168);
          --success-soft: oklch(92% 0.05 168);
          --shadow-soft: 0 18px 50px oklch(24% 0.03 255 / 0.08);
          --shadow-strong: 0 32px 80px oklch(24% 0.03 255 / 0.16);
          --radius-lg: 2rem;
          --radius-md: 1.25rem;
          --radius-sm: 0.85rem;
          --font-display: 'Plus Jakarta Sans', sans-serif;
          --font-body: 'IBM Plex Sans', sans-serif;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          background:
            radial-gradient(circle at top left, oklch(94.2% 0.055 86) 0%, transparent 28%),
            linear-gradient(180deg, oklch(98.1% 0.018 92) 0%, oklch(95.8% 0.025 92) 100%);
          color: var(--text);
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          overflow-x: hidden;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        button {
          font-family: inherit;
        }

        .site-root {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .page-glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(48px);
          opacity: 0.45;
          pointer-events: none;
        }

        .page-glow-left {
          top: 6rem;
          left: -10rem;
          width: 22rem;
          height: 22rem;
          background: oklch(88% 0.09 80 / 0.8);
        }

        .page-glow-right {
          top: 18rem;
          right: -10rem;
          width: 28rem;
          height: 28rem;
          background: oklch(86% 0.05 185 / 0.55);
        }

        .grid-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(to right, oklch(86% 0.014 92 / 0.45) 1px, transparent 1px),
            linear-gradient(to bottom, oklch(86% 0.014 92 / 0.45) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent 82%);
        }

        .section-shell,
        .nav-shell {
          width: min(1120px, calc(100vw - 2rem));
          margin: 0 auto;
        }

        .site-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          backdrop-filter: blur(18px);
          background: oklch(98.5% 0.008 92 / 0.76);
          border-bottom: 1px solid oklch(86% 0.02 92 / 0.8);
        }

        .nav-shell {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 1rem 0;
        }

        .brand-lockup {
          display: inline-flex;
          align-items: center;
          gap: 0.8rem;
        }

        .brand-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.75rem;
          height: 2.75rem;
          border-radius: 0.95rem;
          background: linear-gradient(135deg, var(--accent), oklch(80% 0.13 88));
          color: var(--accent-ink);
          font-family: var(--font-display);
          font-size: 1.1rem;
          box-shadow: inset 0 1px 0 oklch(100% 0 0 / 0.45);
        }

        .brand-wordmark {
          font-family: var(--font-display);
          font-size: 1.35rem;
          color: var(--text);
        }

        .nav-links,
        .nav-actions,
        .footer-links,
        .hero-actions,
        .hero-proof-points,
        .pricing-note,
        .integration-row,
        .tool-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .nav-links {
          justify-content: center;
        }

        .nav-link,
        .nav-text-link,
        .footer-links a {
          font-size: 0.95rem;
          color: var(--text-soft);
          transition: color 160ms ease;
        }

        .nav-link:hover,
        .nav-text-link:hover,
        .footer-links a:hover {
          color: var(--text);
        }

        .cta-button,
        .secondary-button {
          border-radius: 999px;
          height: auto;
          padding: 0.95rem 1.35rem;
          font-weight: 600;
          font-size: 0.96rem;
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            background 180ms ease,
            border-color 180ms ease;
        }

        .cta-button {
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          color: var(--accent-ink);
          box-shadow: 0 14px 30px oklch(74% 0.16 68 / 0.32);
          border: none;
        }

        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 36px oklch(74% 0.16 68 / 0.36);
        }

        .secondary-button {
          background: oklch(100% 0 0 / 0.65);
          color: var(--text);
          border: 1px solid var(--line-strong);
          box-shadow: none;
        }

        .secondary-button:hover {
          transform: translateY(-2px);
          border-color: var(--text-faint);
          background: oklch(100% 0 0 / 0.92);
        }

        .cta-button-lg {
          padding: 1.05rem 1.55rem;
          font-size: 1rem;
        }

        .hero-section {
          position: relative;
          padding: clamp(4rem, 10vw, 7rem) 0 2rem;
        }

        .hero-shell {
          display: grid;
          grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
          gap: clamp(2.5rem, 5vw, 4.5rem);
          align-items: center;
        }

        .hero-copy {
          position: relative;
          z-index: 1;
        }

        .hero-badge {
          display: inline-flex;
          border-radius: 999px;
          padding: 0.55rem 0.95rem;
          background: oklch(100% 0 0 / 0.7);
          color: var(--accent-ink);
          box-shadow: inset 0 0 0 1px oklch(81% 0.06 74 / 0.32);
          margin-bottom: 1.25rem;
          font-weight: 600;
        }

        .hero-kicker,
        .section-kicker,
        .band-label,
        .panel-label,
        .summary-label,
        .panel-card-label,
        .value-eyebrow,
        .pricing-tier,
        .workflow-detail {
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.76rem;
          font-weight: 700;
        }

        .hero-kicker,
        .section-kicker,
        .band-label {
          color: var(--text-faint);
        }

        .hero-title,
        .section-title,
        .workflow-title,
        .value-title,
        .pricing-amount,
        .panel-title {
          font-family: var(--font-display);
          line-height: 1;
        }

        .hero-title {
          font-size: clamp(3rem, 8vw, 5.8rem);
          letter-spacing: 0.01em;
          margin: 0.85rem 0 1.2rem;
          max-width: 11ch;
        }

        .hero-highlight {
          color: var(--accent-strong);
        }

        .hero-body,
        .section-body,
        .value-body,
        .role-body,
        .workflow-body,
        .pricing-copy,
        .panel-card-body,
        .footer-copy {
          color: var(--text-soft);
          font-size: 1.03rem;
          line-height: 1.7;
        }

        .hero-body {
          max-width: 34rem;
          font-size: 1.12rem;
          margin-bottom: 1.65rem;
        }

        .hero-proof-points {
          margin-top: 1.25rem;
          color: var(--text-faint);
          font-size: 0.9rem;
        }

        .hero-proof-points span {
          position: relative;
          padding-left: 1rem;
        }

        .hero-proof-points span::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.42rem;
          width: 0.42rem;
          height: 0.42rem;
          border-radius: 50%;
          background: var(--success);
        }

        .hero-panel-wrap {
          position: relative;
        }

        .hero-panel {
          position: relative;
          padding: 1.25rem;
          border-radius: var(--radius-lg);
          background:
            linear-gradient(180deg, oklch(30% 0.026 255), oklch(24% 0.024 255));
          border: 1px solid oklch(43% 0.04 245 / 0.2);
          box-shadow: var(--shadow-strong);
          color: oklch(95% 0.01 95);
          overflow: hidden;
        }

        .hero-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top right, oklch(74% 0.16 68 / 0.18), transparent 36%),
            linear-gradient(135deg, oklch(100% 0 0 / 0.05), transparent 50%);
          pointer-events: none;
        }

        .panel-topbar,
        .summary-stats,
        .summary-stat,
        .live-pill {
          display: flex;
          align-items: center;
        }

        .panel-topbar {
          justify-content: space-between;
          gap: 1rem;
          position: relative;
          z-index: 1;
        }

        .panel-label {
          color: oklch(77% 0.02 245);
          margin-bottom: 0.4rem;
        }

        .panel-title {
          font-size: clamp(1.65rem, 2vw, 2.2rem);
          color: oklch(98% 0.01 90);
        }

        .live-pill {
          gap: 0.5rem;
          padding: 0.55rem 0.9rem;
          border-radius: 999px;
          background: oklch(100% 0 0 / 0.08);
          color: oklch(92% 0.01 95);
          font-size: 0.86rem;
          font-weight: 600;
        }

        .live-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 0 6px oklch(63% 0.12 168 / 0.16);
          animation: pulse 1.8s ease-in-out infinite;
        }

        .panel-summary {
          position: relative;
          z-index: 1;
          margin-top: 1.25rem;
          padding: 1.2rem;
          border-radius: 1.35rem;
          background: oklch(100% 0 0 / 0.08);
          border: 1px solid oklch(100% 0 0 / 0.08);
        }

        .summary-copy {
          margin-bottom: 1rem;
        }

        .summary-label {
          color: oklch(80% 0.03 88);
          margin-bottom: 0.55rem;
        }

        .summary-headline {
          font-size: 1.3rem;
          line-height: 1.4;
          color: oklch(98% 0.01 90);
          font-weight: 600;
        }

        .summary-stats {
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .summary-stat {
          gap: 0.5rem;
          padding: 0.8rem 0.95rem;
          border-radius: 1rem;
          background: oklch(0% 0 0 / 0.14);
          min-width: 9rem;
          justify-content: space-between;
        }

        .summary-stat strong {
          font-size: 0.88rem;
          color: oklch(98% 0.01 90);
        }

        .summary-stat span {
          font-size: 0.78rem;
          color: oklch(77% 0.02 245);
        }

        .panel-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1.08fr 0.92fr;
          gap: 0.9rem;
          margin-top: 0.95rem;
        }

        .panel-card {
          border-radius: 1.35rem;
          padding: 1.1rem;
        }

        .panel-card-ink {
          background: oklch(0% 0 0 / 0.16);
          border: 1px solid oklch(100% 0 0 / 0.06);
        }

        .panel-card-warm {
          background: linear-gradient(180deg, oklch(96% 0.03 90), oklch(92% 0.04 88));
          color: var(--text);
        }

        .panel-card-label {
          margin-bottom: 0.65rem;
          color: inherit;
          opacity: 0.72;
        }

        .panel-card-title {
          font-size: 1.08rem;
          line-height: 1.4;
          font-weight: 600;
          margin-bottom: 0.6rem;
        }

        .task-list {
          list-style: none;
          display: grid;
          gap: 0.65rem;
        }

        .task-list li {
          position: relative;
          padding-left: 1rem;
          color: var(--text-soft);
          line-height: 1.55;
        }

        .task-list li::before,
        .pricing-list li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.62rem;
          width: 0.42rem;
          height: 0.42rem;
          border-radius: 50%;
          background: var(--accent-strong);
        }

        .tool-row {
          position: relative;
          z-index: 1;
          margin-top: 1rem;
        }

        .tool-pill,
        .integration-name {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-size: 0.84rem;
          font-weight: 600;
        }

        .tool-pill {
          padding: 0.6rem 0.85rem;
          background: oklch(100% 0 0 / 0.08);
          color: oklch(90% 0.01 92);
          border: 1px solid oklch(100% 0 0 / 0.07);
        }

        .integration-band,
        .section-tinted,
        .final-cta-section {
          position: relative;
        }

        .integration-band {
          padding: 0.8rem 0 2rem;
        }

        .integration-shell {
          border-radius: 1.6rem;
          border: 1px solid var(--line);
          background: oklch(100% 0 0 / 0.5);
          padding: 1rem 1.1rem;
          box-shadow: var(--shadow-soft);
        }

        .integration-row {
          margin-top: 0.65rem;
          gap: 0.75rem;
        }

        .integration-name {
          padding: 0.65rem 0.85rem;
          background: var(--bg);
          border: 1px solid var(--line);
          color: var(--text-soft);
        }

        .section-block {
          padding: clamp(4rem, 10vw, 6rem) 0;
        }

        .section-tinted::before,
        .final-cta-section::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, oklch(98% 0.014 92 / 0), oklch(93.8% 0.035 90 / 0.7));
          pointer-events: none;
        }

        .section-head {
          max-width: 48rem;
          margin-bottom: 2.4rem;
        }

        .section-head-slim {
          max-width: 42rem;
        }

        .section-title {
          font-size: clamp(2rem, 5vw, 3.5rem);
          margin: 0.65rem 0 1rem;
          letter-spacing: 0.01em;
        }

        .value-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }

        .value-card,
        .workflow-card,
        .role-card,
        .pricing-card,
        .final-cta {
          border-radius: var(--radius-md);
          border: 1px solid var(--line);
          background: oklch(100% 0 0 / 0.74);
          box-shadow: var(--shadow-soft);
        }

        .value-card {
          overflow: hidden;
        }

        .value-card-featured {
          background: linear-gradient(135deg, oklch(29% 0.025 255), oklch(33% 0.03 250));
          border-color: oklch(38% 0.04 248 / 0.35);
        }

        .value-card-content {
          padding: 1.5rem;
        }

        .value-card-featured .value-eyebrow,
        .value-card-featured .value-title,
        .value-card-featured .value-body {
          color: oklch(97% 0.01 92);
        }

        .value-card-featured .value-eyebrow {
          opacity: 0.8;
        }

        .value-title {
          font-size: 1.65rem;
          margin: 0.55rem 0 0.8rem;
          letter-spacing: 0.01em;
        }

        .role-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .role-card {
          padding: 1.35rem;
          background: oklch(100% 0 0 / 0.56);
        }

        .role-title {
          font-weight: 700;
          font-size: 1rem;
          margin-bottom: 0.55rem;
          color: var(--text);
        }

        .workflow-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          position: relative;
          z-index: 1;
        }

        .workflow-card {
          padding: 1.45rem;
        }

        .workflow-step {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.6rem;
          height: 2.6rem;
          border-radius: 999px;
          background: var(--accent);
          color: var(--accent-ink);
          font-weight: 800;
          margin-bottom: 0.9rem;
        }

        .workflow-detail {
          color: var(--text-faint);
          margin-bottom: 0.7rem;
        }

        .workflow-title {
          font-size: 1.48rem;
          margin-bottom: 0.75rem;
          letter-spacing: 0.01em;
        }

        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .pricing-card {
          overflow: hidden;
        }

        .pricing-card-featured {
          background: linear-gradient(180deg, oklch(97% 0.03 92), oklch(93.8% 0.045 88));
          border-color: oklch(80% 0.06 74);
        }

        .pricing-content {
          padding: 1.5rem;
        }

        .pricing-badge {
          display: inline-flex;
          border-radius: 999px;
          padding: 0.45rem 0.75rem;
          background: var(--accent);
          color: var(--accent-ink);
          font-weight: 700;
          margin-bottom: 0.85rem;
        }

        .pricing-tier {
          color: var(--text-faint);
        }

        .pricing-amount-row {
          display: flex;
          align-items: flex-end;
          gap: 0.45rem;
          margin: 0.55rem 0 0.9rem;
        }

        .pricing-amount {
          font-size: clamp(2.7rem, 5vw, 4rem);
          letter-spacing: 0.01em;
        }

        .pricing-period {
          color: var(--text-faint);
          font-size: 0.95rem;
          margin-bottom: 0.55rem;
        }

        .pricing-copy {
          margin-bottom: 1.25rem;
        }

        .pricing-button {
          width: 100%;
          justify-content: center;
          margin-bottom: 1.25rem;
        }

        .pricing-list {
          list-style: none;
          display: grid;
          gap: 0.85rem;
        }

        .pricing-list li {
          position: relative;
          padding-left: 1rem;
          color: var(--text-soft);
          line-height: 1.5;
        }

        .pricing-note {
          margin-top: 1rem;
          padding: 1rem 1.1rem;
          border-radius: 999px;
          background: oklch(100% 0 0 / 0.58);
          border: 1px solid var(--line);
          color: var(--text-soft);
          font-size: 0.94rem;
          justify-content: space-between;
        }

        .pricing-note a {
          color: var(--accent-ink);
          font-weight: 600;
        }

        .final-cta {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1.1fr auto;
          gap: 2rem;
          align-items: center;
          padding: clamp(1.5rem, 4vw, 2.4rem);
          background:
            linear-gradient(135deg, oklch(29% 0.024 255), oklch(22% 0.02 255));
          border-color: oklch(38% 0.04 248 / 0.35);
        }

        .final-cta .section-kicker,
        .final-cta .section-title,
        .final-cta .section-body {
          color: oklch(97% 0.01 92);
        }

        .final-cta .section-kicker,
        .final-cta .section-body {
          opacity: 0.82;
        }

        .final-cta-actions {
          display: grid;
          gap: 0.85rem;
          min-width: min(100%, 18rem);
        }

        .site-footer {
          padding: 0 0 2.5rem;
        }

        .footer-shell {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 1rem;
          align-items: center;
          padding-top: 1.5rem;
          border-top: 1px solid var(--line);
        }

        .footer-copy {
          font-size: 0.94rem;
          text-align: center;
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(0.86);
            opacity: 0.72;
          }
        }

        @media (max-width: 1024px) {
          .hero-shell,
          .workflow-grid,
          .role-grid,
          .pricing-grid,
          .final-cta,
          .footer-shell {
            grid-template-columns: 1fr;
          }

          .hero-panel {
            max-width: 42rem;
          }

          .final-cta-actions,
          .footer-copy {
            text-align: left;
          }
        }

        @media (max-width: 900px) {
          .nav-links,
          .nav-text-link {
            display: none;
          }

          .value-grid {
            grid-template-columns: 1fr;
          }

          .value-card-featured {
            order: -1;
          }

          .panel-grid {
            grid-template-columns: 1fr;
          }

          .pricing-note {
            border-radius: 1.2rem;
            align-items: flex-start;
          }
        }

        @media (max-width: 640px) {
          .section-shell,
          .nav-shell {
            width: min(1120px, calc(100vw - 1.25rem));
          }

          .site-nav {
            position: static;
          }

          .nav-shell {
            padding: 0.9rem 0;
          }

          .brand-mark {
            width: 2.35rem;
            height: 2.35rem;
            border-radius: 0.8rem;
          }

          .brand-wordmark {
            font-size: 1.15rem;
          }

          .nav-actions {
            width: auto;
          }

          .nav-cta,
          .cta-button-lg,
          .secondary-button {
            width: 100%;
            justify-content: center;
          }

          .hero-actions,
          .pricing-note,
          .footer-links {
            display: grid;
            gap: 0.75rem;
          }

          .hero-title {
            max-width: 10ch;
          }

          .hero-proof-points {
            display: grid;
            gap: 0.55rem;
          }

          .hero-proof-points span {
            padding-left: 1rem;
          }

          .panel-summary,
          .panel-card,
          .workflow-card,
          .value-card-content,
          .pricing-content,
          .role-card,
          .final-cta {
            padding: 1.15rem;
          }

          .summary-stats {
            display: grid;
            grid-template-columns: 1fr;
          }

          .summary-stat {
            width: 100%;
          }

          .tool-row,
          .integration-row {
            gap: 0.6rem;
          }

          .footer-shell {
            padding-top: 1.2rem;
          }
        }
      `}</style>
    </div>
  )
}
