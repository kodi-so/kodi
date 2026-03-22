export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Background grid pattern */}
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
      {/* Radial glow */}
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
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="/docs" className="hover:text-white transition-colors">Docs</a>
        </div>
        <a
          href={appUrl}
          className="text-sm px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-100 transition-colors"
        >
          Get Started
        </a>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-32 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Now in public beta — free to try
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          The platform your{' '}
          <span
            className="animate-gradient"
            style={{
              background: 'linear-gradient(135deg, #818cf8, #a78bfa, #f472b6, #818cf8)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradient-shift 4s ease infinite',
            }}
          >
            team deserves
          </span>
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mb-10 leading-relaxed">
          Kodi brings your team's projects, docs, and conversations into one beautifully unified workspace.
          Ship faster. Stay aligned. Do your best work.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <a
            href={appUrl}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/25 text-sm"
          >
            Get Started for free →
          </a>
          <a
            href="#features"
            className="px-8 py-3.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm"
          >
            Learn More
          </a>
        </div>

        <p className="mt-6 text-xs text-zinc-600">No credit card required · Setup in under 2 minutes</p>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Everything your team needs</h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Built for speed. Designed for clarity. Trusted by teams that ship.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="relative group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 hover:border-indigo-500/50 transition-all duration-300">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Unified Project Hub</h3>
              <p className="text-zinc-400 leading-relaxed text-sm">
                Manage tasks, milestones, and sprints from one command center. Real-time updates keep everyone
                on the same page — no more context-switching between tools.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Kanban', 'Sprints', 'Timelines'].map(tag => (
                  <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="relative group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 hover:border-purple-500/50 transition-all duration-300">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Living Documentation</h3>
              <p className="text-zinc-400 leading-relaxed text-sm">
                Write docs that stay in sync with your work. Embed live data, link to tasks, and let your
                knowledge base grow organically alongside your product.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Rich Editor', 'AI Assist', 'Version History'].map(tag => (
                  <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="relative group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 hover:border-pink-500/50 transition-all duration-300">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Team Insights & Analytics</h3>
              <p className="text-zinc-400 leading-relaxed text-sm">
                Understand how your team works with velocity charts, cycle time breakdowns, and burndown trends.
                Spot blockers early and celebrate wins together.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Velocity', 'Cycle Time', 'Reports'].map(tag => (
                  <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Simple, honest pricing</h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Start for free. Scale when you're ready. No surprise fees, ever.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Free */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <p className="text-sm font-semibold text-zinc-400 mb-2">Free</p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
            <p className="text-zinc-500 text-sm mb-8">Perfect for individuals and small teams getting started.</p>
            <a href={appUrl} className="block w-full text-center px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-medium hover:border-zinc-500 hover:text-white transition-colors mb-8">
              Get started free
            </a>
            <ul className="space-y-3 text-sm text-zinc-400">
              {['Up to 5 members', '3 active projects', '5 GB storage', 'Basic analytics', 'Community support'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <span className="text-4xl font-bold">$18</span>
              <span className="text-zinc-500 text-sm">/month per seat</span>
            </div>
            <p className="text-zinc-400 text-sm mb-8">For growing teams that need more power and collaboration.</p>
            <a href={appUrl} className="block w-full text-center px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity mb-8 shadow-lg shadow-indigo-500/20">
              Start Pro trial
            </a>
            <ul className="space-y-3 text-sm text-zinc-300">
              {['Unlimited members', 'Unlimited projects', '100 GB storage', 'Advanced analytics', 'Priority support', 'AI writing assistant', 'Custom integrations'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Enterprise */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <p className="text-sm font-semibold text-zinc-400 mb-2">Enterprise</p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-bold">Custom</span>
            </div>
            <p className="text-zinc-500 text-sm mb-8">For large organizations with advanced security and compliance needs.</p>
            <a href="mailto:sales@kodi.io" className="block w-full text-center px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-medium hover:border-zinc-500 hover:text-white transition-colors mb-8">
              Contact sales
            </a>
            <ul className="space-y-3 text-sm text-zinc-400">
              {['Everything in Pro', 'SSO & SAML', 'Audit logs', 'Dedicated support', 'SLA guarantee', 'Custom contracts', 'On-premise option'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative z-10 px-6 py-20 max-w-4xl mx-auto text-center">
        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Ready to transform how your team works?
          </h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            Join thousands of teams already building faster with Kodi. It only takes two minutes to get started.
          </p>
          <a
            href={appUrl}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/25 text-sm"
          >
            Start for free — no card required →
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
            © {new Date().getFullYear()} Kodi. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-zinc-600">
            <a href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
            <a href="mailto:hello@kodi.io" className="hover:text-zinc-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
