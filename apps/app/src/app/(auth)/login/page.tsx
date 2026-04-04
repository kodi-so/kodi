'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  Separator,
} from '@kodi/ui'
import { signIn } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
import { GoogleAuthButton } from '@/components/google-auth-button'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError('')

    try {
      await signIn.social({ provider: 'google', callbackURL: redirectTo })
    } catch {
      setError('Google sign-in failed. Try again.')
      setGoogleLoading(false)
    }
  }

  async function handleEmailSignIn(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL: redirectTo,
      })

      if (result?.error) {
        setError(result.error.message ?? 'Email or password is incorrect.')
        setLoading(false)
        return
      }

      router.push(redirectTo)
    } catch {
      setError('We could not sign you in. Try again.')
      setLoading(false)
    }
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

      <form onSubmit={handleEmailSignIn} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
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
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New to Kodi?{' '}
        <Link
          href="/signup"
          className="text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
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
