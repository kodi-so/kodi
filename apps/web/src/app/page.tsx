import { Badge, BrandLogo, Button, Card, CardContent } from '@kodi/ui'

const integrations = [
  'Zoom',
  'Google Meet',
  'Slack',
  'Linear',
  'Notion',
  'HubSpot',
]

const steps = [
  {
    title: 'Connect your tools',
    body: 'Give Kodi access to the meetings, docs, chat, and systems your team already uses.',
  },
  {
    title: 'Bring Kodi into the room',
    body: 'Kodi listens, answers questions with live context, and captures decisions while the call is happening.',
  },
  {
    title: 'Let work keep moving',
    body: 'Kodi drafts or completes follow-up in the tools you connected, based on the autonomy rules you set.',
  },
]

const capabilities = [
  'Capture decisions, owners, and blockers during the meeting',
  'Answer questions using connected company context',
  'Draft recaps, tasks, updates, and docs automatically',
  'Complete approved work inside the systems your team already uses',
]

const autonomyLevels = [
  {
    name: 'Suggest',
    body: 'Kodi prepares the work. Your team reviews and sends it.',
  },
  {
    name: 'Ask first',
    body: 'Kodi can act, but only after a person approves each step.',
  },
  {
    name: 'Run inside policy',
    body: 'Kodi completes defined work on its own within the limits you set.',
  },
]

export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between border-b border-border pb-5">
          <BrandLogo size={34} />

          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <a href="mailto:hello@kodi.so">Book demo</a>
            </Button>
            <Button asChild>
              <a href={appUrl}>Start free trial</a>
            </Button>
          </div>
        </nav>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)] lg:py-20">
          <div className="space-y-6">
            <Badge variant="outline" className="w-fit">
              Built for startups and SMB teams
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Meetings should end with work already moving.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Kodi joins the conversation, keeps the team aligned, and carries
                follow-through into the tools your business already runs on.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <a href={appUrl}>Start free trial</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="mailto:hello@kodi.so">Book demo</a>
              </Button>
            </div>

            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <li>No extra workflow to learn</li>
              <li>Control how much Kodi can do</li>
              <li>Launch with the tools you already use</li>
            </ul>
          </div>

          <Card>
            <CardContent className="space-y-6 p-6">
              <div className="space-y-1">
                <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
                  Weekly operating review
                </p>
                <h2 className="text-2xl tracking-tight">
                  Kodi is handling the follow-up
                </h2>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl bg-secondary p-4">
                  <p className="text-sm text-muted-foreground">
                    During the meeting
                  </p>
                  <p className="mt-2 text-base leading-7 text-foreground">
                    Decisions captured. Owners assigned. Open questions answered
                    from live company context.
                  </p>
                </div>

                <div className="rounded-xl bg-secondary p-4">
                  <p className="text-sm text-muted-foreground">
                    After the meeting
                  </p>
                  <ul className="mt-2 space-y-2 text-base text-foreground">
                    <li>Linear tasks drafted</li>
                    <li>Slack summary ready</li>
                    <li>Notion doc updated</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {integrations.map((integration) => (
                  <span
                    key={integration}
                    className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
                  >
                    {integration}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6 border-t border-border py-12">
          <div className="space-y-2">
            <h2 className="text-3xl tracking-tight">How Kodi works</h2>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Keep the setup simple. Kodi connects to the systems your team
              already trusts.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <Card key={step.title}>
                <CardContent className="space-y-4 p-5">
                  <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
                    Step {index + 1}
                  </p>
                  <div className="space-y-2">
                    <h3 className="text-xl tracking-tight">{step.title}</h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 border-t border-border py-12 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-4">
            <h2 className="text-3xl tracking-tight">
              What teams hand off to Kodi
            </h2>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Kodi is not just a note taker. It helps the team think clearly,
              then takes operational work off their plate.
            </p>

            <ul className="space-y-3">
              {capabilities.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-border bg-card px-4 py-4 text-base leading-7 text-foreground"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h3 className="text-2xl tracking-tight">You stay in control</h3>
              <p className="text-sm leading-7 text-muted-foreground">
                Teams choose how much autonomy Kodi gets. Start with review,
                then expand when the team is ready.
              </p>

              <div className="space-y-3">
                {autonomyLevels.map((level) => (
                  <div key={level.name} className="rounded-xl bg-secondary p-4">
                    <p className="text-base text-foreground">{level.name}</p>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">
                      {level.body}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="border-t border-border py-12">
          <Card>
            <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <h2 className="text-3xl tracking-tight">
                  Bring Kodi into your next working session
                </h2>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  Start simple, connect the tools that matter, and let Kodi take
                  on more of the operational load over time.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <a href={appUrl}>Start free trial</a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="mailto:hello@kodi.so">Book demo</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
