'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'
import { Separator } from '@kodi/ui/components/separator'
import { authClient } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
import { GoogleAuthButton } from '@/components/google-auth-button'
import { Mail } from 'lucide-react'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/chat'

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError('')
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: redirectTo })
    } catch {
      setError('Google sign-in failed. Try again.')
      setGoogleLoading(false)
    }
  }

  async function handleMagicLink(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const result = await authClient.signIn.magicLink({
      email,
      callbackURL: redirectTo,
    })

    if (result?.error) {
      setError(result.error.message ?? 'Could not send sign-in link. Try again.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        description={`We sent a sign-in link to ${email}`}
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 border border-indigo-500/20">
            <Mail className="h-6 w-6 text-indigo-400" />
          </div>
          <p className="text-sm text-muted-foreground">
            Click the link in the email to sign in. It expires in 10 minutes.
          </p>
          <button
            type="button"
            onClick={() => { setSent(false); setEmail('') }}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Use a different email
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Sign in" description="Access your Kodi workspace.">
      <GoogleAuthButton
        disabled={googleLoading || loading}
        loading={googleLoading}
        onClick={handleGoogleSignIn}
      >
        Continue with Google
      </GoogleAuthButton>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          or
        </span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleMagicLink} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full"
        >
          {loading ? 'Sending link...' : 'Continue with email'}
        </Button>
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
