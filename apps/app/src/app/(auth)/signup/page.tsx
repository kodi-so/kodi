'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'
import { Separator } from '@kodi/ui/components/separator'
import { signIn, signUp } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
import { GoogleAuthButton } from '@/components/google-auth-button'

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get('redirect')
  const onboardingUrl = redirectParam
    ? `/onboarding?redirect=${encodeURIComponent(redirectParam)}`
    : '/onboarding'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError('')

    try {
      await signIn.social({ provider: 'google', callbackURL: onboardingUrl })
    } catch {
      setError('Google sign-up failed. Try again.')
      setGoogleLoading(false)
    }
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signUp.email({
        name,
        email,
        password,
        callbackURL: onboardingUrl,
      })

      if (result?.error) {
        setError(result.error.message ?? 'We could not create your account.')
        setLoading(false)
        return
      }

      router.push(onboardingUrl)
    } catch {
      setError('We could not create your account. Try again.')
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Create account"
      description="Start with one workspace and add the tools Kodi can use."
      footer={
        <>
          By continuing, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
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

      <form onSubmit={handleSignUp} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jane Smith"
          />
        </div>

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
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
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
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  )
}
