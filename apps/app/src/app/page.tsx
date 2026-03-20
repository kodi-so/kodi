import { Button } from '@kodi/ui'

export default function AppPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-6">Kodi App</h1>
        <p className="text-lg text-muted-foreground mb-8">Sign in to get started.</p>
        <div className="flex gap-4 justify-center">
          <Button size="lg">Sign In</Button>
          <Button size="lg" variant="outline">Create Account</Button>
        </div>
      </div>
    </main>
  )
}
