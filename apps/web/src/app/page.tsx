import Image from 'next/image'
import { Badge, Button, Card, CardContent } from '@kodi/ui'

const connectedTools = [
  'Google Meet',
  'Zoom',
  'Slack',
  'Linear',
  'Jira',
  'Notion',
  'HubSpot',
  'Gmail',
]

const proofCards = [
  {
    title: 'Stay inside the conversation',
    body: 'Kodi joins the meeting, captures decisions, and answers with live business context while the room is still deciding what matters.',
  },
  {
    title: 'Delegate more over time',
    body: 'Start with summaries and drafts, then let Kodi take on approvals, updates, and repeatable operational work as trust grows.',
  },
  {
    title: 'Execute through your actual stack',
    body: 'Kodi works through the tools and accounts your team already uses, so follow-through lands where the work already lives.',
  },
]

const autonomyModes = [
  {
    mode: 'Observe',
    detail:
      'Capture decisions, owners, blockers, and next steps without writing anywhere yet.',
  },
  {
    mode: 'Prepare',
    detail:
      'Draft tickets, updates, recaps, and docs so the team can review before anything goes out.',
  },
  {
    mode: 'Approve',
    detail:
      'Route sensitive actions through approvals so Kodi can execute with a clear audit trail.',
  },
  {
    mode: 'Execute',
    detail:
      'Let Kodi complete trusted classes of work autonomously within the guardrails you set.',
  },
]

const operatorFlow = [
  {
    step: '01',
    title: 'Bring Kodi into the room',
    body: 'Meetings, chat, docs, CRM, ticketing, and internal tools become one context layer Kodi can reason over.',
  },
  {
    step: '02',
    title: 'Let Kodi organize the operating picture',
    body: 'It identifies decisions, owners, risks, open loops, and answers the hard question before the room moves on.',
  },
  {
    step: '03',
    title: 'Choose how the work moves forward',
    body: 'Kodi can draft, request approval, or execute next steps directly inside the systems your team already trusts.',
  },
]

const fitCards = [
  {
    label: 'Founders',
    body: 'Spend less time routing every follow-up yourself and more time on system-level decisions.',
  },
  {
    label: 'Operations leaders',
    body: 'Turn recurring meetings into reliable execution systems without adding another process layer to maintain.',
  },
  {
    label: 'Team leads',
    body: 'Keep the team aligned with clearer ownership, fewer dropped decisions, and faster operational follow-through.',
  },
]

const trustPoints = [
  'Control exactly which accounts Kodi can use',
  'Set which actions need review and which can run automatically',
  'Keep execution visible with approvals, status, and clear audit trails',
]

