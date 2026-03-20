import { Button } from '@kodi/ui'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-4xl text-center">
        <h1 className="text-6xl font-bold tracking-tight mb-6">Welcome to Kodi</h1>
        <p className="text-xl text-muted-foreground mb-10">The platform built for modern teams.</p>
        <div className="flex gap-4 justify-center">
          <Button size="lg" asChild>
            <a href={process.env.NEXT_PUBLIC_APP_URL ?? '#'}>Get Started</a>
          </Button>
          <Button size="lg" variant="outline">Learn More</Button>
        </div>
      </div>
    </main>
  )
}
