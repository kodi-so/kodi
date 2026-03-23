export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
        }}
      />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.15) 0%, transparent 70%)',
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">Kodi</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>
        <a
          href={appUrl}
          className="text-sm px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-100 transition-colors"
        >
          Get early access
        </a>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-32 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Built for small sales teams · Now in early access
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          Your team's first{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #818cf8, #a78bfa, #f472b6, #818cf8)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradient-shift 4s ease infinite',
            }}
          >
            AI sales rep
          </span>
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mb-6 leading-relaxed">
          Kodi gives your team a dedicated AI agent that researches leads, drafts outreach,
          and tracks every conversation — so you can close deals, not chase admin.
        </p>

        <p className="text-sm text-zinc-500 mb-10">
          One click to deploy. Works with your Gmail. Your whole team, one shared agent.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <a
            href={appUrl}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/25 text-sm"
          >
            Get your agent now →
          </a>
          <a
            href="#how-it-works"
            className="px-8 py-3.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm"
          >
            See how it works
          </a>
        </div>

        <p className="mt-6 text-xs text-zinc-600">No credit card required · Live in under 5 minutes · No DevOps needed</p>

        {/* Fake Feed Preview */}
        <div className="mt-20 w-full max-w-2xl">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 overflow-hidden shadow-2xl shadow-black/50">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
              <span className="ml-3 text-xs text-zinc-600">Kodi — Your agent is watching</span>
            </div>
            <div className="p-5 space-y-3">
              {/* Feed item 1 */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
                <div className="mt-0.5 w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">Acme Corp hasn't heard from you in 8 days</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Their trial ends Friday — high churn risk</p>
                </div>
                <button className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors">
                  Draft follow-up
                </button>
              </div>
              {/* Feed item 2 */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
                <div className="mt-0.5 w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">3 leads from Tuesday's webinar — not contacted</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Sarah Chen, Marcus Bell, and 1 other</p>
                </div>
                <button className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors">
                  Research all
                </button>
              </div>
              {/* Feed item 3 */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
                <div className="mt-0.5 w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">Jordan at Stripe opened your email 4 times</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Sent 2 days ago — looks interested</p>
                </div>
                <button className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors">
                  Follow up
                </button>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-600 text-center">Kodi surfaces what needs your attention — so nothing slips through.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative z-10 px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Up and running in minutes</h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            No technical setup. No DevOps. No configuration hell. Just sign up and go.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              title: 'Sign up & launch',
              description: 'Create your account and click "Launch agent." Kodi spins up your own dedicated AI instance in under 5 minutes — no servers to manage, ever.',
              icon: (
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
              ),
            },
            {
              step: '02',
              title: 'Connect your tools',
              description: 'Link Gmail in one click. Kodi reads your email history, learns who you\'ve talked to, and starts building context on your pipeline — automatically.',
              icon: (
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
              ),
            },
            {
              step: '03',
              title: 'Let the agent work',
              description: 'Kodi surfaces what matters every day: stale leads, warm replies, follow-ups due. Ask it anything. It drafts, researches, and remembers — so you don\'t have to.',
              icon: (
                <svg className="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              ),
            },
          ].map((item) => (
            <div key={item.step} className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="text-xs font-mono text-zinc-600">{item.step}</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Everything your pipeline needs</h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Kodi doesn't replace your team. It's the teammate that never forgets, never sleeps, and never drops a follow-up.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              color: 'indigo',
              icon: (
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
              ),
              title: 'The Feed',
              description: 'Every morning, Kodi surfaces your most important actions — stale deals, warm replies, leads that need attention. No dashboards to check. Just what needs doing.',
              tags: ['Prioritized', 'Auto-updated', 'Actionable'],
            },
            {
              color: 'purple',
              icon: (
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              ),
              title: 'Instant lead research',
              description: 'Ask Kodi about any company or person. Get back a sharp research card — company overview, key people, recent news, funding — in seconds, not hours.',
              tags: ['Company intel', 'People search', 'News tracking'],
            },
            {
              color: 'pink',
              icon: (
                <svg className="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              ),
              title: 'Email drafts in seconds',
              description: 'Tell Kodi who to write to and why. It writes a personalized email using everything it knows — past conversations, their company, your product. You review and send.',
              tags: ['Cold outreach', 'Follow-ups', 'Personalized'],
            },
            {
              color: 'emerald',
              icon: (
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              ),
              title: 'Shared team brain',
              description: 'Invite your whole team. Everyone works with the same agent, sees the same context, and benefits from every interaction — no more knowledge siloed in inboxes.',
              tags: ['Multi-user', 'Shared context', 'Activity log'],
            },
            {
              color: 'amber',
              icon: (
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
              ),
              title: 'Ask it anything',
              description: 'Chat with your agent like a colleague who knows your whole business. "What happened with the Notion deal?" "Who have I not followed up with this week?" It knows.',
              tags: ['Natural language', 'Full context', 'Instant answers'],
            },
            {
              color: 'sky',
              icon: (
                <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              ),
              title: 'Your own private instance',
              description: 'Unlike shared AI tools, Kodi gives every team their own dedicated agent. Your data never touches another company\'s instance. Private by design, not by policy.',
              tags: ['Dedicated instance', 'Data isolation', 'Audit trail'],
            },
          ].map((feature) => {
            const colorMap: Record<string, string> = {
              indigo: 'hover:border-indigo-500/50',
              purple: 'hover:border-purple-500/50',
              pink: 'hover:border-pink-500/50',
              emerald: 'hover:border-emerald-500/50',
              amber: 'hover:border-amber-500/50',
              sky: 'hover:border-sky-500/50',
            }
            return (
              <div
                key={feature.title}
                className={`relative group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 transition-all duration-300 ${colorMap[feature.color]}`}
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-zinc-400 leading-relaxed text-sm mb-6">{feature.description}</p>
                <div className="flex flex-wrap gap-2">
                  {feature.tags.map(tag => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{tag}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Social proof / Pain points */}
      <section className="relative z-10 px-6 py-20 max-w-4xl mx-auto">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-12">
          <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-8 text-center">Sound familiar?</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              'Spending hours researching leads that go nowhere',
              'Follow-ups falling through the cracks',
              'Writing the same prospecting emails over and over',
              'Losing context when teammates change',
              'Can\'t afford a bigger team, but need to grow',
              'Switching between 5 tools to find one answer',
            ].map((pain) => (
              <div key={pain} className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
                <p className="text-zinc-300 text-sm">{pain}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-8 border-t border-zinc-800 text-center">
            <p className="text-white font-semibold text-lg">Kodi handles all of this. You focus on closing.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">One team. One agent. One price.</h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Flat per-team pricing — not per seat. Your whole team uses the same agent for one monthly fee.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Starter */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <p className="text-sm font-semibold text-zinc-400 mb-2">Starter</p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-bold">$49</span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
            <p className="text-zinc-500 text-sm mb-8">For small teams getting their first AI agent.</p>
            <a href={appUrl} className="block w-full text-center px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-medium hover:border-zinc-500 hover:text-white transition-colors mb-8">
              Start free trial
            </a>
            <ul className="space-y-3 text-sm text-zinc-400">
              {[
                'Up to 5 team members',
                'Dedicated OpenClaw instance',
                'Gmail integration',
                'Lead research & email drafting',
                'The Feed — daily action items',
                'Chat with your agent',
                '$20 AI credits/month included',
              ].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro — highlighted */}
          <div className="relative rounded-2xl border border-indigo-500/50 bg-gradient-to-b from-indigo-500/10 to-zinc-900/50 p-8">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold">
                Most popular
              </span>
            </div>
            <p className="text-sm font-semibold text-indigo-300 mb-2">Pro</p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-bold">$99</span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
            <p className="text-zinc-400 text-sm mb-8">For teams serious about growing without headcount.</p>
            <a href={appUrl} className="block w-full text-center px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity mb-8 shadow-lg shadow-indigo-500/20">
              Start free trial
            </a>
            <ul className="space-y-3 text-sm text-zinc-300">
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
                <li key={f} className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center mt-8 text-sm text-zinc-500">
          All plans include a 14-day free trial. No credit card required.{' '}
          <a href="mailto:hello@kodi.so" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Need something custom? Talk to us →
          </a>
        </p>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-20 max-w-4xl mx-auto text-center">
        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Stop managing leads.<br />Start closing them.
          </h2>
          <p className="text-zinc-400 mb-2 max-w-xl mx-auto">
            Your team deserves an AI agent that actually understands your business.
            Kodi is ready in under 5 minutes.
          </p>
          <p className="text-zinc-600 text-sm mb-8">No engineers required. No configuration. No nonsense.</p>
          <a
            href={appUrl}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/25 text-sm"
          >
            Get your agent — free for 14 days →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800 px-6 py-10 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">K</span>
            </div>
            <span className="text-zinc-400 text-sm">Kodi</span>
          </div>
          <p className="text-zinc-600 text-sm">
            © {new Date().getFullYear()} Kodi. Built for small teams that want to win.
          </p>
          <div className="flex items-center gap-6 text-sm text-zinc-600">
            <a href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
            <a href="mailto:hello@kodi.so" className="hover:text-zinc-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  )
}