export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <div className="relative min-h-screen overflow-hidden text-[#223239]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(223,174,86,0.2),transparent_34%),radial-gradient(circle_at_85%_12%,rgba(111,168,140,0.16),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0))]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-5rem] top-28 h-52 w-52 rounded-full bg-[#DFAE56]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-6rem] top-40 h-72 w-72 rounded-full bg-[#6FA88C]/18 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(62,80,86,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(62,80,86,0.06)_1px,transparent_1px)] bg-[size:88px_88px] opacity-50 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.4),transparent_78%)]"
      />

      <header className="sticky top-0 z-50 border-b border-[#C9D2D4]/70 bg-[#F6F4EE]/88 backdrop-blur-xl">
        <div className="mx-auto flex w-[min(1160px,calc(100vw-1.5rem))] items-center justify-between gap-4 py-4">
          <a
            href="#top"
            aria-label="Kodi home"
            className="flex items-center gap-3"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80 shadow-[0_14px_30px_rgba(34,50,57,0.08)]">
              <Image
                src="/brand/kodi-logo.png"
                alt=""
                width={40}
                height={40}
                className="h-auto w-8 object-contain"
                priority
              />
            </span>
            <span className="text-[1.4rem] tracking-[-0.06em] text-[#223239]">
              Kodi
            </span>
          </a>

          <nav className="hidden items-center gap-8 text-sm text-[#52656b] lg:flex">
            <a href="#why" className="transition hover:text-[#223239]">
              Why Kodi
            </a>
            <a href="#autonomy" className="transition hover:text-[#223239]">
              Autonomy
            </a>
            <a href="#workflow" className="transition hover:text-[#223239]">
              Workflow
            </a>
            <a href="#start" className="transition hover:text-[#223239]">
              Start
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="mailto:hello@kodi.so"
              className="hidden text-sm text-[#52656b] transition hover:text-[#223239] sm:inline-flex"
            >
              Book a walkthrough
            </a>
            <Button
              asChild
              className="rounded-full bg-[#DFAE56] px-5 text-[#223239] shadow-[0_18px_30px_rgba(223,174,86,0.28)] hover:bg-[#e7bb68]"
            >
              <a href={appUrl}>Start free</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative pb-14 pt-10 sm:pb-20 sm:pt-16">
          <div className="mx-auto grid w-[min(1160px,calc(100vw-1.5rem))] gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] lg:items-center">
            <div className="relative z-10">
              <Badge className="rounded-full border border-[#DFAE56]/35 bg-white/80 px-4 py-2 text-[#6b5225] shadow-sm">
                Built for startups and SMB teams
              </Badge>

              <p className="mt-6 text-xs uppercase tracking-[0.22em] text-[#6b7f85]">
                Meetings, execution, and controlled autonomy
              </p>

              <h1 className="mt-4 max-w-[11ch] text-[clamp(3.35rem,8vw,6.4rem)] leading-[0.93] tracking-[-0.07em] text-[#223239]">
                Let Kodi organize the work, then take it off your plate.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#496067] sm:text-[1.15rem]">
                Kodi joins meetings, answers with live business context, and
                can prepare or execute the follow-through inside the tools and
                accounts your team already trusts. You decide where it drafts,
                where it asks, and where it just gets it done.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[#223239] px-7 text-[#F6F4EE] hover:bg-[#2a3d43]"
                >
                  <a href={appUrl}>Start your trial</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-[#9db0b4] bg-white/70 px-7 text-[#223239] hover:bg-white"
                >
                  <a href="mailto:hello@kodi.so">Book a walkthrough</a>
                </Button>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-white/80 bg-white/72 p-4 shadow-[0_16px_36px_rgba(34,50,57,0.08)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#72858a]">
                    Set up
                  </p>
                  <p className="mt-3 text-base leading-7 text-[#223239]">
                    Connect the stack you already run the business on.
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/72 p-4 shadow-[0_16px_36px_rgba(34,50,57,0.08)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#72858a]">
                    Control
                  </p>
                  <p className="mt-3 text-base leading-7 text-[#223239]">
                    Choose exactly what Kodi can draft, route, or execute.
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/72 p-4 shadow-[0_16px_36px_rgba(34,50,57,0.08)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#72858a]">
                    Outcome
                  </p>
                  <p className="mt-3 text-base leading-7 text-[#223239]">
                    Give your team more space for bigger-picture thinking.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-4 top-10 hidden h-14 w-14 rounded-full bg-white/70 shadow-[0_20px_45px_rgba(34,50,57,0.12)] lg:block" />
              <div className="absolute -right-4 bottom-10 hidden h-16 w-16 rounded-full bg-[#DFAE56]/18 blur-md lg:block" />

              <div className="rounded-[2.3rem] border border-[#314247]/10 bg-[#223239] p-5 text-[#F6F4EE] shadow-[0_36px_80px_rgba(34,50,57,0.22)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#A6B7BA]">
                      Weekly operating review
                    </p>
                    <h2 className="mt-3 text-[2rem] leading-none tracking-[-0.05em]">
                      Kodi is already moving the work.
                    </h2>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs text-[#F6F4EE]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#6FA88C] shadow-[0_0_0_7px_rgba(111,168,140,0.16)]" />
                    Live
                  </div>
                </div>

                <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-white/6 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#E7C27A]">
                    Conversation captured
                  </p>
                  <p className="mt-3 text-xl leading-8 text-[#F6F4EE]">
                    3 decisions, 2 risks, and 4 next actions are already mapped
                    before the meeting ends.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[1.15rem] bg-black/14 px-4 py-3">
                      <p className="text-sm text-[#F6F4EE]">Linear</p>
                      <p className="mt-1 text-xs text-[#A6B7BA]">
                        Tickets drafted
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] bg-black/14 px-4 py-3">
                      <p className="text-sm text-[#F6F4EE]">Slack</p>
                      <p className="mt-1 text-xs text-[#A6B7BA]">
                        Recap queued
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] bg-black/14 px-4 py-3">
                      <p className="text-sm text-[#F6F4EE]">Notion</p>
                      <p className="mt-1 text-xs text-[#A6B7BA]">
                        Plan updated
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[1.6rem] border border-white/10 bg-black/14 p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#A6B7BA]">
                      What the team asked
                    </p>
                    <p className="mt-3 text-lg leading-8 text-[#F6F4EE]">
                      “Can we still launch Friday if payments QA slips again?”
                    </p>
                    <p className="mt-4 text-sm leading-7 text-[#C7D3D6]">
                      Kodi pulls sprint load, blocker history, and ownership
                      from connected systems, then recommends moving analytics
                      cleanup while it drafts the launch-risk update.
                    </p>
                  </div>

                  <div className="rounded-[1.6rem] border border-[#DFAE56]/20 bg-[linear-gradient(180deg,rgba(223,174,86,0.22),rgba(223,174,86,0.08))] p-5 text-[#223239]">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#6b5225]">
                      Delegation state
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-[1.1rem] bg-white/70 px-4 py-3">
                        <p className="text-sm">Draft launch tasks</p>
                        <p className="mt-1 text-xs text-[#6d7a7e]">
                          Auto-prepared
                        </p>
                      </div>
                      <div className="rounded-[1.1rem] bg-white/70 px-4 py-3">
                        <p className="text-sm">Send owner recap</p>
                        <p className="mt-1 text-xs text-[#6d7a7e]">
                          Awaiting approval
                        </p>
                      </div>
                      <div className="rounded-[1.1rem] bg-white/70 px-4 py-3">
                        <p className="text-sm">Update rollout doc</p>
                        <p className="mt-1 text-xs text-[#6d7a7e]">
                          Approved for auto-execution
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {connectedTools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5 text-xs text-[#D7E1E3]"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="why"
          className="border-y border-[#C9D2D4]/60 bg-white/48 py-5 backdrop-blur-sm"
        >
          <div className="mx-auto flex w-[min(1160px,calc(100vw-1.5rem))] flex-wrap items-center gap-3 text-sm text-[#52656b]">
            <span className="rounded-full border border-[#C9D2D4] bg-white px-4 py-2 text-[#223239]">
              Shared AI teammate
            </span>
            <span className="rounded-full border border-[#C9D2D4] bg-white px-4 py-2 text-[#223239]">
              Controlled autonomy
            </span>
            <span className="rounded-full border border-[#C9D2D4] bg-white px-4 py-2 text-[#223239]">
              Connected-tool execution
            </span>
            <span className="rounded-full border border-[#C9D2D4] bg-white px-4 py-2 text-[#223239]">
              Real operational follow-through
            </span>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto w-[min(1160px,calc(100vw-1.5rem))]">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.22em] text-[#73878d]">
                Why teams switch
              </p>
              <h2 className="mt-4 text-[clamp(2.5rem,5vw,4.4rem)] leading-[0.97] tracking-[-0.06em] text-[#223239]">
                Kodi is not another note taker and not another dashboard.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#52656b]">
                Lean teams need one system that can stay present in the room,
                keep the context straight, and gradually absorb more of the
                operational detail that normally falls back to humans.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {proofCards.map((card, index) => (
                <Card
                  key={card.title}
                  className={`overflow-hidden rounded-[1.8rem] border-0 ${
                    index === 1
                      ? 'bg-[#223239] text-[#F6F4EE] shadow-[0_28px_70px_rgba(34,50,57,0.18)]'
                      : 'bg-white/76 text-[#223239] shadow-[0_20px_50px_rgba(34,50,57,0.08)]'
                  }`}
                >
                  <CardContent className="p-7">
                    <div
                      className={`h-1.5 w-14 rounded-full ${
                        index === 1 ? 'bg-[#DFAE56]' : 'bg-[#6FA88C]'
                      }`}
                    />
                    <h3 className="mt-6 text-[1.7rem] leading-[1.05] tracking-[-0.05em]">
                      {card.title}
                    </h3>
                    <p
                      className={`mt-4 text-base leading-8 ${
                        index === 1 ? 'text-[#D9E1E3]' : 'text-[#52656b]'
                      }`}
                    >
                      {card.body}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          id="autonomy"
          className="relative overflow-hidden bg-[#223239] py-16 text-[#F6F4EE] sm:py-24"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(223,174,86,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(111,168,140,0.12),transparent_24%)]"
          />
          <div className="mx-auto grid w-[min(1160px,calc(100vw-1.5rem))] gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-[0.22em] text-[#A6B7BA]">
                Autonomy you control
              </p>
              <h2 className="mt-4 max-w-[11ch] text-[clamp(2.5rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.06em]">
                Kodi grows from organizer to operator at your pace.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#C7D3D6]">
                The brand promise is not “trust the black box.” It is completed
                work at the autonomy level you choose, with explicit control
                over what Kodi can and cannot do.
              </p>

              <div className="mt-8 space-y-3">
                {trustPoints.map((point) => (
                  <div
                    key={point}
                    className="rounded-[1.25rem] border border-white/10 bg-white/6 px-5 py-4 text-sm text-[#E4ECEE]"
                  >
                    {point}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 grid gap-4 md:grid-cols-2">
              {autonomyModes.map((mode, index) => (
                <div
                  key={mode.mode}
                  className={`rounded-[1.8rem] border p-6 ${
                    index === autonomyModes.length - 1
                      ? 'border-[#DFAE56]/30 bg-[linear-gradient(180deg,rgba(223,174,86,0.24),rgba(223,174,86,0.08))] text-[#223239]'
                      : 'border-white/10 bg-white/7'
                  }`}
                >
                  <p
                    className={`text-xs uppercase tracking-[0.2em] ${
                      index === autonomyModes.length - 1
                        ? 'text-[#7a6030]'
                        : 'text-[#9fb1b5]'
                    }`}
                  >
                    Level {index + 1}
                  </p>
                  <h3 className="mt-4 text-[1.75rem] tracking-[-0.05em]">
                    {mode.mode}
                  </h3>
                  <p
                    className={`mt-4 text-base leading-8 ${
                      index === autonomyModes.length - 1
                        ? 'text-[#314247]'
                        : 'text-[#D0DBDD]'
                    }`}
                  >
                    {mode.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="py-16 sm:py-24">
          <div className="mx-auto w-[min(1160px,calc(100vw-1.5rem))]">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.22em] text-[#73878d]">
                How Kodi works
              </p>
              <h2 className="mt-4 text-[clamp(2.4rem,5vw,4.1rem)] leading-[0.99] tracking-[-0.06em] text-[#223239]">
                Move from conversation to execution without inventing a new
                workflow.
              </h2>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {operatorFlow.map((item) => (
                <div
                  key={item.step}
                  className="rounded-[1.7rem] border border-[#C9D2D4] bg-white/78 p-6 shadow-[0_20px_45px_rgba(34,50,57,0.08)]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#DFAE56] text-sm font-semibold text-[#223239]">
                    {item.step}
                  </div>
                  <h3 className="mt-5 text-[1.8rem] leading-[1.03] tracking-[-0.05em] text-[#223239]">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-base leading-8 text-[#52656b]">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {fitCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-[1.5rem] border border-[#D8E0E2] bg-[#F0ECE1]/72 p-6"
                >
                  <p className="text-sm uppercase tracking-[0.18em] text-[#6f8287]">
                    {card.label}
                  </p>
                  <p className="mt-4 text-base leading-8 text-[#314247]">
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-10">
          <div className="mx-auto w-[min(1160px,calc(100vw-1.5rem))] rounded-[2.2rem] border border-[#C9D2D4] bg-white/78 p-7 shadow-[0_24px_60px_rgba(34,50,57,0.08)] sm:p-9">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[#73878d]">
                  Works through your stack
                </p>
                <h2 className="mt-4 text-[clamp(2.1rem,4vw,3.2rem)] leading-[1] tracking-[-0.06em] text-[#223239]">
                  The systems your team already trusts become Kodi’s operating
                  surface.
                </h2>
                <p className="mt-5 text-base leading-8 text-[#52656b]">
                  Meetings, messaging, docs, ticketing, CRM, and internal tools
                  all stay in play. Kodi fits the stack your business already
                  runs on instead of asking everyone to adopt a brand-new home
                  for work.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {connectedTools.map((tool, index) => (
                  <div
                    key={tool}
                    className={`rounded-[1.25rem] border px-4 py-4 text-sm ${
                      index % 3 === 0
                        ? 'border-[#DFAE56]/30 bg-[#fff6e4] text-[#6d5323]'
                        : 'border-[#D8E0E2] bg-[#fbfaf7] text-[#314247]'
                    }`}
                  >
                    {tool}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="start" className="py-16 sm:py-24">
          <div className="mx-auto w-[min(1160px,calc(100vw-1.5rem))] rounded-[2.4rem] bg-[#223239] px-6 py-8 text-[#F6F4EE] shadow-[0_36px_80px_rgba(34,50,57,0.2)] sm:px-10 sm:py-12">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[#A6B7BA]">
                  Ready for a real workload
                </p>
                <h2 className="mt-4 max-w-[12ch] text-[clamp(2.4rem,5vw,4.2rem)] leading-[0.98] tracking-[-0.06em]">
                  Put Kodi in your next meeting and let it carry more of the
                  follow-through.
                </h2>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-[#D0DBDD]">
                  Give your team a shared agent that can listen, clarify,
                  prepare, and execute the work that normally gets stuck in the
                  handoff between discussion and delivery.
                </p>
              </div>

              <div className="grid gap-3 sm:min-w-[16rem]">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[#DFAE56] text-[#223239] hover:bg-[#e8bf70]"
                >
                  <a href={appUrl}>Start your trial</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-white/18 bg-white/6 text-[#F6F4EE] hover:bg-white/12"
                >
                  <a href="mailto:hello@kodi.so">Book a walkthrough</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="pb-10">
        <div className="mx-auto flex w-[min(1160px,calc(100vw-1.5rem))] flex-col gap-4 border-t border-[#C9D2D4]/80 pt-6 text-sm text-[#607379] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/kodi-logo.png"
              alt=""
              width={28}
              height={28}
              className="h-auto w-7 object-contain"
            />
            <span className="text-[#223239]">Kodi</span>
          </div>
          <p>
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span>{' '}
            Kodi. The AI teammate that turns conversations into completed work.
          </p>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="transition hover:text-[#223239]">
              Privacy
            </a>
            <a href="/terms" className="transition hover:text-[#223239]">
              Terms
            </a>
            <a
              href="mailto:hello@kodi.so"
              className="transition hover:text-[#223239]"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
