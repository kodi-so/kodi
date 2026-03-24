export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <div className="site-root">

      {/* ─── Noise texture overlay ─────────────────────────────── */}
      <div className="noise-overlay" aria-hidden="true" />

      {/* ─── Nav ─────────────────────────────────────────────────── */}
      <nav className="site-nav">
        <div className="nav-inner">
          <div className="nav-logo">
            <div className="kodi-mark" aria-hidden="true">K</div>
            <span className="nav-wordmark">Kodi</span>
          </div>

          <div className="nav-links">
            <a href="#how-it-works" className="nav-link">How it works</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#pricing" className="nav-link">Pricing</a>
          </div>

          <a href={appUrl} className="btn-primary nav-cta">
            Get early access
          </a>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="hero-section">
        <div className="hero-grid-line hero-grid-line-v1" aria-hidden="true" />
        <div className="hero-grid-line hero-grid-line-v2" aria-hidden="true" />
        <div className="hero-radial" aria-hidden="true" />

        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-badge animate-in delay-0">
              <span className="pulse-dot" aria-hidden="true" />
              <span className="hero-badge-text">Early access · Built for small sales teams</span>
            </div>

            <h1 className="hero-heading animate-in delay-1">
              Your team's first<br />
              <em className="hero-serif">dedicated</em>{' '}
              <span className="hero-accent">AI sales rep.</span>
            </h1>

            <p className="hero-body animate-in delay-2">
              Kodi gives your team a dedicated AI agent that researches leads, drafts outreach,
              and tracks every conversation — so you can close deals, not chase admin.
            </p>

            <p className="hero-sub animate-in delay-3">
              One click to deploy. Works with your Gmail. Your whole team, one shared agent.
            </p>

            <div className="hero-actions animate-in delay-3">
              <a href={appUrl} className="btn-primary btn-lg">
                Get your agent now →
              </a>
              <a href="#how-it-works" className="btn-ghost btn-lg">
                See how it works
              </a>
            </div>

            <p className="hero-fine animate-in delay-4">
              No credit card required · Live in under 5 minutes · No DevOps needed
            </p>
          </div>

          {/* ─── Feed Mockup ─────────────────────────── */}
          <div className="hero-mockup animate-in-right delay-2">
            <div className="feed-window">
              {/* Terminal-style header */}
              <div className="feed-header">
                <div className="feed-header-dots" aria-hidden="true">
                  <span style={{ background: '#ff5f57' }} />
                  <span style={{ background: '#febc2e' }} />
                  <span style={{ background: '#28c840' }} />
                </div>
                <span className="feed-header-title">kodi — agent:active</span>
                <span className="feed-status-indicator">
                  <span className="feed-status-dot" />
                  <span className="feed-status-label">LIVE</span>
                </span>
              </div>

              {/* Timestamp bar */}
              <div className="feed-timestamp-bar">
                <span className="feed-mono">FEED</span>
                <span className="feed-mono feed-timestamp">TUE 21:07 UTC</span>
                <span className="feed-mono feed-count">3 actions pending</span>
              </div>

              {/* Feed rows */}
              <div className="feed-rows">
                <div className="feed-row feed-row-critical">
                  <div className="feed-row-priority">
                    <span className="priority-dot priority-critical" />
                    <span className="feed-mono priority-label">P0</span>
                  </div>
                  <div className="feed-row-body">
                    <div className="feed-row-headline">Acme Corp hasn't heard from you in 8 days</div>
                    <div className="feed-row-meta">
                      <span className="feed-tag feed-tag-critical">TRIAL ENDS FRI</span>
                      <span className="feed-row-sub">high churn risk</span>
                    </div>
                  </div>
                  <button className="feed-action-btn">Draft follow-up</button>
                </div>

                <div className="feed-row feed-row-warn">
                  <div className="feed-row-priority">
                    <span className="priority-dot priority-warn" />
                    <span className="feed-mono priority-label">P1</span>
                  </div>
                  <div className="feed-row-body">
                    <div className="feed-row-headline">3 leads from Tuesday's webinar — not contacted</div>
                    <div className="feed-row-meta">
                      <span className="feed-tag feed-tag-warn">UNCONTACTED</span>
                      <span className="feed-row-sub">Sarah Chen, Marcus Bell, +1</span>
                    </div>
                  </div>
                  <button className="feed-action-btn">Research all</button>
                </div>

                <div className="feed-row feed-row-good">
                  <div className="feed-row-priority">
                    <span className="priority-dot priority-good" />
                    <span className="feed-mono priority-label">P1</span>
                  </div>
                  <div className="feed-row-body">
                    <div className="feed-row-headline">Jordan at Stripe opened your email 4 times</div>
                    <div className="feed-row-meta">
                      <span className="feed-tag feed-tag-good">WARM SIGNAL</span>
                      <span className="feed-row-sub">sent 2 days ago</span>
                    </div>
                  </div>
                  <button className="feed-action-btn">Follow up</button>
                </div>
              </div>

              {/* Footer bar */}
              <div className="feed-footer-bar">
                <span className="feed-mono feed-footer-text">↑ kodi watches your pipeline 24/7</span>
              </div>
            </div>

            <p className="mockup-caption">
              Kodi surfaces what needs your attention — so nothing slips through.
            </p>
          </div>
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────────────── */}
      <section id="how-it-works" className="section-bordered">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-num" aria-hidden="true">01</div>
            <div className="section-header-text">
              <div className="section-label">How it works</div>
              <h2 className="section-heading">Up and running in minutes.</h2>
            </div>
          </div>

          <div className="steps-table">
            <div className="steps-table-row">
              <div className="step-index"><span className="feed-mono step-index-num">01</span></div>
              <div className="step-content">
                <h3 className="step-title">Sign up &amp; launch</h3>
                <p className="step-body">
                  Create your account and click "Launch agent." Kodi spins up your own dedicated AI instance
                  in under 5 minutes — no servers to manage, ever.
                </p>
              </div>
              <div className="step-detail">
                <span className="step-detail-badge feed-mono">~5 min</span>
              </div>
            </div>

            <div className="steps-table-row">
              <div className="step-index"><span className="feed-mono step-index-num">02</span></div>
              <div className="step-content">
                <h3 className="step-title">Connect your tools</h3>
                <p className="step-body">
                  Link Gmail in one click. Kodi reads your email history, learns who you've talked to,
                  and starts building context on your pipeline — automatically.
                </p>
              </div>
              <div className="step-detail">
                <span className="step-detail-badge feed-mono">1 click</span>
              </div>
            </div>

            <div className="steps-table-row steps-table-row-last">
              <div className="step-index"><span className="feed-mono step-index-num">03</span></div>
              <div className="step-content">
                <h3 className="step-title">Let the agent work</h3>
                <p className="step-body">
                  Kodi surfaces what matters every day: stale leads, warm replies, follow-ups due.
                  Ask it anything. It drafts, researches, and remembers — so you don't have to.
                </p>
              </div>
              <div className="step-detail">
                <span className="step-detail-badge feed-mono step-detail-accent feed-mono">ongoing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────── */}
      <section id="features" className="section-padded">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-num" aria-hidden="true">02</div>
            <div className="section-header-text">
              <div className="section-label">Features</div>
              <h2 className="section-heading">Everything your pipeline needs.</h2>
              <p className="section-sub">
                Kodi doesn't replace your team. It's the teammate that never forgets, never sleeps,
                and never drops a follow-up.
              </p>
            </div>
          </div>

          <div className="features-list">
            <div className="feature-row">
              <div className="feature-num feed-mono">01</div>
              <div className="feature-body">
                <h3 className="feature-title">The Feed — Your daily action list.</h3>
                <p className="feature-desc">
                  Every morning, Kodi surfaces your most important actions — stale deals, warm replies,
                  leads that need attention. No dashboards to check. Just what needs doing.
                </p>
              </div>
              <div className="feature-tags">
                <span className="feature-tag">Prioritized</span>
                <span className="feature-tag">Auto-updated</span>
                <span className="feature-tag">Actionable</span>
              </div>
            </div>

            <div className="feature-row">
              <div className="feature-num feed-mono">02</div>
              <div className="feature-body">
                <h3 className="feature-title">Lead Research — Company intel in seconds.</h3>
                <p className="feature-desc">
                  Ask Kodi about any company or person. Get a sharp research card — overview, key people,
                  recent news, funding — instantly.
                </p>
              </div>
              <div className="feature-tags">
                <span className="feature-tag">Company intel</span>
                <span className="feature-tag">People search</span>
                <span className="feature-tag">News tracking</span>
              </div>
            </div>

            <div className="feature-row">
              <div className="feature-num feed-mono">03</div>
              <div className="feature-body">
                <h3 className="feature-title">Email Drafts — Personalized outreach, fast.</h3>
                <p className="feature-desc">
                  Tell Kodi who to write to and why. It crafts a personalized email using everything it knows —
                  past conversations, their company, your product.
                </p>
              </div>
              <div className="feature-tags">
                <span className="feature-tag">Cold outreach</span>
                <span className="feature-tag">Follow-ups</span>
                <span className="feature-tag">Personalized</span>
              </div>
            </div>

            <div className="feature-row">
              <div className="feature-num feed-mono">04</div>
              <div className="feature-body">
                <h3 className="feature-title">Shared Team Brain — One agent. Whole team.</h3>
                <p className="feature-desc">
                  Everyone works with the same agent, sees the same context. No more knowledge siloed in inboxes.
                </p>
              </div>
              <div className="feature-tags">
                <span className="feature-tag">Multi-user</span>
                <span className="feature-tag">Shared context</span>
              </div>
            </div>

            <div className="feature-row">
              <div className="feature-num feed-mono">05</div>
              <div className="feature-body">
                <h3 className="feature-title">Natural Language — Ask it anything.</h3>
                <p className="feature-desc">
                  "What happened with the Notion deal?" "Who have I not followed up with this week?" It knows.
                </p>
              </div>
              <div className="feature-tags">
                <span className="feature-tag">Full context</span>
                <span className="feature-tag">Instant answers</span>
              </div>
            </div>

            <div className="feature-row feature-row-accent">
              <div className="feature-num feed-mono">06</div>
              <div className="feature-body">
                <h3 className="feature-title">Your Own Instance — Private by design.</h3>
                <p className="feature-desc">
                  Every team gets a dedicated agent. Your data never touches another company's instance.
                </p>
              </div>
              <div className="feature-tags">
                <span className="feature-tag feature-tag-accent">Dedicated</span>
                <span className="feature-tag feature-tag-accent">Isolated</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pain Points ─────────────────────────────────────────── */}
      <section className="section-bordered">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-num" aria-hidden="true">03</div>
            <div className="section-header-text">
              <div className="section-label">Sound familiar?</div>
              <h2 className="section-heading">The real cost<br />of not having Kodi.</h2>
              <p className="section-sub">
                Every hour spent on admin is an hour not spent closing. Small teams can't afford the waste.
              </p>
            </div>
          </div>

          <div className="pain-grid">
            {[
              'Spending hours researching leads that go nowhere',
              'Follow-ups falling through the cracks',
              'Writing the same prospecting emails over and over',
              'Losing context when teammates change',
              "Can't afford a bigger team, but need to grow",
              'Switching between 5 tools to find one answer',
            ].map((pain, i) => (
              <div key={pain} className="pain-item">
                <span className="pain-x feed-mono">✕</span>
                <span className="pain-num feed-mono">{String(i + 1).padStart(2, '0')}</span>
                <p className="pain-text">{pain}</p>
              </div>
            ))}
            <div className="pain-resolution">
              <span className="pain-check" aria-hidden="true">→</span>
              <p>Kodi handles all of this. You focus on closing.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pricing ─────────────────────────────────────────────── */}
      <section id="pricing" className="section-padded">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-num" aria-hidden="true">04</div>
            <div className="section-header-text">
              <div className="section-label">Pricing</div>
              <h2 className="section-heading">One team. One agent.<br />One price.</h2>
              <p className="section-sub">
                Flat per-team pricing — not per seat. Your whole team uses the same agent for one monthly fee.
              </p>
            </div>
          </div>

          <div className="pricing-grid">
            {/* Starter */}
            <div className="pricing-card">
              <div className="pricing-tier-label feed-mono">STARTER</div>
              <div className="pricing-price-row">
                <span className="pricing-amount">$49</span>
                <span className="pricing-period feed-mono">/mo</span>
              </div>
              <p className="pricing-desc">For small teams getting their first AI agent.</p>
              <a href={appUrl} className="btn-ghost btn-block">Start free trial</a>
              <ul className="pricing-features">
                {[
                  'Up to 5 team members',
                  'Dedicated OpenClaw instance',
                  'Gmail integration',
                  'Lead research & email drafting',
                  'The Feed — daily action items',
                  'Chat with your agent',
                  '$20 AI credits/month included',
                ].map(f => (
                  <li key={f} className="pricing-feature">
                    <span className="check feed-mono" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div className="pricing-card pricing-card-featured">
              <div className="pricing-popular-badge feed-mono">MOST POPULAR</div>
              <div className="pricing-tier-label feed-mono" style={{ color: 'var(--accent)' }}>PRO</div>
              <div className="pricing-price-row">
                <span className="pricing-amount">$99</span>
                <span className="pricing-period feed-mono">/mo</span>
              </div>
              <p className="pricing-desc">For teams serious about growing without headcount.</p>
              <a href={appUrl} className="btn-primary btn-block">Start free trial</a>
              <ul className="pricing-features">
                {[
                  'Unlimited team members',
                  'Everything in Starter',
                  'Priority AI (faster responses)',
                  'Workflow automation',
                  'HubSpot + LinkedIn integrations',
                  'Activity audit log',
                  '$50 AI credits/month included',
                  'Priority support',
                ].map(f => (
                  <li key={f} className="pricing-feature">
                    <span className="check check-accent feed-mono" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="pricing-footer">
            All plans include a 14-day free trial. No credit card required.{' '}
            <a href="mailto:hello@kodi.so" className="accent-link">
              Need something custom? Talk to us →
            </a>
          </p>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────── */}
      <section className="section-bordered cta-section">
        <div className="section-inner">
          <div className="cta-layout">
            <div className="cta-text">
              <h2 className="cta-heading">
                Stop managing leads.<br />
                <span className="hero-accent">Start closing them.</span>
              </h2>
              <p className="cta-body">
                Your team deserves an AI agent that actually understands your business.
                Kodi is ready in under 5 minutes.
              </p>
              <p className="cta-fine">
                No engineers required. No configuration. No nonsense.
              </p>
              <a href={appUrl} className="btn-primary btn-lg">
                Get your agent — free for 14 days →
              </a>
            </div>

            <div className="cta-stats" aria-hidden="true">
              <div className="cta-stat-row">
                <span className="cta-stat-num">5 min</span>
                <span className="cta-stat-label feed-mono">to go live</span>
              </div>
              <div className="cta-stat-divider" />
              <div className="cta-stat-row">
                <span className="cta-stat-num">14 days</span>
                <span className="cta-stat-label feed-mono">free trial</span>
              </div>
              <div className="cta-stat-divider" />
              <div className="cta-stat-row">
                <span className="cta-stat-num">1 price</span>
                <span className="cta-stat-label feed-mono">for whole team</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-logo">
            <div className="kodi-mark kodi-mark-sm" aria-hidden="true">K</div>
            <span className="footer-wordmark">Kodi</span>
          </div>
          <p className="footer-copy feed-mono">
            © {new Date().getFullYear()} Kodi. Built for small teams that want to win.
          </p>
          <div className="footer-links">
            <a href="/privacy" className="footer-link">Privacy</a>
            <a href="/terms" className="footer-link">Terms</a>
            <a href="mailto:hello@kodi.so" className="footer-link">Contact</a>
          </div>
        </div>
      </footer>

      {/* ─── Design System ───────────────────────────────────────── */}
      <style>{`
        /* ═══════════════════════════════════════════════════════
           CUSTOM PROPERTIES
        ═══════════════════════════════════════════════════════ */
        :root {
          /* Colors */
          --bg:           oklch(8% 0.005 240);
          --bg-2:         oklch(10.5% 0.006 240);
          --bg-3:         oklch(12.5% 0.007 240);
          --bg-4:         oklch(14.5% 0.008 240);
          --border:       oklch(18% 0.01 240);
          --border-2:     oklch(22% 0.012 240);
          --text:         oklch(96% 0.005 240);
          --muted:        oklch(58% 0.01 240);
          --subtle:       oklch(38% 0.008 240);
          --accent:       oklch(65% 0.2 145);
          --accent-dim:   oklch(65% 0.2 145 / 0.08);
          --accent-border: oklch(65% 0.2 145 / 0.3);
          --accent-text:  oklch(65% 0.2 145);

          /* Typography */
          --font-display: 'Syne', system-ui, sans-serif;
          --font-body:    'Inter', system-ui, sans-serif;
          --font-mono:    'IBM Plex Mono', 'Fira Code', monospace;
          --font-serif:   'Instrument Serif', Georgia, serif;
        }

        /* ═══════════════════════════════════════════════════════
           RESET & BASE
        ═══════════════════════════════════════════════════════ */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          font-size: 16px;
          line-height: 1.6;
          font-weight: 400;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          overflow-x: hidden;
        }

        a { text-decoration: none; color: inherit; }
        button { font-family: inherit; }

        /* ═══════════════════════════════════════════════════════
           NOISE TEXTURE
        ═══════════════════════════════════════════════════════ */
        .site-root {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .noise-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 100;
          opacity: 0.035;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 200px 200px;
        }

        /* ═══════════════════════════════════════════════════════
           TYPOGRAPHY UTILITIES
        ═══════════════════════════════════════════════════════ */
        .feed-mono {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
        }

        /* ═══════════════════════════════════════════════════════
           NAV
        ═══════════════════════════════════════════════════════ */
        .site-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          border-bottom: 1px solid var(--border);
          background: oklch(8% 0.005 240 / 0.9);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .nav-inner {
          max-width: 80rem;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 3.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
        }

        .nav-logo {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          flex-shrink: 0;
        }

        .kodi-mark {
          width: 1.875rem;
          height: 1.875rem;
          background: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-weight: 800;
          font-size: 0.875rem;
          color: oklch(8% 0.005 240);
          flex-shrink: 0;
          letter-spacing: -0.02em;
        }

        .kodi-mark-sm {
          width: 1.375rem;
          height: 1.375rem;
          font-size: 0.7rem;
        }

        .nav-wordmark {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: -0.03em;
          color: var(--text);
        }

        .nav-links {
          display: none;
          align-items: center;
          gap: 2rem;
        }

        @media (min-width: 768px) {
          .nav-links { display: flex; }
        }

        .nav-link {
          font-size: 0.8125rem;
          font-weight: 400;
          color: var(--muted);
          transition: color 0.12s;
          letter-spacing: 0.01em;
        }

        .nav-link:hover { color: var(--text); }

        .nav-cta {
          font-size: 0.8125rem;
          padding: 0.4375rem 0.875rem;
        }

        /* ═══════════════════════════════════════════════════════
           BUTTONS
        ═══════════════════════════════════════════════════════ */
        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem;
          background: var(--accent);
          color: oklch(8% 0.005 240);
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 0.875rem;
          border: none;
          cursor: pointer;
          transition: opacity 0.12s, transform 0.12s;
          white-space: nowrap;
          letter-spacing: -0.01em;
        }

        .btn-primary:hover {
          opacity: 0.88;
          transform: translateY(-1px);
        }

        .btn-ghost {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem;
          background: transparent;
          color: var(--muted);
          font-family: var(--font-body);
          font-weight: 400;
          font-size: 0.875rem;
          border: 1px solid var(--border-2);
          cursor: pointer;
          transition: color 0.12s, border-color 0.12s, transform 0.12s;
          white-space: nowrap;
        }

        .btn-ghost:hover {
          color: var(--text);
          border-color: var(--muted);
          transform: translateY(-1px);
        }

        .btn-lg {
          padding: 0.6875rem 1.5rem;
          font-size: 0.9375rem;
        }

        .btn-block {
          display: block;
          width: 100%;
          text-align: center;
          padding-top: 0.625rem;
          padding-bottom: 0.625rem;
        }

        /* ═══════════════════════════════════════════════════════
           HERO
        ═══════════════════════════════════════════════════════ */
        .hero-section {
          position: relative;
          max-width: 80rem;
          margin: 0 auto;
          padding: clamp(4rem, 10vw, 7rem) 1.5rem clamp(3rem, 8vw, 5rem);
          overflow: hidden;
        }

        /* Vertical grid lines */
        .hero-grid-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1px;
          background: var(--border);
          pointer-events: none;
        }
        .hero-grid-line-v1 { left: 33.333%; }
        .hero-grid-line-v2 { left: 66.666%; }

        /* Subtle radial accent */
        .hero-radial {
          position: absolute;
          top: -20%;
          left: -10%;
          width: 80%;
          height: 60%;
          background: radial-gradient(ellipse at 30% 0%, oklch(65% 0.2 145 / 0.05) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-inner {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr;
          gap: 4rem;
          align-items: start;
        }

        @media (min-width: 1024px) {
          .hero-inner {
            grid-template-columns: 1fr 1fr;
            align-items: center;
          }
        }

        .hero-content {
          max-width: 38rem;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          font-weight: 500;
          color: var(--accent);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border: 1px solid var(--accent-border);
          padding: 0.3125rem 0.75rem;
        }

        .hero-badge-text {
          font-family: var(--font-mono);
        }

        .pulse-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse-anim 2.5s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes pulse-anim {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }

        .hero-heading {
          font-family: var(--font-display);
          font-size: clamp(2.75rem, 6vw, 5rem);
          font-weight: 800;
          line-height: 1.0;
          letter-spacing: -0.04em;
          color: var(--text);
          margin-bottom: 1.5rem;
        }

        .hero-serif {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          color: var(--muted);
          letter-spacing: -0.01em;
        }

        .hero-accent {
          color: var(--accent);
        }

        .hero-body {
          font-size: clamp(1rem, 2vw, 1.125rem);
          font-weight: 300;
          color: var(--muted);
          line-height: 1.7;
          max-width: 36rem;
          margin-bottom: 0.75rem;
          letter-spacing: 0.005em;
        }

        .hero-sub {
          font-size: 0.875rem;
          color: var(--subtle);
          margin-bottom: 2.5rem;
          line-height: 1.6;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }

        .hero-fine {
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          color: var(--subtle);
          letter-spacing: 0.02em;
        }

        /* ═══════════════════════════════════════════════════════
           HERO MOCKUP
        ═══════════════════════════════════════════════════════ */
        .hero-mockup {
          animation: float 6s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }

        .feed-window {
          border: 1px solid var(--border-2);
          background: var(--bg-2);
          overflow: hidden;
          box-shadow:
            0 0 0 1px oklch(65% 0.2 145 / 0.05),
            0 32px 80px oklch(0% 0 0 / 0.6),
            0 8px 24px oklch(0% 0 0 / 0.3);
        }

        .feed-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.625rem 0.875rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-3);
        }

        .feed-header-dots {
          display: flex;
          gap: 0.3125rem;
        }

        .feed-header-dots span {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          display: block;
          opacity: 0.65;
        }

        .feed-header-title {
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          color: var(--subtle);
          flex: 1;
          letter-spacing: 0.02em;
        }

        .feed-status-indicator {
          display: flex;
          align-items: center;
          gap: 0.3125rem;
        }

        .feed-status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          animation: status-pulse 2s ease-in-out infinite;
        }

        @keyframes status-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }

        .feed-status-label {
          font-family: var(--font-mono);
          font-size: 0.5625rem;
          font-weight: 600;
          color: var(--accent);
          letter-spacing: 0.1em;
        }

        .feed-timestamp-bar {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.4375rem 0.875rem;
          background: var(--bg-3);
          border-bottom: 1px solid var(--border);
        }

        .feed-timestamp-bar .feed-mono {
          font-size: 0.5625rem;
          color: var(--subtle);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .feed-count {
          margin-left: auto;
          color: var(--accent) !important;
        }

        .feed-rows {
          display: flex;
          flex-direction: column;
        }

        .feed-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: start;
          gap: 0.75rem;
          padding: 0.875rem;
          border-bottom: 1px solid var(--border);
          transition: background 0.15s;
        }

        .feed-row:last-child {
          border-bottom: none;
        }

        .feed-row:hover { background: var(--bg-3); }

        .feed-row-priority {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding-top: 0.1rem;
          flex-shrink: 0;
        }

        .priority-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .priority-label {
          font-size: 0.5rem;
          color: var(--subtle);
          letter-spacing: 0.05em;
        }

        .priority-critical { background: #ef4444; animation: priority-pulse 1.5s ease-in-out infinite; }
        .priority-warn     { background: #f59e0b; }
        .priority-good     { background: var(--accent); }

        @keyframes priority-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%       { opacity: 0.7; box-shadow: 0 0 0 4px rgba(239,68,68,0); }
        }

        .feed-row-body {
          min-width: 0;
        }

        .feed-row-headline {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text);
          margin-bottom: 0.3125rem;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }

        .feed-row-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .feed-tag {
          font-family: var(--font-mono);
          font-size: 0.5rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          padding: 0.15rem 0.4rem;
          border: 1px solid;
        }

        .feed-tag-critical { color: #ef4444; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.06); }
        .feed-tag-warn     { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.06); }
        .feed-tag-good     { color: var(--accent); border-color: var(--accent-border); background: var(--accent-dim); }

        .feed-row-sub {
          font-family: var(--font-mono);
          font-size: 0.5625rem;
          color: var(--subtle);
          letter-spacing: 0.02em;
        }

        .feed-action-btn {
          font-family: var(--font-mono);
          font-size: 0.5625rem;
          font-weight: 500;
          padding: 0.25rem 0.5rem;
          background: transparent;
          color: var(--muted);
          border: 1px solid var(--border-2);
          cursor: pointer;
          transition: color 0.12s, border-color 0.12s;
          white-space: nowrap;
          letter-spacing: 0.02em;
          flex-shrink: 0;
          margin-top: 0.1rem;
        }

        .feed-action-btn:hover {
          color: var(--accent);
          border-color: var(--accent-border);
        }

        .feed-footer-bar {
          padding: 0.5rem 0.875rem;
          border-top: 1px solid var(--border);
          background: var(--bg-3);
        }

        .feed-footer-text {
          font-size: 0.5rem;
          color: var(--subtle);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .mockup-caption {
          margin-top: 0.75rem;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          color: var(--subtle);
          letter-spacing: 0.02em;
        }

        /* ═══════════════════════════════════════════════════════
           SECTION STRUCTURE
        ═══════════════════════════════════════════════════════ */
        .section-bordered {
          border-top: 1px solid var(--border);
          padding: clamp(4rem, 8vw, 6rem) 0;
        }

        .section-padded {
          padding: clamp(4rem, 8vw, 6rem) 0;
        }

        .section-inner {
          max-width: 80rem;
          margin: 0 auto;
          padding: 0 1.5rem;
        }

        .section-header {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 2rem;
          align-items: start;
          margin-bottom: 4rem;
        }

        @media (max-width: 640px) {
          .section-header { grid-template-columns: 1fr; gap: 1rem; }
          .section-num { display: none; }
        }

        .section-num {
          font-family: var(--font-display);
          font-size: clamp(5rem, 10vw, 9rem);
          font-weight: 800;
          line-height: 0.85;
          letter-spacing: -0.06em;
          color: var(--border-2);
          user-select: none;
          margin-top: -0.5rem;
        }

        .section-label {
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 0.75rem;
        }

        .section-heading {
          font-family: var(--font-display);
          font-size: clamp(1.875rem, 4vw, 3rem);
          font-weight: 700;
          line-height: 1.05;
          letter-spacing: -0.04em;
          color: var(--text);
          margin-bottom: 1rem;
        }

        .section-sub {
          color: var(--muted);
          font-size: clamp(0.9375rem, 1.5vw, 1.0625rem);
          font-weight: 300;
          line-height: 1.7;
          max-width: 36rem;
          margin-bottom: 0;
        }

        /* ═══════════════════════════════════════════════════════
           HOW IT WORKS — TABLE FORMAT
        ═══════════════════════════════════════════════════════ */
        .steps-table {
          border: 1px solid var(--border);
        }

        .steps-table-row {
          display: grid;
          grid-template-columns: 4rem 1fr auto;
          gap: 2rem;
          align-items: center;
          padding: 2rem;
          border-bottom: 1px solid var(--border);
          transition: background 0.12s;
        }

        .steps-table-row:hover { background: var(--bg-2); }

        .steps-table-row-last {
          border-bottom: none;
        }

        @media (max-width: 640px) {
          .steps-table-row {
            grid-template-columns: 2.5rem 1fr;
            gap: 1rem;
          }
          .step-detail { display: none; }
        }

        .step-index {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .step-index-num {
          font-size: 0.75rem;
          color: var(--subtle);
          letter-spacing: 0.05em;
        }

        .step-title {
          font-family: var(--font-display);
          font-size: 1.0625rem;
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--text);
          margin-bottom: 0.5rem;
        }

        .step-body {
          font-size: 0.875rem;
          font-weight: 300;
          color: var(--muted);
          line-height: 1.7;
          max-width: 38rem;
        }

        .step-detail-badge {
          font-size: 0.625rem;
          color: var(--subtle);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border: 1px solid var(--border);
          padding: 0.3rem 0.625rem;
          white-space: nowrap;
        }

        .step-detail-accent {
          color: var(--accent) !important;
          border-color: var(--accent-border) !important;
        }

        /* ═══════════════════════════════════════════════════════
           FEATURES — NUMBERED LIST
        ═══════════════════════════════════════════════════════ */
        .features-list {
          border: 1px solid var(--border);
        }

        .feature-row {
          display: grid;
          grid-template-columns: 3rem 1fr auto;
          gap: 2rem;
          align-items: center;
          padding: 1.75rem 2rem;
          border-bottom: 1px solid var(--border);
          transition: background 0.12s;
        }

        .feature-row:last-child { border-bottom: none; }

        .feature-row:hover { background: var(--bg-2); }

        .feature-row-accent {
          background: var(--accent-dim);
        }

        .feature-row-accent:hover {
          background: oklch(65% 0.2 145 / 0.12);
        }

        @media (max-width: 768px) {
          .feature-row {
            grid-template-columns: 2.5rem 1fr;
            gap: 1rem;
          }
          .feature-tags { display: none; }
        }

        .feature-num {
          font-size: 0.6875rem;
          color: var(--subtle);
          letter-spacing: 0.05em;
          text-align: center;
        }

        .feature-title {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--text);
          margin-bottom: 0.375rem;
        }

        .feature-desc {
          font-size: 0.875rem;
          font-weight: 300;
          color: var(--muted);
          line-height: 1.65;
          max-width: 40rem;
        }

        .feature-tags {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          align-items: flex-end;
        }

        .feature-tag {
          font-family: var(--font-mono);
          font-size: 0.5625rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--subtle);
          border: 1px solid var(--border);
          padding: 0.2rem 0.5rem;
          white-space: nowrap;
        }

        .feature-tag-accent {
          color: var(--accent);
          border-color: var(--accent-border);
        }

        /* ═══════════════════════════════════════════════════════
           PAIN POINTS
        ═══════════════════════════════════════════════════════ */
        .pain-grid {
          border: 1px solid var(--border);
        }

        .pain-item {
          display: grid;
          grid-template-columns: 1.5rem 2.5rem 1fr;
          gap: 1rem;
          align-items: center;
          padding: 1.125rem 1.5rem;
          border-bottom: 1px solid var(--border);
          transition: background 0.12s;
        }

        .pain-item:hover { background: var(--bg-2); }

        @media (max-width: 640px) {
          .pain-item { grid-template-columns: 1.5rem 1fr; }
          .pain-num { display: none; }
        }

        .pain-x {
          font-size: 0.5625rem;
          color: #ef4444;
          opacity: 0.7;
          letter-spacing: 0.05em;
        }

        .pain-num {
          font-size: 0.5625rem;
          color: var(--subtle);
          letter-spacing: 0.05em;
        }

        .pain-text {
          font-size: 0.875rem;
          font-weight: 300;
          color: var(--muted);
          line-height: 1.5;
        }

        .pain-resolution {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          background: var(--accent-dim);
          border-top: 1px solid var(--accent-border);
        }

        .pain-check {
          font-family: var(--font-mono);
          font-size: 1rem;
          color: var(--accent);
          flex-shrink: 0;
        }

        .pain-resolution p {
          font-family: var(--font-display);
          font-size: 0.9375rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text);
        }

        /* ═══════════════════════════════════════════════════════
           PRICING
        ═══════════════════════════════════════════════════════ */
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          max-width: 48rem;
          border: 1px solid var(--border);
          overflow: hidden;
          gap: 0;
        }

        @media (max-width: 640px) {
          .pricing-grid { grid-template-columns: 1fr; }
        }

        .pricing-card {
          background: var(--bg-2);
          padding: 2.5rem 2rem;
          position: relative;
          border-right: 1px solid var(--border);
        }

        .pricing-card:last-child { border-right: none; }

        @media (max-width: 640px) {
          .pricing-card { border-right: none; border-bottom: 1px solid var(--border); }
          .pricing-card:last-child { border-bottom: none; }
        }

        .pricing-card-featured {
          background: var(--bg-3);
        }

        .pricing-popular-badge {
          font-size: 0.5625rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: var(--accent);
          margin-bottom: 0.75rem;
          display: block;
        }

        .pricing-tier-label {
          font-size: 0.625rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: var(--muted);
          margin-bottom: 0.75rem;
          display: block;
        }

        .pricing-price-row {
          display: flex;
          align-items: baseline;
          gap: 0.25rem;
          margin-bottom: 0.625rem;
        }

        .pricing-amount {
          font-family: var(--font-display);
          font-size: 3.25rem;
          font-weight: 800;
          letter-spacing: -0.05em;
          color: var(--text);
          line-height: 1;
        }

        .pricing-period {
          font-size: 0.75rem;
          color: var(--subtle);
          letter-spacing: 0.02em;
        }

        .pricing-desc {
          font-size: 0.875rem;
          font-weight: 300;
          color: var(--muted);
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .pricing-features {
          list-style: none;
          margin-top: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }

        .pricing-feature {
          display: flex;
          align-items: flex-start;
          gap: 0.625rem;
          font-size: 0.875rem;
          font-weight: 300;
          color: var(--muted);
          line-height: 1.4;
        }

        .check {
          font-size: 0.6875rem;
          color: var(--subtle);
          flex-shrink: 0;
          margin-top: 0.15rem;
        }

        .check-accent { color: var(--accent); }

        .pricing-footer {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 0.875rem;
          font-weight: 300;
          color: var(--subtle);
        }

        .accent-link {
          color: var(--accent);
          transition: opacity 0.12s;
        }

        .accent-link:hover { opacity: 0.75; }

        /* ═══════════════════════════════════════════════════════
           CTA
        ═══════════════════════════════════════════════════════ */
        .cta-layout {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 4rem;
          align-items: center;
        }

        @media (max-width: 900px) {
          .cta-layout { grid-template-columns: 1fr; gap: 3rem; }
        }

        .cta-heading {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3.5rem);
          font-weight: 800;
          line-height: 1.02;
          letter-spacing: -0.04em;
          color: var(--text);
          margin-bottom: 1rem;
        }

        .cta-body {
          font-size: 1rem;
          font-weight: 300;
          color: var(--muted);
          line-height: 1.65;
          max-width: 30rem;
          margin-bottom: 0.5rem;
        }

        .cta-fine {
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          color: var(--subtle);
          letter-spacing: 0.03em;
          margin-bottom: 2rem;
        }

        .cta-stats {
          border: 1px solid var(--border);
          min-width: 14rem;
          flex-shrink: 0;
        }

        .cta-stat-row {
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .cta-stat-divider {
          height: 1px;
          background: var(--border);
        }

        .cta-stat-num {
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--accent);
          line-height: 1;
        }

        .cta-stat-label {
          font-size: 0.6875rem;
          color: var(--subtle);
          letter-spacing: 0.05em;
        }

        /* ═══════════════════════════════════════════════════════
           FOOTER
        ═══════════════════════════════════════════════════════ */
        .site-footer {
          border-top: 1px solid var(--border);
          padding: 2.5rem 0;
        }

        .footer-inner {
          max-width: 80rem;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        @media (min-width: 768px) {
          .footer-inner {
            flex-direction: row;
            justify-content: space-between;
          }
        }

        .footer-logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .footer-wordmark {
          font-family: var(--font-display);
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: var(--muted);
        }

        .footer-copy {
          font-size: 0.75rem;
          color: var(--subtle);
          letter-spacing: 0.01em;
        }

        .footer-links {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .footer-link {
          font-size: 0.8125rem;
          color: var(--subtle);
          transition: color 0.12s;
        }

        .footer-link:hover { color: var(--muted); }

        /* ═══════════════════════════════════════════════════════
           ENTRANCE ANIMATIONS
        ═══════════════════════════════════════════════════════ */
        .animate-in {
          animation: fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .animate-in-right {
          animation: fade-left 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .delay-0 { animation-delay: 0ms; }
        .delay-1 { animation-delay: 80ms; }
        .delay-2 { animation-delay: 180ms; }
        .delay-3 { animation-delay: 280ms; }
        .delay-4 { animation-delay: 380ms; }

        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-left {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        /* ═══════════════════════════════════════════════════════
           SCROLL-DRIVEN REVEALS
        ═══════════════════════════════════════════════════════ */
        @supports (animation-timeline: scroll()) {
          .section-bordered,
          .section-padded {
            animation: section-reveal linear both;
            animation-timeline: view();
            animation-range: entry 0% entry 15%;
          }

          @keyframes section-reveal {
            from { opacity: 0.4; }
            to   { opacity: 1; }
          }
        }

        /* ═══════════════════════════════════════════════════════
           REDUCED MOTION
        ═══════════════════════════════════════════════════════ */
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }

          .hero-mockup {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
