export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>

      {/* ─── Nav ─────────────────────────────────────────────── */}
      <nav style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="kodi-mark" aria-hidden="true">K</div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>Kodi</span>
          </div>

          <div className="hidden md:flex items-center gap-8" style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
            <a href="#how-it-works" className="nav-link">How it works</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#pricing" className="nav-link">Pricing</a>
          </div>

          <a href={appUrl} className="btn-primary" style={{ fontSize: '0.8125rem' }}>
            Get early access
          </a>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6" style={{ paddingTop: 'clamp(4rem, 10vw, 7rem)', paddingBottom: 'clamp(3rem, 8vw, 5rem)' }}>
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-8" style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span className="pulse-dot" aria-hidden="true" />
            Early access · Built for small sales teams
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.75rem, 6vw, 5.5rem)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: '1.5rem' }}>
            Your team's first<br />
            <span style={{ color: 'var(--accent)' }}>AI sales rep.</span>
          </h1>

          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', color: 'var(--muted)', lineHeight: 1.65, maxWidth: '38rem', marginBottom: '0.75rem' }}>
            Kodi gives your team a dedicated AI agent that researches leads, drafts outreach,
            and tracks every conversation — so you can close deals, not chase admin.
          </p>

          <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', marginBottom: '2.5rem' }}>
            One click to deploy. Works with your Gmail. Your whole team, one shared agent.
          </p>

          <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: '1.25rem' }}>
            <a href={appUrl} className="btn-primary btn-lg">
              Get your agent now →
            </a>
            <a href="#how-it-works" className="btn-ghost btn-lg">
              See how it works
            </a>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
            No credit card required · Live in under 5 minutes · No DevOps needed
          </p>
        </div>

        {/* Feed Preview */}
        <div className="mt-16 max-w-2xl">
          <div className="feed-preview-window">
            {/* Window chrome */}
            <div className="feed-chrome">
              <span className="chrome-dot" style={{ background: '#ff5f57' }} />
              <span className="chrome-dot" style={{ background: '#febc2e' }} />
              <span className="chrome-dot" style={{ background: '#28c840' }} />
              <span style={{ fontSize: '0.6875rem', color: 'var(--subtle)', marginLeft: '0.75rem' }}>
                Kodi — Your agent is watching
              </span>
            </div>

            {/* Feed items */}
            <div className="feed-body">
              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#ef4444' }} />
                <div className="feed-text">
                  <p className="feed-headline">Acme Corp hasn't heard from you in 8 days</p>
                  <p className="feed-sub">Their trial ends Friday — high churn risk</p>
                </div>
                <button className="feed-action">Draft follow-up</button>
              </div>

              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#f59e0b' }} />
                <div className="feed-text">
                  <p className="feed-headline">3 leads from Tuesday's webinar — not contacted</p>
                  <p className="feed-sub">Sarah Chen, Marcus Bell, and 1 other</p>
                </div>
                <button className="feed-action">Research all</button>
              </div>

              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#22c55e' }} />
                <div className="feed-text">
                  <p className="feed-headline">Jordan at Stripe opened your email 4 times</p>
                  <p className="feed-sub">Sent 2 days ago — looks interested</p>
                </div>
                <button className="feed-action">Follow up</button>
              </div>
            </div>
          </div>
          <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--subtle)', textAlign: 'left' }}>
            Kodi surfaces what needs your attention — so nothing slips through.
          </p>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────── */}
      <section id="how-it-works" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 'clamp(4rem, 8vw, 6rem) 0' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="section-label">How it works</div>
          <h2 className="section-heading">Up and running in minutes.</h2>

          <div className="steps-grid">
            {/* Step 01 */}
            <div className="step-item">
              <div className="step-number" aria-hidden="true">01</div>
              <div className="step-content">
                <h3 className="step-title">Sign up &amp; launch</h3>
                <p className="step-body">
                  Create your account and click "Launch agent." Kodi spins up your own dedicated AI instance
                  in under 5 minutes — no servers to manage, ever.
                </p>
              </div>
            </div>
            {/* Step 02 */}
            <div className="step-item">
              <div className="step-number" aria-hidden="true">02</div>
              <div className="step-content">
                <h3 className="step-title">Connect your tools</h3>
                <p className="step-body">
                  Link Gmail in one click. Kodi reads your email history, learns who you've talked to,
                  and starts building context on your pipeline — automatically.
                </p>
              </div>
            </div>
            {/* Step 03 */}
            <div className="step-item">
              <div className="step-number" aria-hidden="true">03</div>
              <div className="step-content">
                <h3 className="step-title">Let the agent work</h3>
                <p className="step-body">
                  Kodi surfaces what matters every day: stale leads, warm replies, follow-ups due.
                  Ask it anything. It drafts, researches, and remembers — so you don't have to.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────── */}
      <section id="features" style={{ padding: 'clamp(4rem, 8vw, 6rem) 0' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="section-label">Features</div>
          <h2 className="section-heading">Everything your pipeline needs.</h2>
          <p className="section-sub">
            Kodi doesn't replace your team. It's the teammate that never forgets, never sleeps,
            and never drops a follow-up.
          </p>

          {/* Bento grid */}
          <div className="bento-grid">
            {/* THE FEED — large feature card, spans 2 cols × 2 rows */}
            <div className="bento-card bento-featured">
              <div className="bento-label">The Feed</div>
              <h3 className="bento-title">Your daily<br />action list.</h3>
              <p className="bento-body">
                Every morning, Kodi surfaces your most important actions — stale deals, warm replies,
                leads that need attention. No dashboards to check. Just what needs doing.
              </p>
              <div className="bento-tags">
                <span className="bento-tag">Prioritized</span>
                <span className="bento-tag">Auto-updated</span>
                <span className="bento-tag">Actionable</span>
              </div>
              {/* Mini feed decoration */}
              <div className="bento-mini-feed" aria-hidden="true">
                <div className="mini-item"><span className="mini-dot" style={{ background: '#ef4444' }} />Acme Corp trial ends Friday</div>
                <div className="mini-item"><span className="mini-dot" style={{ background: '#f59e0b' }} />3 webinar leads uncontacted</div>
                <div className="mini-item"><span className="mini-dot" style={{ background: '#22c55e' }} />Jordan opened email 4×</div>
              </div>
            </div>

            {/* Lead research — medium */}
            <div className="bento-card bento-medium">
              <div className="bento-label">Lead Research</div>
              <h3 className="bento-title">Company intel<br />in seconds.</h3>
              <p className="bento-body">
                Ask Kodi about any company or person. Get a sharp research card — overview, key people,
                recent news, funding — instantly.
              </p>
              <div className="bento-tags">
                <span className="bento-tag">Company intel</span>
                <span className="bento-tag">People search</span>
                <span className="bento-tag">News tracking</span>
              </div>
            </div>

            {/* Email drafts — medium */}
            <div className="bento-card bento-medium">
              <div className="bento-label">Email Drafts</div>
              <h3 className="bento-title">Personalized<br />outreach, fast.</h3>
              <p className="bento-body">
                Tell Kodi who to write to and why. It crafts a personalized email using everything it knows —
                past conversations, their company, your product.
              </p>
              <div className="bento-tags">
                <span className="bento-tag">Cold outreach</span>
                <span className="bento-tag">Follow-ups</span>
                <span className="bento-tag">Personalized</span>
              </div>
            </div>

            {/* Shared team brain — small */}
            <div className="bento-card bento-small">
              <div className="bento-label">Shared Team Brain</div>
              <h3 className="bento-title-sm">One agent.<br />Whole team.</h3>
              <p className="bento-body-sm">
                Everyone works with the same agent, sees the same context. No more knowledge siloed in inboxes.
              </p>
              <div className="bento-tags">
                <span className="bento-tag">Multi-user</span>
                <span className="bento-tag">Shared context</span>
              </div>
            </div>

            {/* Ask it anything — small */}
            <div className="bento-card bento-small">
              <div className="bento-label">Natural Language</div>
              <h3 className="bento-title-sm">Ask it<br />anything.</h3>
              <p className="bento-body-sm">
                "What happened with the Notion deal?" "Who have I not followed up with this week?" It knows.
              </p>
              <div className="bento-tags">
                <span className="bento-tag">Full context</span>
                <span className="bento-tag">Instant answers</span>
              </div>
            </div>

            {/* Private instance — small accent */}
            <div className="bento-card bento-small bento-accent">
              <div className="bento-label">Your Own Instance</div>
              <h3 className="bento-title-sm">Private<br />by design.</h3>
              <p className="bento-body-sm">
                Every team gets a dedicated agent. Your data never touches another company's instance.
              </p>
              <div className="bento-tags">
                <span className="bento-tag bento-tag-dark">Dedicated</span>
                <span className="bento-tag bento-tag-dark">Isolated</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pain Points ──────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)', padding: 'clamp(4rem, 8vw, 6rem) 0' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="pain-section">
            <div className="pain-left">
              <div className="section-label">Sound familiar?</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.025em', color: 'var(--text)', marginBottom: '1rem' }}>
                The real cost<br />of not having Kodi.
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9375rem', lineHeight: 1.65, maxWidth: '28rem' }}>
                Every hour spent on admin is an hour not spent closing. Small teams can't afford the waste.
              </p>
            </div>
            <div className="pain-right">
              {[
                'Spending hours researching leads that go nowhere',
                'Follow-ups falling through the cracks',
                'Writing the same prospecting emails over and over',
                'Losing context when teammates change',
                'Can\'t afford a bigger team, but need to grow',
                'Switching between 5 tools to find one answer',
              ].map((pain) => (
                <div key={pain} className="pain-item">
                  <span className="pain-x" aria-hidden="true">✕</span>
                  <p>{pain}</p>
                </div>
              ))}
              <div className="pain-resolution">
                <p>Kodi handles all of this. You focus on closing.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" style={{ borderTop: '1px solid var(--border)', padding: 'clamp(4rem, 8vw, 6rem) 0' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="section-label">Pricing</div>
          <h2 className="section-heading">One team. One agent.<br />One price.</h2>
          <p className="section-sub">
            Flat per-team pricing — not per seat. Your whole team uses the same agent for one monthly fee.
          </p>

          <div className="pricing-grid">
            {/* Starter */}
            <div className="pricing-card">
              <div className="pricing-tier">Starter</div>
              <div className="pricing-price">
                <span>$49</span>
                <span className="pricing-period">/month</span>
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
                    <span className="check-mark" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div className="pricing-card pricing-card-featured">
              <div className="pricing-popular">Most popular</div>
              <div className="pricing-tier" style={{ color: 'var(--accent)' }}>Pro</div>
              <div className="pricing-price">
                <span>$99</span>
                <span className="pricing-period">/month</span>
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
                    <span className="check-mark check-mark-accent" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem', color: 'var(--subtle)' }}>
            All plans include a 14-day free trial. No credit card required.{' '}
            <a href="mailto:hello@kodi.so" style={{ color: 'var(--accent)' }}>
              Need something custom? Talk to us →
            </a>
          </p>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)', padding: 'clamp(4rem, 8vw, 6rem) 0' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="cta-block">
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: '1rem' }}>
                Stop managing leads.<br />
                <span style={{ color: 'var(--accent)' }}>Start closing them.</span>
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.65, maxWidth: '30rem', marginBottom: '0.5rem' }}>
                Your team deserves an AI agent that actually understands your business.
                Kodi is ready in under 5 minutes.
              </p>
              <p style={{ color: 'var(--subtle)', fontSize: '0.8125rem', marginBottom: '2rem' }}>
                No engineers required. No configuration. No nonsense.
              </p>
              <a href={appUrl} className="btn-primary btn-lg">
                Get your agent — free for 14 days →
              </a>
            </div>
            <div className="cta-stat-block" aria-hidden="true">
              <div className="cta-stat">
                <span className="cta-stat-num">5 min</span>
                <span className="cta-stat-label">to go live</span>
              </div>
              <div className="cta-stat-divider" />
              <div className="cta-stat">
                <span className="cta-stat-num">14 days</span>
                <span className="cta-stat-label">free trial</span>
              </div>
              <div className="cta-stat-divider" />
              <div className="cta-stat">
                <span className="cta-stat-num">1 price</span>
                <span className="cta-stat-label">for whole team</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2.5rem 0' }}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="kodi-mark kodi-mark-sm" aria-hidden="true">K</div>
            <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Kodi</span>
          </div>
          <p style={{ color: 'var(--subtle)', fontSize: '0.8125rem' }}>
            © {new Date().getFullYear()} Kodi. Built for small teams that want to win.
          </p>
          <div className="flex items-center gap-6" style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>
            <a href="/privacy" className="footer-link">Privacy</a>
            <a href="/terms" className="footer-link">Terms</a>
            <a href="mailto:hello@kodi.so" className="footer-link">Contact</a>
          </div>
        </div>
      </footer>

      {/* ─── Design System Styles ─────────────────────────────── */}
      <style>{`
        /* ── Custom Properties ── */
        :root {
          --bg:           #0e0c0a;
          --bg-2:         #141210;
          --bg-3:         #1a1714;
          --border:       rgba(255,255,255,0.08);
          --border-2:     rgba(255,255,255,0.12);
          --text:         #f0ede8;
          --muted:        #9a9187;
          --subtle:       #5c554e;
          --accent:       #c9a84c;
          --accent-dim:   rgba(201,168,76,0.15);
          --accent-border: rgba(201,168,76,0.35);
          --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
          --font-body:    'DM Sans', system-ui, sans-serif;
        }

        /* ── Base ── */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
        }
        a { text-decoration: none; color: inherit; }

        /* ── Logo mark ── */
        .kodi-mark {
          width: 2rem; height: 2rem;
          background: var(--accent);
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-weight: 800;
          font-size: 0.9rem;
          color: #0e0c0a;
          flex-shrink: 0;
        }
        .kodi-mark-sm { width: 1.5rem; height: 1.5rem; border-radius: 4px; font-size: 0.7rem; }

        /* ── Nav links ── */
        .nav-link {
          color: var(--muted);
          transition: color 0.15s;
        }
        .nav-link:hover { color: var(--text); }

        /* ── Buttons ── */
        .btn-primary {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0.5rem 1.125rem;
          background: var(--accent);
          color: #0e0c0a;
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 0.875rem;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
          white-space: nowrap;
        }
        .btn-primary:hover { background: #d4b562; }

        .btn-ghost {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0.5rem 1.125rem;
          background: transparent;
          color: var(--muted);
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 0.875rem;
          border-radius: 6px;
          border: 1px solid var(--border-2);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .btn-ghost:hover { color: var(--text); border-color: rgba(255,255,255,0.25); }

        .btn-lg { padding: 0.75rem 1.75rem; font-size: 0.9375rem; }
        .btn-block { display: block; width: 100%; text-align: center; padding: 0.6875rem 1rem; }

        /* ── Pulse dot ── */
        .pulse-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }

        /* ── Feed Preview ── */
        .feed-preview-window {
          border-radius: 12px;
          border: 1px solid var(--border-2);
          background: var(--bg-2);
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        }
        .feed-chrome {
          display: flex; align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-3);
          gap: 0.375rem;
        }
        .chrome-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
          display: inline-block;
          opacity: 0.7;
        }
        .feed-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.625rem; }
        .feed-item {
          display: flex; align-items: flex-start; gap: 0.75rem;
          padding: 0.875rem 1rem;
          border-radius: 8px;
          background: var(--bg-3);
          border: 1px solid var(--border);
        }
        .feed-dot {
          width: 8px; height: 8px; border-radius: 50%;
          flex-shrink: 0; margin-top: 0.3rem;
        }
        .feed-text { flex: 1; min-width: 0; }
        .feed-headline { font-size: 0.875rem; font-weight: 500; color: var(--text); margin-bottom: 0.2rem; }
        .feed-sub { font-size: 0.75rem; color: var(--subtle); }
        .feed-action {
          flex-shrink: 0;
          font-size: 0.6875rem;
          font-weight: 500;
          font-family: var(--font-body);
          padding: 0.3125rem 0.625rem;
          border-radius: 5px;
          background: var(--accent-dim);
          color: var(--accent);
          border: 1px solid var(--accent-border);
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .feed-action:hover { background: rgba(201,168,76,0.25); }

        /* ── Section typography ── */
        .section-label {
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1rem;
        }
        .section-heading {
          font-family: var(--font-display);
          font-size: clamp(1.875rem, 4vw, 3rem);
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -0.025em;
          color: var(--text);
          margin-bottom: 1rem;
        }
        .section-sub {
          color: var(--muted);
          font-size: clamp(0.9375rem, 1.5vw, 1.0625rem);
          line-height: 1.65;
          max-width: 38rem;
          margin-bottom: 3rem;
        }

        /* ── How it works ── */
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .steps-grid { grid-template-columns: 1fr; }
        }
        .step-item {
          padding: 2.5rem 2rem;
          border-right: 1px solid var(--border);
          position: relative;
        }
        .step-item:last-child { border-right: none; }
        @media (max-width: 768px) {
          .step-item { border-right: none; border-bottom: 1px solid var(--border); }
          .step-item:last-child { border-bottom: none; }
        }
        .step-number {
          font-family: var(--font-display);
          font-size: 4rem;
          font-weight: 800;
          color: rgba(201,168,76,0.12);
          line-height: 1;
          margin-bottom: 1.25rem;
          letter-spacing: -0.04em;
        }
        .step-title {
          font-family: var(--font-display);
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 0.75rem;
          letter-spacing: -0.015em;
        }
        .step-body { font-size: 0.9rem; color: var(--muted); line-height: 1.7; }

        /* ── Bento Grid ── */
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: auto;
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        @media (max-width: 900px) {
          .bento-grid { grid-template-columns: 1fr; }
          .bento-featured { grid-column: span 1 !important; grid-row: span 1 !important; }
          .bento-medium { grid-column: span 1 !important; }
        }

        .bento-card {
          background: var(--bg-2);
          padding: 2rem;
          position: relative;
          transition: background 0.2s;
        }
        .bento-card:hover { background: var(--bg-3); }

        .bento-featured {
          grid-column: span 2;
          grid-row: span 2;
        }
        .bento-medium { grid-column: span 1; }
        .bento-small { grid-column: span 1; }
        .bento-accent {
          background: var(--accent-dim);
        }
        .bento-accent:hover { background: rgba(201,168,76,0.2); }

        .bento-label {
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1rem;
        }
        .bento-title {
          font-family: var(--font-display);
          font-size: clamp(1.5rem, 2.5vw, 2.125rem);
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -0.025em;
          color: var(--text);
          margin-bottom: 1rem;
        }
        .bento-title-sm {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: var(--text);
          margin-bottom: 0.75rem;
        }
        .bento-body {
          font-size: 0.9rem;
          color: var(--muted);
          line-height: 1.7;
          max-width: 30rem;
          margin-bottom: 1.5rem;
        }
        .bento-body-sm {
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.65;
          margin-bottom: 1.25rem;
        }
        .bento-tags {
          display: flex; flex-wrap: wrap; gap: 0.375rem;
        }
        .bento-tag {
          font-size: 0.6875rem;
          padding: 0.25rem 0.625rem;
          border-radius: 4px;
          background: rgba(255,255,255,0.06);
          color: var(--muted);
          border: 1px solid var(--border);
        }
        .bento-tag-dark {
          background: rgba(0,0,0,0.3);
          color: var(--accent);
          border-color: var(--accent-border);
        }

        /* Mini feed in featured card */
        .bento-mini-feed {
          margin-top: 2rem;
          padding: 1rem;
          background: var(--bg);
          border-radius: 8px;
          border: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 0.5rem;
          max-width: 24rem;
        }
        .mini-item {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--muted);
        }
        .mini-dot {
          width: 6px; height: 6px; border-radius: 50%;
          display: inline-block; flex-shrink: 0;
        }

        /* ── Pain section ── */
        .pain-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: start;
        }
        @media (max-width: 768px) { .pain-section { grid-template-columns: 1fr; gap: 2.5rem; } }
        .pain-right { display: flex; flex-direction: column; gap: 0; }
        .pain-item {
          display: flex; align-items: flex-start; gap: 0.875rem;
          padding: 0.875rem 0;
          border-bottom: 1px solid var(--border);
          font-size: 0.9rem;
          color: var(--muted);
        }
        .pain-x {
          font-size: 0.625rem;
          color: #ef4444;
          opacity: 0.7;
          margin-top: 0.25rem;
          flex-shrink: 0;
          font-weight: 700;
        }
        .pain-resolution {
          margin-top: 1.5rem;
          padding: 1.25rem 1.5rem;
          background: var(--accent-dim);
          border: 1px solid var(--accent-border);
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          color: var(--text);
        }

        /* ── Pricing ── */
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          max-width: 48rem;
          margin: 0 auto;
        }
        @media (max-width: 640px) { .pricing-grid { grid-template-columns: 1fr; } }
        .pricing-card {
          background: var(--bg-2);
          padding: 2.5rem 2rem;
          position: relative;
        }
        .pricing-card-featured {
          background: var(--bg-3);
        }
        .pricing-popular {
          display: inline-block;
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1rem;
        }
        .pricing-tier {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 0.75rem;
        }
        .pricing-price {
          display: flex; align-items: baseline; gap: 0.25rem;
          margin-bottom: 0.5rem;
        }
        .pricing-price > span:first-child {
          font-family: var(--font-display);
          font-size: 3rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--text);
          line-height: 1;
        }
        .pricing-period { font-size: 0.875rem; color: var(--subtle); }
        .pricing-desc { font-size: 0.875rem; color: var(--muted); margin-bottom: 1.5rem; line-height: 1.5; }
        .pricing-features { list-style: none; margin-top: 1.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .pricing-feature {
          display: flex; align-items: flex-start; gap: 0.625rem;
          font-size: 0.875rem;
          color: var(--muted);
        }
        .check-mark { color: var(--subtle); flex-shrink: 0; font-size: 0.8rem; margin-top: 0.1rem; }
        .check-mark-accent { color: var(--accent); }

        /* ── CTA block ── */
        .cta-block {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 4rem;
          align-items: center;
        }
        @media (max-width: 900px) { .cta-block { grid-template-columns: 1fr; gap: 3rem; } }
        .cta-stat-block {
          display: flex;
          flex-direction: column;
          gap: 0;
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          min-width: 14rem;
        }
        @media (max-width: 900px) {
          .cta-stat-block { flex-direction: row; min-width: unset; }
        }
        .cta-stat {
          display: flex; flex-direction: column;
          padding: 1.5rem 2rem;
          gap: 0.25rem;
        }
        @media (max-width: 900px) { .cta-stat { flex: 1; padding: 1rem 1.25rem; } }
        .cta-stat-divider {
          height: 1px; width: 100%;
          background: var(--border);
        }
        @media (max-width: 900px) {
          .cta-stat-divider { width: 1px; height: auto; }
        }
        .cta-stat-num {
          font-family: var(--font-display);
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--accent);
          line-height: 1;
        }
        .cta-stat-label { font-size: 0.75rem; color: var(--subtle); }

        /* ── Footer links ── */
        .footer-link { color: var(--subtle); transition: color 0.15s; }
        .footer-link:hover { color: var(--muted); }
      `}</style>
    </div>
  )
}
